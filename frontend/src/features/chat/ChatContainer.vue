<template>
  <div class="chat-container">
    <ConnectionStatusBar />
    <!-- 顶部全局状态栏 -->
    <div class="app-topbar">
      <div class="topbar-left">
        <el-avatar :size="32" :src="userStore.avatar" class="topbar-avatar">
          {{ userStore.nickname?.[0] || "U" }}
        </el-avatar>
        <span class="topbar-username">{{ userStore.nickname || userStore.userInfo?.username || "User" }}</span>
        <span class="status-dot" :class="{ offline: connectionStatus !== 'connected' }"></span>
      </div>

      <div class="topbar-center">
        <button type="button" class="topbar-search-btn" :aria-label="t('chat.searchMessages')">
          <el-icon :size="16"><Search /></el-icon>
          <span class="topbar-search-text">{{ t("chat.searchMessages") }}</span>
        </button>
      </div>

      <div class="topbar-right">
        <span class="topbar-connection" :class="connectionStatus">
          <span class="connection-dot-sm" :class="connectionStatus"></span>
          {{ connectionStatusLabel }}
        </span>
        <button
          type="button"
          class="topbar-icon-btn"
          :title="isDarkTheme ? '切换浅色模式' : '切换深色模式'"
          @click="toggleTheme"
        >
          <el-icon :size="18">
            <Moon v-if="!isDarkTheme" />
            <Sunny v-else />
          </el-icon>
        </button>
      </div>
    </div>

    <!-- 主体区域 -->
    <div class="chat-body">
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
      :sessions-loading="chatStore.loading"
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
        <div class="welcome-card">
          <el-icon class="welcome-icon" :size="42"><ChatDotRound /></el-icon>
          <div class="welcome-title">{{ t("chat.noConversationSelected") }}</div>
          <div class="welcome-status">
            <span class="connection-dot" :class="connectionStatus"></span>
            <span>{{ connectionStatusLabel }}</span>
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

          <button
            type="button"
            class="chat-header-main interactive-reset"
            :title="currentSession.type === 'group' ? t('chat.groupInfo') : t('chat.contactInfo')"
            @click="openSessionInfoDrawer(currentSession)"
          >
            <div class="chat-avatar-shell">
              <el-avatar :size="42" :src="headerAvatar" class="chat-avatar">
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
              </div>

              <div class="chat-subtitle-row">
                <span
                  v-if="currentSession.type === 'private'"
                  class="chat-presence"
                  :class="{ online: currentSessionOnline }"
                >
                  {{ currentSessionOnline ? t("chat.onlineNow") : t("chat.offline") }}
                </span>
                <span v-else class="chat-detail-pill">
                  {{ t("chat.members", { count: groupMemberCount }) }}
                </span>
                <span
                  v-if="currentSession.type === 'group' && groupDescription"
                  class="chat-detail-text"
                >
                  {{ groupDescription }}
                </span>
              </div>
            </div>
          </button>

          <div class="chat-header-side">
            <div class="security-badge-wrap" v-if="currentSession.type === 'private'">
              <EncryptionBadge
                :expanded="showSecurityPanel"
                @toggle="showSecurityPanel = !showSecurityPanel"
              />
              <Transition name="panel-fade">
                <SecurityPanel
                  v-if="showSecurityPanel"
                  class="security-popover"
                  @close="showSecurityPanel = false"
                />
              </Transition>
            </div>
            <div v-if="currentSession.type === 'private'" class="header-ai-badge-wrap">
              <AiStatusBadge
                :auto-reply-enabled="autoReplyEnabled"
                :has-human-intervention="humanIntervention"
                class="header-ai-badge"
                @click="toggleAutoReply"
              />
            </div>
            <div class="chat-actions">
              <el-dropdown trigger="click" @command="handleSessionAction">
                <button
                  type="button"
                  class="chat-action-button interactive-reset"
                  :aria-label="t('chat.moreActions')"
                >
                  <el-icon><MoreFilled /></el-icon>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="search-messages" data-command="search-messages">
                      {{ t("chat.searchMessages") }}
                    </el-dropdown-item>
                    <el-dropdown-item command="toggle-pin" data-command="toggle-pin">
                      {{ currentSession?.isPinned ? t("chat.unpin") : t("chat.pin") }}
                    </el-dropdown-item>
                    <el-dropdown-item command="toggle-mute" data-command="toggle-mute">
                      {{ currentSession?.isMuted ? t("chat.unmute") : t("chat.mute") }}
                    </el-dropdown-item>
                    <el-dropdown-item command="open-session-info" data-command="open-session-info">
                      {{ currentSession?.type === "group" ? t("chat.groupInfo") : t("chat.contactInfo") }}
                    </el-dropdown-item>
                    <el-dropdown-item command="clear-history" data-command="clear-history">
                      {{ t("chat.clearHistory") }}
                    </el-dropdown-item>
                    <el-dropdown-item command="delete-session" data-command="delete-session">
                      {{ t("chat.removeConversation") }}
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
          :session-type="currentSession.type"
          @request-history="loadMoreHistory"
          @mark-read="tryAckRead"
          @show-group-readers="openGroupReadDialog"
        />

        <ChatComposer
          :disabled="!currentSession"
          :members="composerMembers"
          @send-text="sendTextMessage"
          @send-media="sendMediaMessage"
          @request-members="handleRequestMembers"
        />
      </div>
    </div>

    <!-- 右侧详情面板 -->
    <div
      v-if="showDetailPanel && currentSession"
      class="chat-detail-panel"
    >
      <div class="detail-header">
        <span class="detail-title">{{ t("chat.contactInfo") }}</span>
        <button type="button" class="topbar-icon-btn" @click="showDetailPanel = false">
          <el-icon><Close /></el-icon>
        </button>
      </div>

      <div class="detail-body chat-soft-scrollbar">
        <div class="detail-section">
          <div class="detail-avatar-wrap">
            <el-avatar :size="64" :src="headerAvatar">{{ headerAvatarText }}</el-avatar>
            <span
              v-if="currentSession.type === 'private'"
              class="presence-dot detail-presence"
              :class="{ online: currentSessionOnline }"
            ></span>
          </div>
          <div class="detail-name">{{ currentSession.targetName }}</div>
          <div class="detail-subtitle">
            <span v-if="currentSession.type === 'private'" :class="{ online: currentSessionOnline }">
              {{ currentSessionOnline ? t("chat.onlineNow") : t("chat.offline") }}
            </span>
            <span v-else>{{ t("chat.members", { count: groupMemberCount }) }}</span>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">会话信息</div>
          <div class="detail-info-row">
            <span class="detail-info-label">类型</span>
            <span class="detail-info-value">{{ currentSession.type === "private" ? "私聊" : "群聊" }}</span>
          </div>
          <div v-if="currentSession.type === 'group'" class="detail-info-row">
            <span class="detail-info-label">成员数</span>
            <span class="detail-info-value">{{ groupMemberCount }}</span>
          </div>
          <div class="detail-info-row">
            <span class="detail-info-label">置顶</span>
            <span class="detail-info-value">{{ currentSession.isPinned ? "是" : "否" }}</span>
          </div>
          <div class="detail-info-row">
            <span class="detail-info-label">免打扰</span>
            <span class="detail-info-value">{{ currentSession.isMuted ? "是" : "否" }}</span>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">安全</div>
          <div class="detail-info-row">
            <span class="detail-info-label">加密状态</span>
            <span class="detail-info-value detail-secure">
              <span class="status-dot"></span>
              端对端加密已启用
            </span>
          </div>
          <div class="detail-info-row">
            <span class="detail-info-label">加密协议</span>
            <span class="detail-info-value">AES-256-GCM</span>
          </div>
          <div class="detail-info-row">
            <span class="detail-info-label">密钥状态</span>
            <span class="detail-info-value detail-secure">活跃</span>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">AI 助手</div>
          <div class="detail-ai-status">
            <AiStatusBadge
              :auto-reply-enabled="autoReplyEnabled"
              :has-human-intervention="humanIntervention"
            />
          </div>
          <div class="detail-info-row">
            <span class="detail-info-label">自动回复</span>
            <span class="detail-info-value">{{ autoReplyEnabled ? "已开启" : "未开启" }}</span>
          </div>
          <div class="detail-info-row">
            <span class="detail-info-label">人工介入</span>
            <span class="detail-info-value">{{ humanIntervention ? "已接管" : "未检测到" }}</span>
          </div>
          <div v-if="lastAiReplyInfo" class="detail-info-row">
            <span class="detail-info-label">最近 AI 回复</span>
            <span class="detail-info-value">{{ formatDetailTime(lastAiReplyInfo.time) }}</span>
          </div>
          <div v-if="lastAiReplyInfo?.provider" class="detail-info-row">
            <span class="detail-info-label">AI 提供商</span>
            <span class="detail-info-value">{{ lastAiReplyInfo.provider }}</span>
          </div>
          <div v-if="lastAiReplyInfo?.model" class="detail-info-row">
            <span class="detail-info-label">AI 模型</span>
            <span class="detail-info-value">{{ lastAiReplyInfo.model }}</span>
          </div>
        </div>
      </div>
    </div>

    </div><!-- .chat-body -->

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
import {ArrowLeft, ChatDotRound, Close, MoreFilled, Moon, Search, Sunny} from "@element-plus/icons-vue";
import {ElMessageBox} from "element-plus";
import ChatComposer from "@/features/chat/ChatComposer.vue";
import ChatDialogs from "@/features/chat/ChatDialogs.vue";
import ChatMessageList from "@/features/chat/ChatMessageList.vue";
import ChatSidebarPanel from "@/features/chat/ChatSidebarPanel.vue";
import EncryptionBadge from "@/components/security/EncryptionBadge.vue";
import SecurityPanel from "@/components/security/SecurityPanel.vue";
import AiStatusBadge from "@/components/ai/AiStatusBadge.vue";
import ConnectionStatusBar from "@/components/status/ConnectionStatusBar.vue";
import {useErrorHandler} from "@/hooks/useErrorHandler";
import {aiService} from "@/services/ai";
import {groupService} from "@/services/group";
import {useChatStore} from "@/stores/chat";
import {useI18nStore} from "@/stores/i18n";
import {useUserStore} from "@/stores/user";
import {useWebSocketStore} from "@/stores/websocket";
import {getAvatarText} from "@/utils/common";
import type {ChatSession, Friend, Group, GroupMember, GroupReadUser, Message} from "@/types";

const userStore = useUserStore();
const chatStore = useChatStore();
const webSocketStore = useWebSocketStore();
const {capture} = useErrorHandler("chat-container");
const {t} = useI18nStore();
const activeTab = ref<"chat" | "contacts" | "groups">("chat");
const showAddFriend = ref(false);
const showCreateGroup = ref(false);
const showGroupReadDialog = ref(false);
const showSearchDialog = ref(false);
const showSessionInfoDrawer = ref(false);
const showDetailPanel = ref(false);
const showSecurityPanel = ref(false);
const isDarkTheme = ref(document.body.classList.contains("theme-dark"));
const groupReadUsers = ref<GroupReadUser[]>([]);
const sessionInfoMembers = ref<GroupMember[]>([]);

const sessionInfoLoading = ref(false);
const sessionInfoError = ref("");
const unreadSnapshotBySession = ref(new Map<string, number>());

const currentSession = computed(() => chatStore.currentSession);

const composerMembers = ref<{ userId: string; name: string; avatar?: string; avatarText: string }[]>([]);

const fetchComposerMembers = async (groupId: string) => {
  try {
    const response = await groupService.getMembers(groupId);
    const members = (response.data || []) as GroupMember[];
    composerMembers.value = members.map((m) => ({
      userId: String(m.userId || ""),
      name: m.nickname || m.username || String(m.userId),
      avatar: m.avatar,
      avatarText: getAvatarText(m.nickname || m.username || String(m.userId)),
    }));
  } catch {
    composerMembers.value = [];
  }
};

watch(
  () => currentSession.value,
  (session) => {
    if (session?.type === "group") {
      fetchComposerMembers(session.targetId);
    } else {
      composerMembers.value = [];
    }
  },
  { immediate: true },
);

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
      return t("chat.connected");
    case "connecting":
      return t("chat.connecting");
    default:
      return t("chat.offline");
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
const groupMemberCount = computed(() => {
  if (currentSession.value?.type !== "group") {
    return 0;
  }
  if (sessionInfoMembers.value.length > 0) {
    return sessionInfoMembers.value.length;
  }
  return sessionInfoGroup.value?.memberCount || currentSession.value.memberCount || 0;
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
    const members = response.data || [];
    const memberIds = members
      .map((member) => String(member.userId || ""))
      .filter(Boolean);
    const onlineStatus = await webSocketStore.refreshOnlineStatus(memberIds);
    sessionInfoMembers.value = members.map((member) => ({
      ...member,
      online:
        String(member.userId) === String(userStore.userId || "") ||
        Boolean(onlineStatus[String(member.userId || "")]) ||
        webSocketStore.isUserOnline(String(member.userId || "")),
    }));
  } catch (error) {
    sessionInfoError.value = t("chat.loadGroupFailed");
    capture(error, t("chat.loadGroupFailed"));
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
        showDetailPanel.value = !showDetailPanel.value;
        await openSessionInfoDrawer(session);
        return;
      case "clear-history":
        await ElMessageBox.confirm(
          t("chat.clearHistoryMessage", {name: session.targetName}),
          t("chat.clearHistoryTitle"),
          {
            type: "warning",
            confirmButtonText: t("common.confirm"),
            cancelButtonText: t("common.cancel"),
          },
        );
        await chatStore.clearMessages(session.id);
        unreadSnapshotBySession.value.set(session.id, 0);
        return;
      case "delete-session":
        await ElMessageBox.confirm(
          t("chat.removeMessage", {name: session.targetName}),
          t("chat.removeTitle"),
          {
            type: "warning",
            confirmButtonText: t("common.confirm"),
            cancelButtonText: t("common.cancel"),
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

const sendTextMessage = async (content: string, mentionedUserIds?: string[]) => {
  await chatStore.sendMessage(content, "TEXT", undefined, mentionedUserIds);
};

const handleRequestMembers = () => {
  const session = currentSession.value;
  if (session?.type === "group") {
    fetchComposerMembers(session.targetId);
  }
};

const autoReplyEnabled = ref(false);

// Derive human intervention from last message context (no dedicated session field)
const humanIntervention = computed(() => {
  const session = currentSession.value;
  if (!session?.lastMessage) return false;
  // If last message is a SYSTEM type about handoff, infer intervention
  const msg = session.lastMessage;
  if (msg.messageType === "SYSTEM" && msg.content?.includes("接管")) return true;
  return false;
});

const lastAiReplyInfo = computed(() => {
  const session = currentSession.value;
  if (!session?.lastMessage?.isAiGenerated) return null;
  const msg = session.lastMessage;
  return {
    time: msg.sendTime,
    provider: msg.aiProvider,
    model: msg.aiModel,
  };
});

const formatDetailTime = (time?: string) => {
  if (!time) return "";
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const fetchAutoReplyStatus = async () => {
  try {
    const response = await aiService.getSettings();
    autoReplyEnabled.value = response.data.autoReplyEnabled;
  } catch {
    /* ignore */
  }
};

const toggleTheme = () => {
  isDarkTheme.value = !isDarkTheme.value;
  document.body.classList.toggle("theme-dark", isDarkTheme.value);
  localStorage.setItem("im_theme", isDarkTheme.value ? "dark" : "light");
};

const toggleAutoReply = async () => {
  const next = !autoReplyEnabled.value;
  try {
    await aiService.updateSettings({ autoReplyEnabled: next });
    autoReplyEnabled.value = next;
  } catch (err) {
    capture(err, "Failed to toggle auto-reply");
  }
};

onMounted(() => {
  fetchAutoReplyStatus();
});

const sendMediaMessage = async (payload: {
  type: "IMAGE" | "FILE" | "VIDEO" | "VOICE";
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
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--chat-shell-bg);
}

/* === 顶部状态栏 === */
.app-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 20px;
  background: var(--chat-panel-bg);
  border-bottom: 1px solid var(--chat-panel-border);
  backdrop-filter: var(--chat-glass-blur);
  -webkit-backdrop-filter: var(--chat-glass-blur);
  flex-shrink: 0;
  z-index: 2;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.topbar-avatar {
  flex-shrink: 0;
  border: 1px solid var(--chat-panel-border);
}

.topbar-username {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--chat-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
  flex-shrink: 0;

  &.offline {
    background: var(--text-tertiary);
    box-shadow: none;
  }
}

.topbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.topbar-search-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: var(--radius-full);
  background: var(--surface-tertiary);
  border: 1px solid var(--border-light);
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
  min-width: 200px;

  &:hover {
    background: var(--surface-overlay);
    border-color: var(--border-default);
  }
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-connection {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--text-tertiary);

  &.connected {
    color: var(--color-success);
  }

  &.connecting {
    color: var(--color-warning);
  }
}

.connection-dot-sm {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);

  &.connected {
    background: var(--color-success);
  }

  &.connecting {
    background: var(--color-warning);
  }
}

.topbar-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);

  &:hover {
    background: var(--surface-tertiary);
    color: var(--text-primary);
  }
}

/* === 主体区域 === */
.chat-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
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
  background: transparent;
}

.chat-content {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.chat-welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.welcome-card {
  width: min(100%, 360px);
  padding: 24px;
  border-radius: 8px;
  background: var(--chat-panel-bg);
  border: 1px solid var(--chat-panel-border);
  box-shadow: var(--chat-surface-shadow);
  backdrop-filter: var(--chat-glass-blur);
  text-align: center;
}

.welcome-icon {
  color: var(--chat-accent);
}

.welcome-title {
  margin-top: 12px;
  color: var(--chat-text-primary);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
}

.welcome-status {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.68);
  color: var(--chat-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.connection-dot,
.presence-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #94a3b8;
}

.connection-dot.connected,
.presence-dot.online {
  background: var(--chat-success);
}

.connection-dot.connecting {
  background: var(--chat-warning);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  backdrop-filter: var(--chat-glass-blur);
}

.chat-header-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
  padding: 4px;
  transition: background-color var(--motion-normal, 180ms) var(--motion-ease, ease);
}

.chat-header-main:hover {
  background: rgba(37, 99, 235, 0.06);
}

.chat-avatar-shell {
  position: relative;
  flex-shrink: 0;
}

.chat-avatar {
  border: 1px solid var(--chat-panel-border);
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
  gap: 3px;
}

.chat-title-row,
.chat-subtitle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.chat-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--chat-text-primary);
  font-size: 16px;
  font-weight: 700;
}

.chat-presence,
.chat-detail-pill,
.chat-detail-text {
  color: var(--chat-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.chat-presence.online {
  color: var(--chat-success);
  font-weight: 700;
}

.chat-header-side {
  display: flex;
  align-items: center;
  gap: 8px;
}

.security-badge-wrap {
  position: relative;
}

.header-ai-badge-wrap {
  cursor: pointer;
}

.header-ai-badge {
  pointer-events: none;
}

.security-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 300px;
  z-index: 100;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity var(--motion-normal, 180ms) var(--motion-ease, ease),
    transform var(--motion-normal, 180ms) var(--motion-ease, ease);
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mobile-back {
  display: none;
}

/* === 右侧详情面板 === */
.chat-detail-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  backdrop-filter: var(--chat-glass-blur);
  -webkit-backdrop-filter: var(--chat-glass-blur);
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--chat-panel-border);
  flex-shrink: 0;
}

.detail-title {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--chat-text-primary);
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
}

.detail-section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.detail-avatar-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.detail-presence {
  position: absolute;
  right: calc(50% - 36px);
  bottom: 2px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--chat-panel-bg);
}

.detail-name {
  text-align: center;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--chat-text-primary);
  margin-bottom: 4px;
}

.detail-subtitle {
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-tertiary);

  .online {
    color: var(--color-success);
    font-weight: var(--weight-semibold);
  }
}

.detail-section-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-ai-status {
  margin-bottom: 12px;
}

.detail-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.detail-info-label {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.detail-info-value {
  font-size: var(--text-sm);
  color: var(--chat-text-primary);
  font-weight: var(--weight-medium);
}

.detail-secure {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-success);
}

@media (max-width: 768px) {
  .app-topbar {
    padding: 0 12px;
    height: 48px;
    padding-top: env(safe-area-inset-top, 0px);
  }

  .topbar-search-btn {
    min-width: 120px;
  }

  .topbar-search-text {
    display: none;
  }

  .topbar-connection {
    display: none;
  }

  .chat-detail-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 20;
    width: 100%;
    max-width: 320px;
    box-shadow: var(--shadow-panel);
    animation: slideInRight var(--motion-normal, 180ms) var(--motion-ease, ease);
  }

  .chat-body {
    position: relative;
  }

  .chat-main {
    display: none;

    &.active-mobile {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: flex;
      width: 100%;
      height: 100%;
      background: var(--chat-shell-bg);
      animation: slideInRight var(--motion-normal, 180ms) var(--motion-ease, ease);
    }
  }

  .chat-header {
    min-height: 58px;
    padding: 8px 10px;
    gap: 8px;
  }

  .mobile-back {
    display: inline-flex;
  }

  .chat-header-main {
    gap: 12px;
  }

  .chat-avatar {
    width: 40px;
    height: 40px;
  }

  .chat-title-text {
    font-size: 15px;
  }

  .chat-subtitle-row {
    gap: 8px;
  }

  .chat-actions {
    gap: 6px;
  }

  .welcome-card {
    padding: 22px;
  }

  .welcome-title {
    font-size: 15px;
  }
}
</style>
