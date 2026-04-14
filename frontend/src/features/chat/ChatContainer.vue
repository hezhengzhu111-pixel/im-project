<template>
  <div class="chat-container">
    <ChatSidebarPanel
      :active-tab="activeTab"
      :sessions="chatStore.sortedSessions"
      :current-session-id="currentSession?.id"
      :friends="chatStore.friends"
      :groups="chatStore.groups"
      :pending-requests-count="pendingRequestsCount"
      :total-unread-count="chatStore.totalUnreadCount"
      :is-chat-active-on-mobile="isChatActiveOnMobile"
      @change-tab="handleTabChange"
      @select-session="selectSession"
      @start-private-chat="startChat"
      @start-group-chat="startGroupChat"
      @open-add-friend="showAddFriend = true"
      @open-create-group="showCreateGroup = true"
      @open-settings="$router.push('/settings')"
    />

    <div class="chat-main" :class="{ 'active-mobile': isChatActiveOnMobile }">
      <div v-if="!currentSession" class="chat-welcome">
        <div class="welcome-content">
          <el-icon :size="60" color="#dcdfe6"><ChatDotRound /></el-icon>
          <p>微信，连接你我他</p>
        </div>
      </div>

      <div v-else class="chat-content">
        <div class="chat-header">
          <div class="mobile-back" @click="chatStore.clearCurrentSession()">
            <el-icon><ArrowLeft /></el-icon>
          </div>
          <div class="chat-title">
            <div class="chat-title-main">
              {{ currentSession.targetName }}
              <span v-if="currentSession.type === 'group'">
                ({{ currentSession.memberCount || 0 }})
              </span>
            </div>
            <div
              v-if="currentSession.type === 'private'"
              class="chat-presence"
              :class="{ online: currentSessionOnline }"
            >
              {{ currentSessionOnline ? "在线" : "离线" }}
            </div>
          </div>
          <div class="chat-actions">
            <el-dropdown trigger="click" @command="handleSessionAction">
              <el-button link :icon="MoreFilled" aria-label="更多选项" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="clear-history">
                    清空聊天记录
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <ChatMessageList
          :messages="chatStore.currentMessages"
          :current-user-id="String(userStore.userId)"
          :current-user-name="userStore.userInfo?.username || userStore.nickname"
          :current-user-avatar="userStore.avatar"
          @request-history="loadMoreHistory"
          @mark-read="tryAckRead"
          @show-group-readers="openGroupReadDialog"
        />

        <ChatComposer
          :disabled="!currentSession"
          @send-text="sendTextMessage"
          @send-media="sendMediaMessage"
        />
      </div>
    </div>

    <ChatDialogs
      v-model:visible-add-friend="showAddFriend"
      v-model:visible-create-group="showCreateGroup"
      v-model:visible-group-read-dialog="showGroupReadDialog"
      :group-read-users="groupReadUsers"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ArrowLeft, ChatDotRound, MoreFilled } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import ChatComposer from "@/features/chat/ChatComposer.vue";
import ChatDialogs from "@/features/chat/ChatDialogs.vue";
import ChatMessageList from "@/features/chat/ChatMessageList.vue";
import ChatSidebarPanel from "@/features/chat/ChatSidebarPanel.vue";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { useChatStore } from "@/stores/chat";
import { useUserStore } from "@/stores/user";
import { useWebSocketStore } from "@/stores/websocket";
import type { Friend, Group, GroupReadUser, Message } from "@/types";

const userStore = useUserStore();
const chatStore = useChatStore();
const webSocketStore = useWebSocketStore();
const { capture } = useErrorHandler("chat-container");
const activeTab = ref<"chat" | "contacts" | "groups">("chat");
const showAddFriend = ref(false);
const showCreateGroup = ref(false);
const showGroupReadDialog = ref(false);
const groupReadUsers = ref<GroupReadUser[]>([]);
const loadingMoreHistory = ref(false);

const currentSession = computed(() => chatStore.currentSession);
const pendingRequestsCount = computed(() => {
  return chatStore.friendRequests.filter((item) => item.status === "PENDING").length;
});
const isChatActiveOnMobile = computed(() => Boolean(currentSession.value));
const currentSessionOnline = computed(() => {
  if (currentSession.value?.type !== "private") {
    return false;
  }
  return webSocketStore.isUserOnline(String(currentSession.value.targetId || ""));
});

const handleTabChange = (tabName: "chat" | "contacts" | "groups") => {
  activeTab.value = tabName;
};

const selectSession = async (session: NonNullable<typeof currentSession.value>) => {
  await chatStore.setCurrentSession(session);
  await chatStore.markAsRead(session.id);
};

const startChat = async (contact: Friend) => {
  const session = await chatStore.openPrivateSession({
    targetId: contact.friendId,
    targetName:
      contact.remark || contact.nickname || contact.username || contact.friendId,
    targetAvatar: contact.avatar,
  });
  if (session) {
    activeTab.value = "chat";
  }
};

const startGroupChat = async (group: Group) => {
  const session = await chatStore.openGroupSession(group);
  if (session) {
    activeTab.value = "chat";
  }
};

const handleSessionAction = async (command: string | number | object) => {
  if (command !== "clear-history" || !currentSession.value?.id) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定清空与“${currentSession.value.targetName}”的聊天记录吗？`,
      "清空聊天记录",
      {
        type: "warning",
        confirmButtonText: "确定",
        cancelButtonText: "取消",
      },
    );
    await chatStore.clearMessages(currentSession.value.id);
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      capture(error, "清空聊天记录失败");
    }
  }
};

const sendTextMessage = async (content: string) => {
  await chatStore.sendMessage(content, "TEXT");
};

const sendMediaMessage = async (payload: {
  type: "IMAGE" | "FILE" | "VOICE";
  url: string;
  extra?: Record<string, unknown>;
}) => {
  await chatStore.sendMessage(payload.url, payload.type, payload.extra);
};

const loadMoreHistory = async () => {
  if (!currentSession.value?.id || loadingMoreHistory.value) {
    return;
  }
  loadingMoreHistory.value = true;
  try {
    await chatStore.loadMessages(currentSession.value.id, 1, 20);
  } finally {
    loadingMoreHistory.value = false;
  }
};

const openGroupReadDialog = (message: Message) => {
  const readBy = Array.isArray(message.readBy) ? message.readBy : [];
  const userNameMap = new Map<string, string>();
  const currentUserId = String(userStore.userId || "");
  if (currentUserId) {
    userNameMap.set(
      currentUserId,
      userStore.userInfo?.nickname ||
        userStore.userInfo?.username ||
        userStore.nickname ||
        currentUserId,
    );
  }
  chatStore.friends.forEach((friend) => {
    userNameMap.set(
      friend.friendId,
      friend.remark || friend.nickname || friend.username || friend.friendId,
    );
  });
  chatStore.currentMessages.forEach((item) => {
    if (item.senderName) {
      userNameMap.set(item.senderId, item.senderName);
    }
  });
  groupReadUsers.value = Array.from(new Set(readBy)).map((userId) => ({
    userId,
    displayName: userNameMap.get(userId) || `用户${userId}`,
  }));
  showGroupReadDialog.value = true;
};

const tryAckRead = async () => {
  if (document.hidden || !currentSession.value?.id) {
    return;
  }
  await chatStore.markAsRead(currentSession.value.id);
};

const onFocus = () => void tryAckRead();
const onVisibility = () => {
  if (!document.hidden) {
    void tryAckRead();
  }
};

onMounted(() => {
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
});

onUnmounted(() => {
  window.removeEventListener("focus", onFocus);
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<style scoped lang="scss">
.chat-container {
  display: flex;
  height: 100%;
  background-color: #f5f7fa;
  position: relative;
  overflow: hidden;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  min-width: 0;
}

.chat-welcome {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #909399;
}

.welcome-content {
  text-align: center;
}

.welcome-content p {
  margin-top: 20px;
}

.chat-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  height: 60px;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.chat-title {
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.25;
}

.chat-title-main {
  color: #303133;
}

.chat-presence {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.chat-presence.online {
  color: #67c23a;
}

.mobile-back {
  display: none;
  cursor: pointer;
  margin-right: 10px;
}

@media (max-width: 768px) {
  .chat-main {
    display: none;

    &.active-mobile {
      display: flex;
      width: 100%;
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      z-index: 10;
    }
  }

  .chat-header .mobile-back {
    display: block;
  }
}
</style>
