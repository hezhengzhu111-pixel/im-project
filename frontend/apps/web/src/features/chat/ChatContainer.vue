<template>
  <div class="wechat-layout" :class="{ 'theme-dark': isDarkTheme }">
    <!-- 左侧图标导航栏 -->
    <SideNavBar
      :active-tab="activeTab"
      :avatar="userStore.avatar"
      @change="handleNavChange"
    />

    <!-- 左侧会话列表 -->
    <aside class="chat-sidebar" :style="{ flexBasis: sidebarWidth + 'px' }">
      <div class="sidebar-header">
        <el-avatar :src="userStore.avatar" :size="36">
          {{ userStore.nickname?.[0] || userStore.userInfo?.username?.[0] || "U" }}
        </el-avatar>
        <span class="sidebar-username">{{ userStore.nickname || userStore.userInfo?.username }}</span>
      </div>
      <div class="sidebar-search">
        <el-input v-model="searchQuery" placeholder="搜索" :prefix-icon="Search" size="small" clearable />
      </div>
      <ChatSidebarPanel
        :active-tab="activeTab"
        :sessions="chatStore.sortedSessions"
        :current-session-id="currentSession?.id"
        :friends="chatStore.friends"
        :groups="chatStore.groups"
        :pending-requests-count="pendingRequestsCount"
        :total-unread-count="chatStore.totalUnreadCount"
        :moments-unread-count="momentsUnreadCount"
        :is-chat-active-on-mobile="isChatActiveOnMobile"
        :sessions-loading="chatStore.loading"
        :search-keyword="searchQuery"
        @change-tab="handleTabChange"
        @select-session="selectSession"
        @start-private-chat="startChat"
        @start-group-chat="startGroupChat"
        @open-add-friend="showAddFriend = true"
        @open-create-group="showCreateGroup = true"
        @open-settings="$router.push('/settings')"
      />
    </aside>

    <!-- 拖拽分界线 -->
    <div
      class="sidebar-resize-handle"
      @mousedown="startResize"
    />

    <!-- 右侧聊天区 -->
    <main class="chat-main">
      <!-- 朋友圈 -->
      <div v-if="activeTab === 'moments'" class="moments-inline">
        <MomentsContainer />
      </div>
      <template v-else-if="currentSession">
        <header class="chat-header">
          <div class="chat-header-left">
            <el-avatar :src="headerAvatar" :size="32">
              {{ headerAvatarText }}
            </el-avatar>
            <span class="chat-header-name">{{ currentSession.targetName }}</span>
            <span class="status-dot" :class="{ offline: !currentSessionOnline }" />
          </div>
          <div class="chat-header-right">
            <el-icon v-if="currentSession.type === 'private' && e2eeStatus === 'encrypted'" class="encryption-icon" title="端到端加密">
              <Lock />
            </el-icon>
            <button class="info-btn" title="会话详情" @click="showDetailPanel = !showDetailPanel">
              <el-icon><InfoFilled /></el-icon>
            </button>
            <el-dropdown trigger="click" @command="handleChatAction">
              <button class="more-btn"><el-icon><MoreFilled /></el-icon></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="search-messages">搜索消息</el-dropdown-item>
                  <el-dropdown-item command="toggle-pin">{{ currentSession?.isPinned ? '取消置顶' : '置顶' }}</el-dropdown-item>
                  <el-dropdown-item command="toggle-mute">{{ currentSession?.isMuted ? '取消免打扰' : '免打扰' }}</el-dropdown-item>
                  <el-dropdown-item command="open-session-info">{{ currentSession?.type === 'group' ? '群聊信息' : '联系人信息' }}</el-dropdown-item>
                  <el-dropdown-item v-if="currentSession.type === 'private' && (e2eeStatus === 'plaintext' || e2eeStatus === 'failed')" command="enable-encryption">启用端到端加密</el-dropdown-item>
                  <el-dropdown-item v-if="currentSession.type === 'private' && (e2eeStatus === 'encrypted' || e2eeStatus === 'negotiating')" command="disable-encryption">退出加密通道</el-dropdown-item>
                  <el-dropdown-item command="clear-history">清空聊天</el-dropdown-item>
                  <el-dropdown-item command="delete-session">删除会话</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </header>

        <ChatMessageList
          :messages="chatStore.currentMessages"
          :current-user-id="String(userStore.userId)"
          :current-user-name="userStore.userInfo?.username || userStore.nickname"
          :current-user-avatar="userStore.avatar"
          :loading-history="loadingMoreHistory"
          :opened-unread-count="currentSessionUnreadSnapshot"
          :session-type="currentSession.type"
          :e2ee-status="currentSession.type === 'private' ? e2eeStatus : undefined"
          @request-history="loadMoreHistory"
          @mark-read="tryAckRead"
          @show-group-readers="openGroupReadDialog"
        />

        <ChatComposer
          :disabled="!currentSession"
          :members="composerMembers"
          :session-id="currentSession.type === 'private' ? currentSession.id : undefined"
          @send-text="sendTextMessage"
          @send-media="sendMediaMessage"
          @request-members="handleRequestMembers"
        />
      </template>
      <div v-else class="chat-placeholder">
        <div class="placeholder-logo">💬</div>
        <p>{{ t('chat.noConversationSelected') }}</p>
      </div>
    </main>

    <!-- 详情面板遮罩 -->
    <div v-if="showDetailPanel && currentSession" class="detail-overlay" @click="showDetailPanel = false" />

    <!-- 右侧详情面板 overlay -->
    <div v-if="showDetailPanel && currentSession" class="chat-detail-panel">
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
            <span v-if="currentSession.type === 'private'" class="presence-dot detail-presence" :class="{ online: currentSessionOnline }"></span>
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
            <AiStatusBadge :auto-reply-enabled="autoReplyEnabled" :has-human-intervention="humanIntervention" />
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

    <!-- Dialogs -->
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
      :friends="chatStore.friends"
      @refresh-members="currentSession?.targetId && refreshSessionMembers(currentSession.targetId)"
    />
    <ChatEncryptionDialog
      v-if="currentSession?.type === 'private'"
      v-model="showEncryptionDialog"
      :peer-name="currentSession.targetName"
      :peer-id="currentSession.targetId"
      :session-id="currentSession.id"
      @encrypted="handleEncryptionEnabled"
    />
    <ChatE2eeNegotiationDialog
      v-if="pendingNegotiation"
      v-model="showNegotiationDialog"
      :requester-name="pendingNegotiation.requesterName"
      :requester-id="pendingNegotiation.requesterId"
      :session-id="pendingNegotiation.sessionId"
      :request-payload-json="pendingNegotiation.requestPayloadJson"
      @accepted="handleNegotiationAccepted"
      @rejected="handleNegotiationRejected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessageBox, ElNotification } from "element-plus";
import ChatComposer from "@/features/chat/ChatComposer.vue";
import ChatDialogs from "@/features/chat/ChatDialogs.vue";
import ChatE2eeNegotiationDialog from "@/features/chat/ChatE2eeNegotiationDialog.vue";
import ChatEncryptionDialog from "@/features/chat/ChatEncryptionDialog.vue";
import ChatMessageList from "@/features/chat/ChatMessageList.vue";
import ChatSidebarPanel from "@/features/chat/ChatSidebarPanel.vue";
import SideNavBar from "@/components/layout/SideNavBar.vue";
import EncryptionBadge from "@/components/security/EncryptionBadge.vue";
import SecurityPanel from "@/components/security/SecurityPanel.vue";
import AiStatusBadge from "@/components/ai/AiStatusBadge.vue";
import ConnectionStatusBar from "@/components/status/ConnectionStatusBar.vue";
import MomentsContainer from "@/features/moments/MomentsContainer.vue";
import { useChatPage } from "@/features/chat/composables/useChatPage";
import { useE2eeSessionStatus } from "@/features/e2ee/composables/useE2eeSessionStatus";
import { onE2eeNegotiation } from "@/features/e2ee/negotiation-events";
import type { E2eeNegotiationEvent } from "@/features/e2ee/negotiation-events";
import { buildSessionId } from "@/normalizers/chat";
import {
  ArrowLeft,
  ChatDotRound,
  Close,
  InfoFilled,
  Lock,
  MoreFilled,
  Moon,
  Search,
  Setting,
  Sunny,
} from "@element-plus/icons-vue";

const {
  userStore,
  chatStore,
  t,
  activeTab,
  showAddFriend,
  showCreateGroup,
  showGroupReadDialog,
  showSearchDialog,
  showSessionInfoDrawer,
  showDetailPanel,
  showSecurityPanel,
  isDarkTheme,
  groupReadUsers,
  sessionInfoMembers,
  sessionInfoLoading,
  sessionInfoError,
  composerMembers,
  autoReplyEnabled,
  currentSession,
  loadingMoreHistory,
  pendingRequestsCount,
  momentsUnreadCount,
  isChatActiveOnMobile,
  currentSessionOnline,
  connectionStatus,
  connectionStatusLabel,
  sessionInfoFriend,
  sessionInfoGroup,
  currentSessionUnreadSnapshot,
  headerAvatar,
  headerAvatarText,
  groupMemberCount,
  humanIntervention,
  lastAiReplyInfo,
  formatDetailTime,
  handleTabChange,
  selectSession,
  startChat,
  startGroupChat,
  openSessionInfoDrawer,
  refreshSessionMembers,
  handleSessionAction,
  sendTextMessage,
  sendMediaMessage,
  handleRequestMembers,
  loadMoreHistory,
  openGroupReadDialog,
  tryAckRead,
  toggleTheme,
  toggleAutoReply,
} = useChatPage();

const e2eeStatus = useE2eeSessionStatus(
  computed(() => currentSession.value?.id),
);
const showEncryptionDialog = ref(false);
const searchQuery = ref("");

const router = useRouter();

const handleNavChange = (key: string) => {
  if (key === 'settings') {
    router.push('/settings');
  } else {
    handleTabChange(key as 'chat' | 'contacts' | 'moments');
  }
};

// ── 可拖拽侧边栏宽度 ──
const sidebarWidth = ref(280);
const MIN_SIDEBAR = 240;
const MAX_SIDEBAR = 360;

const startResize = (e: MouseEvent) => {
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;
  const onMove = (ev: MouseEvent) => {
    const next = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startWidth + (ev.clientX - startX)));
    sidebarWidth.value = next;
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
};

const openEncryptionDialog = () => {
  if (currentSession.value?.type !== "private") return;
  showSecurityPanel.value = false;
  showEncryptionDialog.value = true;
};

const handleEncryptionEnabled = () => {
  showEncryptionDialog.value = false;
};

// E2EE negotiation (responder side)
const showNegotiationDialog = ref(false);
const pendingNegotiation = ref<E2eeNegotiationEvent | null>(null);
// Cache negotiation requests that arrive when user is on a different session
const negotiationCache = ref<Map<string, E2eeNegotiationEvent>>(new Map());

const unsubNegotiation = onE2eeNegotiation((event) => {
  if (event.action === "request") {
    const currentUserId = String(userStore.userId || "");
    // Only handle requests targeted at the current user
    if (event.targetUserId !== currentUserId) return;

    const currentSid = currentSession.value?.id;
    if (currentSid === event.sessionId) {
      // User is on the target session — show dialog immediately
      pendingNegotiation.value = event;
      showNegotiationDialog.value = true;
    } else {
      // Cache for when user switches to that session
      negotiationCache.value.set(event.sessionId, event);
      ElNotification({
        title: "端到端加密请求",
        message: `${event.requesterName} 请求与你开启端到端加密`,
        type: "info",
        duration: 5000,
      });
    }
  } else if (event.action === "accepted") {
    // The requester (Alice) receives acceptance — update local status
    import("@/features/e2ee/manager/negotiation").then(({ markNegotiationAccepted }) => {
      markNegotiationAccepted(event.sessionId, event.targetUserId);
      retryDecryptPendingMessages(event.sessionId);
      retryDecryptVisibleEncryptedMessages(event.sessionId);
    });
  } else if (event.action === "rejected") {
    import("@/features/e2ee/manager/negotiation").then(({ resetNegotiation }) => {
      resetNegotiation(event.sessionId, "plaintext");
    });
  } else if (event.action === "disabled") {
    import("@/features/e2ee/manager/negotiation").then(({ resetNegotiation }) => {
      resetNegotiation(event.sessionId, "plaintext");
      ElNotification({
        title: "端到端加密已退出",
        message: `${event.requesterName || "对方"} 已退出当前加密通道。`,
        type: "info",
        duration: 5000,
      });
    });
  }
});

onBeforeUnmount(() => {
  unsubNegotiation();
});

// When switching sessions, check for cached negotiation requests
watch(
  () => currentSession.value?.id,
  (sessionId) => {
    if (!sessionId) return;
    const cached = negotiationCache.value.get(sessionId);
    if (cached) {
      negotiationCache.value.delete(sessionId);
      pendingNegotiation.value = cached;
      showNegotiationDialog.value = true;
    }
  },
);

// On mount, check for pending negotiation requests from the server
onMounted(async () => {
  try {
    const { keyService } = await import("@/features/e2ee/api/key-service");
    const resp = await keyService.getPendingNegotiations();
    const requests = resp.data || [];
    for (const req of requests) {
      const event: E2eeNegotiationEvent = {
        action: "request",
        sessionId: req.sessionId,
        requesterId: req.requesterId,
        requesterName: req.requesterName,
        targetUserId: req.targetUserId,
        requestPayloadJson: req.requestPayloadJson,
      };
      if (currentSession.value?.id === req.sessionId) {
        pendingNegotiation.value = event;
        showNegotiationDialog.value = true;
      } else {
        negotiationCache.value.set(req.sessionId, event);
      }
    }
  } catch {
    // Non-critical — pending requests will arrive via WS push anyway
  }
});

const retryDecryptPendingMessages = async (sessionId: string) => {
  void sessionId;
};

const retryDecryptVisibleEncryptedMessages = async (sessionId: string) => {
  try {
    const currentUserId = String(userStore.userId || "");
    if (!currentUserId) return;
    const messagesMap = chatStore.messages as Map<string, Record<string, unknown>[]>;
    const messages = messagesMap.get(sessionId) || [];
    if (messages.length === 0) return;

    const { e2eeManager } = await import("@/features/e2ee/manager/e2ee-manager");
    let decryptedCount = 0;
    for (const msg of messages) {
      const isEncrypted = msg.encrypted === true || msg.encrypted === 1;
      const senderId = String(msg.senderId || "");
      const content = typeof msg.content === "string" ? msg.content : "";
      if (!isEncrypted || !senderId || senderId === currentUserId || !content) {
        continue;
      }

      const envelope = msg.e2eeEnvelope || msg.e2ee_envelope;

      try {
        const { isRustE2eeEnvelope } = await import("@im/shared-e2ee-core");
        if (!isRustE2eeEnvelope(envelope)) continue;
        const decrypted = await e2eeManager.decryptEnvelope(envelope, senderId);
        if (decrypted) {
          msg.content = decrypted;
          msg.encrypted = false;
          decryptedCount++;
        }
      } catch {
        // Keep the message encrypted; the bubble masks ciphertext.
      }
    }

    if (decryptedCount > 0) {
      messagesMap.set(sessionId, [...messages]);
    }
  } catch {
    // Visible message retry is best-effort
  }
};

const handleNegotiationAccepted = () => {
  showNegotiationDialog.value = false;
  const sessionId = pendingNegotiation.value?.sessionId;
  pendingNegotiation.value = null;
  if (sessionId) {
    retryDecryptPendingMessages(sessionId);
    retryDecryptVisibleEncryptedMessages(sessionId);
  }
};

const handleNegotiationRejected = () => {
  showNegotiationDialog.value = false;
  pendingNegotiation.value = null;
};

const disableEncryptionChannel = async () => {
  const session = currentSession.value;
  if (!session || session.type !== "private") return;

  try {
    await ElMessageBox.confirm(
      "退出后，此会话会回到明文发送状态。需要加密时可重新发起协商。",
      "退出加密通道",
      {
        confirmButtonText: "退出",
        cancelButtonText: "取消",
        type: "warning",
      },
    );

    const [{ keyService }, { e2eeManager }] = await Promise.all([
      import("@/features/e2ee/api/key-service"),
      import("@/features/e2ee/manager/e2ee-manager"),
    ]);
    await keyService.disableEncryption(session.id);
    await e2eeManager.clearSession(session.id);
    showSecurityPanel.value = false;
    ElNotification({
      title: "端到端加密已退出",
      message: "当前会话已切换为明文通道，可重新发起端到端加密协商。",
      type: "success",
      duration: 5000,
    });
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    ElNotification({
      title: "退出加密失败",
      message: "未能退出端到端加密通道，请稍后重试。",
      type: "error",
      duration: 5000,
    });
  }
};

const handleChatAction = (command: string | number | object) => {
  if (command === "enable-encryption") {
    openEncryptionDialog();
    return;
  }
  if (command === "disable-encryption") {
    void disableEncryptionChannel();
    return;
  }
  void handleSessionAction(command);
};
</script>

<style scoped lang="scss">
.wechat-layout {
  display: flex;
  height: 100vh; // fallback for older browsers
  height: 100dvh;
  position: relative;
  overflow: hidden;
  background: var(--surface-tertiary, #f5f5f5);
  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
}

// ── Override ChatSidebarPanel internals to fit sidebar ──
.chat-sidebar {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  min-width: 240px;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  background: var(--surface-secondary, #ffffff);
  border-right: 1px solid var(--border-light, #e5e7eb);
  overflow: hidden;

  :deep(.chat-layout) {
    min-width: 0;
    width: 100%;
    flex: 1;
  }

  :deep(.side-nav-bar) {
    display: none;
  }

  :deep(.list-panel) {
    width: 100%;
    border-right: none;
  }

  :deep(.panel-top) {
    display: none;
  }

  :deep(.mobile-nav-bar) {
    display: none;
  }
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  height: 64px;
  flex-shrink: 0;
}

.sidebar-username {
  font-size: var(--font-size-lg, 16px);
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-search {
  padding: 0 var(--space-3, 12px) var(--space-3, 12px);
  flex-shrink: 0;
}

// ── 拖拽分界线 ──
.sidebar-resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background var(--motion-fast, 150ms);
  flex-shrink: 0;

  &:hover { background: var(--color-primary, #07C160); }
}

// ── 右侧聊天区 ──
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-tertiary, #f5f5f5);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 var(--space-4, 16px);
  background: var(--surface-secondary, #ffffff);
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  flex-shrink: 0;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.chat-header-name {
  font-size: var(--font-size-base, 14px);
  font-weight: 600;
  color: var(--text-primary, #1f2937);
}

.chat-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.encryption-icon {
  color: var(--color-primary, #07c160);
  font-size: 16px;
}

.more-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--chat-card-hover, rgba(0, 0, 0, 0.04));
  }
}

.info-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  font-size: 16px;
  transition: all 0.15s ease;

  &:hover { background: var(--chat-card-hover, rgba(0, 0, 0, 0.04)); color: var(--color-primary, #07C160); }
}

// ── 详情面板遮罩 ──
.detail-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: 50;
}

// ── Status dot in chat header ──
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success, #07c160);
  box-shadow: 0 0 6px rgba(7, 193, 96, 0.4);
  flex-shrink: 0;

  &.offline {
    background: var(--text-tertiary, #9ca3af);
    box-shadow: none;
  }
}

// ── Placeholder ──
.chat-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary, #9ca3af);
  gap: var(--space-3, 12px);

  .placeholder-logo {
    font-size: 64px;
    opacity: 0.3;
  }

  p {
    font-size: var(--font-size-sm, 13px);
  }
}

.moments-inline {
  flex: 1;
  overflow-y: auto;
  background: var(--surface-tertiary, #ededed);
}

// ── 右侧详情面板 overlay ──
.chat-detail-panel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 60;
  transition: transform 180ms ease-out;
  width: 320px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-light, #e5e7eb);
  background: var(--surface-secondary, #fff);
  box-shadow: var(--shadow-panel, 0 4px 12px rgba(0, 0, 0, 0.1));
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  flex-shrink: 0;
}

.detail-title {
  font-size: var(--font-size-base, 14px);
  font-weight: 600;
  color: var(--text-primary, #1f2937);
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.detail-section {
  margin-bottom: 20px;

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
  border: 2px solid var(--surface-secondary, #fff);
}

.detail-name {
  text-align: center;
  font-size: var(--font-size-base, 14px);
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  margin-bottom: 4px;
}

.detail-subtitle {
  text-align: center;
  font-size: var(--font-size-sm, 13px);
  color: var(--text-tertiary, #9ca3af);

  .online {
    color: var(--color-success, #07c160);
    font-weight: 600;
  }
}

.detail-section-title {
  font-size: var(--font-size-sm, 13px);
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-ai-status {
  margin-bottom: 10px;
}

.detail-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light, #e5e7eb);

  &:last-child {
    border-bottom: none;
  }
}

.detail-info-label {
  font-size: var(--font-size-sm, 13px);
  color: var(--text-tertiary, #9ca3af);
}

.detail-info-value {
  font-size: var(--font-size-sm, 13px);
  color: var(--text-primary, #1f2937);
  font-weight: 500;
}

.detail-secure {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-success, #07c160);
}

.topbar-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm, 4px);
  border: none;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--surface-tertiary, #f5f5f5);
    color: var(--text-primary, #1f2937);
  }
}

.presence-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #94a3b8;

  &.online {
    background: var(--color-success, #07c160);
  }
}

// Ensure all content layers sit above background blobs
:deep(.side-nav) {
  position: relative;
  z-index: 1;
}

.chat-main {
  position: relative;
  z-index: 1;
}

.sidebar-resize-handle {
  position: relative;
  z-index: 1;
}

@media (max-width: 768px) {
  .chat-sidebar {
    width: 100% !important;
    min-width: 0;
  }

  .chat-main {
    display: none;
  }

  .chat-detail-panel {
    width: 100%;
    max-width: 320px;
  }
}
</style>
