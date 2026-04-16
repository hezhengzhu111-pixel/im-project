<template>
  <div class="chat-container">
    <ChatSidebarPanel
      class="chat-sidebar"
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
        <div class="welcome-shell">
          <div class="welcome-orb"></div>
          <div class="welcome-card">
            <el-icon class="welcome-icon" :size="60"><ChatDotRound /></el-icon>
            <div class="welcome-title">Bring every conversation together</div>
            <div class="welcome-text">
              Pick a chat on the left, or start a new conversation from contacts or groups.
            </div>
            <div class="welcome-status">
              <span class="connection-dot" :class="connectionStatus"></span>
              <span>{{ connectionStatusLabel }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="chat-content">
        <div class="chat-header">
          <button
            type="button"
            class="mobile-back interactive-reset"
            @click="chatStore.clearCurrentSession()"
          >
            <el-icon><ArrowLeft /></el-icon>
          </button>

          <div class="chat-title">
            <div class="chat-title-main">
              <span class="chat-title-text">{{ currentSession.targetName }}</span>
              <span v-if="currentSession.type === 'group'" class="chat-title-count">
                {{ currentSession.memberCount || 0 }} members
              </span>
            </div>
            <div class="chat-subtitle">
              <span
                v-if="currentSession.type === 'private'"
                class="chat-presence"
                :class="{ online: currentSessionOnline }"
              >
                {{ currentSessionOnline ? "Online now" : "Offline" }}
              </span>
              <span class="connection-pill" :class="connectionStatus">
                {{ connectionStatusLabel }}
              </span>
            </div>
          </div>

          <div class="chat-actions">
            <el-dropdown trigger="click" @command="handleSessionAction">
              <el-button
                link
                :icon="MoreFilled"
                aria-label="More actions"
                class="action-trigger"
              />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="search-messages" data-command="search-messages">
                    Search messages
                  </el-dropdown-item>
                  <el-dropdown-item command="toggle-pin" data-command="toggle-pin">
                    {{ currentSession?.isPinned ? "Unpin conversation" : "Pin conversation" }}
                  </el-dropdown-item>
                  <el-dropdown-item command="toggle-mute" data-command="toggle-mute">
                    {{ currentSession?.isMuted ? "Turn off mute" : "Mute notifications" }}
                  </el-dropdown-item>
                  <el-dropdown-item command="open-session-info" data-command="open-session-info">
                    {{ currentSession?.type === "group" ? "Group info" : "Contact info" }}
                  </el-dropdown-item>
                  <el-dropdown-item command="clear-history" data-command="clear-history">
                    Clear chat history
                  </el-dropdown-item>
                  <el-dropdown-item command="delete-session" data-command="delete-session">
                    Remove from chat list
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
          :loading-history="loadingMoreHistory"
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
      v-model:visible-search-dialog="showSearchDialog"
      v-model:visible-session-info-drawer="showSessionInfoDrawer"
      :current-session="currentSession"
      :group-read-users="groupReadUsers"
      :search-results="chatStore.searchResults"
      :session-info-friend="sessionInfoFriend"
      :session-info-group="sessionInfoGroup"
      :session-info-members="sessionInfoMembers"
      :session-info-loading="sessionInfoLoading"
      :session-info-error="sessionInfoError"
      :private-session-online="currentSessionOnline"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";
import {ArrowLeft, ChatDotRound, MoreFilled} from "@element-plus/icons-vue";
import {ElMessageBox} from "element-plus";
import ChatComposer from "@/features/chat/ChatComposer.vue";
import ChatDialogs from "@/features/chat/ChatDialogs.vue";
import ChatMessageList from "@/features/chat/ChatMessageList.vue";
import ChatSidebarPanel from "@/features/chat/ChatSidebarPanel.vue";
import {useErrorHandler} from "@/hooks/useErrorHandler";
import {groupService} from "@/services/group";
import {useChatStore} from "@/stores/chat";
import {useUserStore} from "@/stores/user";
import {useWebSocketStore} from "@/stores/websocket";
import type {Friend, Group, GroupMember, GroupReadUser, Message} from "@/types";

const userStore = useUserStore();
const chatStore = useChatStore();
const webSocketStore = useWebSocketStore();
const { capture } = useErrorHandler("chat-container");
const activeTab = ref<"chat" | "contacts" | "groups">("chat");
const showAddFriend = ref(false);
const showCreateGroup = ref(false);
const showGroupReadDialog = ref(false);
const showSearchDialog = ref(false);
const showSessionInfoDrawer = ref(false);
const groupReadUsers = ref<GroupReadUser[]>([]);
const sessionInfoMembers = ref<GroupMember[]>([]);
const sessionInfoLoading = ref(false);
const sessionInfoError = ref("");

const currentSession = computed(() => chatStore.currentSession);
const loadingMoreHistory = computed(() => {
  const sessionId = currentSession.value?.id;
  return sessionId ? chatStore.loadingHistoryBySession.get(sessionId) || false : false;
});
const currentSessionHasMoreHistory = computed(() => {
  const sessionId = currentSession.value?.id;
  return sessionId ? chatStore.hasMoreHistoryBySession.get(sessionId) !== false : false;
});
const pendingRequestsCount = computed(() =>
  chatStore.friendRequests.filter((item) => item.status === "PENDING").length,
);
const isChatActiveOnMobile = computed(() => Boolean(currentSession.value));
const currentSessionOnline = computed(() => {
  if (currentSession.value?.type !== "private") {
    return false;
  }
  return webSocketStore.isUserOnline(String(currentSession.value.targetId || ""));
});
const connectionStatus = computed(() => webSocketStore.connectionStatus);
const connectionStatusLabel = computed(() => {
  switch (connectionStatus.value) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    default:
      return "Offline";
  }
});
const sessionInfoFriend = computed(() => {
  if (currentSession.value?.type !== "private") {
    return null;
  }
  return (
    chatStore.friends.find(
      (item) => String(item.friendId) === String(currentSession.value?.targetId),
    ) || null
  );
});
const sessionInfoGroup = computed(() => {
  if (currentSession.value?.type !== "group") {
    return null;
  }
  return (
    chatStore.groups.find(
      (item) => String(item.id) === String(currentSession.value?.targetId),
    ) || {
      id: currentSession.value.targetId,
      groupName: currentSession.value.targetName,
      avatar: currentSession.value.targetAvatar,
      ownerId: "",
      memberCount: currentSession.value.memberCount || 0,
      createTime: "",
    }
  );
});

const handleTabChange = (tabName: "chat" | "contacts" | "groups") => {
  activeTab.value = tabName;
};

const selectSession = async (session: NonNullable<typeof currentSession.value>) => {
  if (currentSession.value?.id === session.id) {
    await chatStore.markAsRead(session.id);
    return;
  }
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
  const session = currentSession.value;
  if (typeof command !== "string" || !session?.id) {
    return;
  }

  try {
    switch (command) {
      case "search-messages":
        showSearchDialog.value = true;
        await chatStore.searchMessages("", session.id);
        return;
      case "toggle-pin":
        chatStore.toggleSessionPinned(session.id);
        return;
      case "toggle-mute":
        chatStore.toggleSessionMuted(session.id);
        return;
      case "open-session-info":
        showSessionInfoDrawer.value = true;
        sessionInfoMembers.value = [];
        sessionInfoError.value = "";
        sessionInfoLoading.value = false;
        if (session.type !== "group") {
          return;
        }
        sessionInfoLoading.value = true;
        try {
          const response = await groupService.getMembers(session.targetId);
          sessionInfoMembers.value = response.data || [];
        } catch (error) {
          sessionInfoError.value = "Failed to load group members.";
          capture(error, "Failed to load group members");
        } finally {
          sessionInfoLoading.value = false;
        }
        return;
      case "clear-history":
        await ElMessageBox.confirm(
          `Clear all messages in ${session.targetName}?`,
          "Clear chat history",
          {
            type: "warning",
            confirmButtonText: "Clear",
            cancelButtonText: "Cancel",
          },
        );
        await chatStore.clearMessages(session.id);
        return;
      case "delete-session":
        await ElMessageBox.confirm(
          `Remove ${session.targetName} from your chat list?`,
          "Remove conversation",
          {
            type: "warning",
            confirmButtonText: "Remove",
            cancelButtonText: "Cancel",
          },
        );
        chatStore.deleteSession(session.id);
        showSearchDialog.value = false;
        showSessionInfoDrawer.value = false;
        return;
      default:
        return;
    }
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      capture(error, "Failed to handle session action");
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
  if (
    !currentSession.value?.id ||
    loadingMoreHistory.value ||
    !currentSessionHasMoreHistory.value
  ) {
    return;
  }
  await chatStore.loadMoreHistory(currentSession.value.id);
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
    displayName: userNameMap.get(userId) || `User ${userId}`,
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
.interactive-reset {
  border: 0;
  background: transparent;
}

.chat-container {
  position: relative;
  display: flex;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 22%),
    linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
}

.chat-sidebar {
  position: relative;
  z-index: 1;
}

.chat-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(18px);
}

.chat-welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
}

.welcome-shell {
  position: relative;
  width: min(100%, 540px);
}

.welcome-orb {
  position: absolute;
  inset: 10% 15%;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.18), transparent 70%);
  filter: blur(30px);
}

.welcome-card {
  position: relative;
  padding: 40px 36px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(226, 232, 240, 0.92);
  box-shadow: 0 30px 70px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.welcome-icon {
  color: #2563eb;
}

.welcome-title {
  margin-top: 18px;
  color: #0f172a;
  font-size: 28px;
  font-weight: 800;
  line-height: 1.2;
}

.welcome-text {
  margin: 12px auto 0;
  max-width: 400px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.8;
}

.welcome-status {
  margin-top: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.connection-dot.connected {
  background: #10b981;
}

.connection-dot.connecting {
  background: #f59e0b;
}

.chat-content {
  display: flex;
  height: 100%;
  flex-direction: column;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 72px;
  padding: 0 22px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.78);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(12px);
}

.chat-title {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-title-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.chat-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #111827;
  font-size: 19px;
  font-weight: 700;
}

.chat-title-count {
  flex-shrink: 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.chat-subtitle {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.chat-presence {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.chat-presence.online {
  color: #10b981;
}

.connection-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 12px;
  font-weight: 700;
}

.connection-pill.connected {
  background: #ecfdf5;
  color: #059669;
}

.connection-pill.connecting {
  background: #fff7ed;
  color: #d97706;
}

.chat-actions {
  display: flex;
  align-items: center;
}

.action-trigger {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  color: #64748b;

  &:hover {
    background: #f1f5f9;
    color: #2563eb;
  }
}

.mobile-back {
  display: none;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  color: #334155;
  cursor: pointer;

  &:hover {
    background: #f1f5f9;
  }
}

@media (max-width: 768px) {
  .chat-main {
    display: none;

    &.active-mobile {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 10;
      display: flex;
      width: 100%;
      height: 100%;
    }
  }

  .chat-header {
    min-height: 64px;
    padding: 0 14px;
  }

  .mobile-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .welcome-card {
    padding: 32px 24px;
  }

  .welcome-title {
    font-size: 24px;
  }
}
</style>
