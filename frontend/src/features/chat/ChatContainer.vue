<template>
  <div class="chat-container">
    <ChatSidebarPanel
      class="chat-shell-sidebar"
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
            <el-icon class="welcome-icon" :size="58"><ChatDotRound /></el-icon>
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
            class="chat-action-button mobile-back interactive-reset"
            @click="chatStore.clearCurrentSession()"
          >
            <el-icon><ArrowLeft /></el-icon>
          </button>

          <div class="chat-header-main">
            <div class="chat-avatar-shell">
              <el-avatar :size="48" :src="headerAvatar" class="chat-avatar">
                {{ headerAvatarText }}
              </el-avatar>
              <span
                v-if="currentSession.type === 'private'"
                class="presence-dot"
                :class="{ online: currentSessionOnline }"
              ></span>
            </div>

            <div class="chat-title-block">
              <div class="chat-title-row">
                <span class="chat-title-text">{{ currentSession.targetName }}</span>
                <span v-if="currentSession?.isPinned" class="title-chip">Pinned</span>
                <span v-if="currentSession?.isMuted" class="title-chip title-chip-muted">
                  Muted
                </span>
              </div>

              <div class="chat-subtitle-row">
                <span
                  v-if="currentSession.type === 'private'"
                  class="chat-presence"
                  :class="{ online: currentSessionOnline }"
                >
                  {{ currentSessionOnline ? "Online now" : "Offline" }}
                </span>
                <span v-else class="chat-detail-pill">
                  {{ currentSession.memberCount || 0 }} members
                </span>
                <span
                  v-if="currentSession.type === 'group' && groupDescription"
                  class="chat-detail-text"
                >
                  {{ groupDescription }}
                </span>
              </div>
            </div>
          </div>

          <div class="chat-header-side">
            <div class="connection-chip" :class="connectionStatus">
              <span class="connection-chip-dot"></span>
              <span>{{ connectionStatusLabel }}</span>
            </div>

            <div class="chat-actions">
              <button
                type="button"
                class="chat-action-button interactive-reset"
                aria-label="Search messages"
                title="Search messages"
                @click="handleSessionAction('search-messages')"
              >
                <el-icon><Search /></el-icon>
              </button>
              <button
                type="button"
                class="chat-action-button interactive-reset"
                aria-label="Open conversation details"
                :title="currentSession.type === 'group' ? 'Group info' : 'Contact info'"
                @click="handleSessionAction('open-session-info')"
              >
                <el-icon><InfoFilled /></el-icon>
              </button>
              <el-dropdown trigger="click" @command="handleSessionAction">
                <button
                  type="button"
                  class="chat-action-button interactive-reset"
                  aria-label="More actions"
                >
                  <el-icon><MoreFilled /></el-icon>
                </button>
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
        </div>

        <ChatMessageList
          :messages="chatStore.currentMessages"
          :current-user-id="String(userStore.userId)"
          :current-user-name="userStore.userInfo?.username || userStore.nickname"
          :current-user-avatar="userStore.avatar"
          :loading-history="loadingMoreHistory"
          :opened-unread-count="currentSessionUnreadSnapshot"
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
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {ArrowLeft, ChatDotRound, InfoFilled, MoreFilled, Search,} from "@element-plus/icons-vue";
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
import {getAvatarText} from "@/utils/common";
import type {ChatSession, Friend, Group, GroupMember, GroupReadUser, Message} from "@/types";

const userStore = useUserStore();
const chatStore = useChatStore();
const webSocketStore = useWebSocketStore();
const {capture} = useErrorHandler("chat-container");
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
const unreadSnapshotBySession = ref(new Map<string, number>());

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
      return "Connecting";
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
const currentSessionUnreadSnapshot = computed(() => {
  const sessionId = currentSession.value?.id;
  if (!sessionId) {
    return 0;
  }
  return unreadSnapshotBySession.value.get(sessionId) || 0;
});
const headerAvatar = computed(
  () => currentSession.value?.targetAvatar || sessionInfoFriend.value?.avatar || sessionInfoGroup.value?.avatar || "",
);
const headerAvatarText = computed(() =>
  getAvatarText(currentSession.value?.targetName || currentSession.value?.targetId),
);
const groupDescription = computed(() => {
  const description =
    sessionInfoGroup.value?.description || sessionInfoGroup.value?.announcement || "";
  return description.trim();
});

const rememberUnreadSnapshot = (session?: ChatSession | null) => {
  if (!session?.id) {
    return;
  }
  unreadSnapshotBySession.value.set(session.id, Math.max(0, session.unreadCount || 0));
};

const handleTabChange = (tabName: "chat" | "contacts" | "groups") => {
  activeTab.value = tabName;
};

const selectSession = async (session: NonNullable<typeof currentSession.value>) => {
  rememberUnreadSnapshot(session);
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
    rememberUnreadSnapshot(session);
    activeTab.value = "chat";
  }
};

const startGroupChat = async (group: Group) => {
  const session = await chatStore.openGroupSession(group);
  if (session) {
    rememberUnreadSnapshot(session);
    activeTab.value = "chat";
  }
};

const openSessionInfoDrawer = async (session: ChatSession) => {
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
        await openSessionInfoDrawer(session);
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
        unreadSnapshotBySession.value.set(session.id, 0);
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
        unreadSnapshotBySession.value.delete(session.id);
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

watch(
  () => currentSession.value,
  (session) => {
    if (session?.id && !unreadSnapshotBySession.value.has(session.id)) {
      rememberUnreadSnapshot(session);
    }
    if (!session?.id) {
      showSessionInfoDrawer.value = false;
      showSearchDialog.value = false;
    }
  },
  {immediate: true},
);

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
  background: var(--chat-shell-bg);
}

.chat-shell-sidebar {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  align-self: stretch;
}

.chat-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px);
}

.chat-content {
  display: flex;
  height: 100%;
  flex-direction: column;
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
  width: min(100%, 560px);
}

.welcome-orb {
  position: absolute;
  inset: 12% 16%;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.22), transparent 70%);
  filter: blur(32px);
}

.welcome-card {
  position: relative;
  padding: 40px 36px;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(191, 219, 254, 0.72);
  box-shadow: 0 32px 72px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.welcome-icon {
  color: var(--chat-accent);
}

.welcome-title {
  margin-top: 18px;
  color: var(--chat-text-primary);
  font-size: 30px;
  font-weight: 800;
  line-height: 1.15;
}

.welcome-text {
  margin: 14px auto 0;
  max-width: 420px;
  color: var(--chat-text-tertiary);
  font-size: 14px;
  line-height: 1.8;
}

.welcome-status {
  margin-top: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.92);
  color: var(--chat-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.connection-dot,
.connection-chip-dot,
.presence-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #94a3b8;
}

.connection-dot.connected,
.connection-chip.connected .connection-chip-dot,
.presence-dot.online {
  background: var(--chat-success);
}

.connection-dot.connecting,
.connection-chip.connecting .connection-chip-dot {
  background: var(--chat-warning);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 82px;
  padding: 14px 22px;
  border-bottom: 1px solid rgba(203, 213, 225, 0.74);
  background: rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(16px);
}

.chat-header-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
}

.chat-avatar-shell {
  position: relative;
  flex-shrink: 0;
}

.chat-avatar {
  border: 1px solid rgba(191, 219, 254, 0.58);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
}

.presence-dot {
  position: absolute;
  right: 2px;
  bottom: 2px;
  border: 2px solid #fff;
}

.chat-title-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-title-row,
.chat-subtitle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.chat-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--chat-text-primary);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.title-chip,
.chat-detail-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.94);
  color: var(--chat-accent-strong);
  font-size: 12px;
  font-weight: 700;
}

.title-chip-muted {
  background: rgba(248, 250, 252, 0.96);
  color: var(--chat-text-secondary);
}

.chat-presence,
.chat-detail-text {
  color: var(--chat-text-tertiary);
  font-size: 13px;
  line-height: 1.5;
}

.chat-presence.online {
  color: var(--chat-success);
  font-weight: 700;
}

.chat-header-side {
  display: flex;
  align-items: center;
  gap: 14px;
}

.connection-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.9);
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

.connection-chip.connected {
  color: #0f766e;
  background: rgba(236, 253, 245, 0.92);
}

.connection-chip.connecting {
  color: #b45309;
  background: rgba(255, 247, 237, 0.92);
}

.chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mobile-back {
  display: none;
}

@media (max-width: 768px) {
  .chat-main {
    display: none;

    &.active-mobile {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: flex;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.9);
    }
  }

  .chat-header {
    min-height: 74px;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px;
    gap: 12px;
  }

  .mobile-back {
    display: inline-flex;
  }

  .chat-header-main {
    gap: 12px;
  }

  .chat-avatar {
    width: 44px;
    height: 44px;
  }

  .chat-title-text {
    font-size: 18px;
  }

  .chat-subtitle-row {
    gap: 8px;
  }

  .connection-chip {
    display: none;
  }

  .chat-actions {
    gap: 6px;
  }

  .welcome-card {
    padding: 32px 24px;
  }

  .welcome-title {
    font-size: 24px;
  }
}
</style>
