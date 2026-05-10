<template>
  <div class="chat-container">
    <ConnectionStatusBar />
    <!-- 顶部全局状态栏 -->
    <div class="app-topbar">
      <div class="topbar-left">
        <el-avatar :size="32" :src="userStore.avatar" class="topbar-avatar">
          {{ userStore.nickname?.[0] || "U" }}
        </el-avatar>
        <span class="topbar-username">{{
          userStore.nickname || userStore.userInfo?.username || "User"
        }}</span>
        <span
          class="status-dot"
          :class="{ offline: connectionStatus !== 'connected' }"
        ></span>
      </div>

      <div class="topbar-center">
        <button
          type="button"
          class="topbar-search-btn"
          :aria-label="t('chat.searchMessages')"
        >
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
          :title="t('nav.settings')"
          :aria-label="t('nav.settings')"
          @click="$router.push('/settings')"
        >
          <el-icon :size="18"><Setting /></el-icon>
        </button>
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
        :moments-unread-count="momentsUnreadCount"
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
            <div class="welcome-title">
              {{ t("chat.noConversationSelected") }}
            </div>
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
              :title="
                currentSession.type === 'group'
                  ? t('chat.groupInfo')
                  : t('chat.contactInfo')
              "
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
                  <span class="chat-title-text">{{
                    currentSession.targetName
                  }}</span>
                </div>

                <div class="chat-status-row">
                  <span
                    v-if="currentSession.type === 'private'"
                    class="status-chip"
                    :class="{ online: currentSessionOnline }"
                  >
                    <span class="status-chip-dot"></span>
                    {{
                      currentSessionOnline
                        ? t("chat.onlineNow")
                        : t("chat.offline")
                    }}
                  </span>
                  <span v-else class="status-chip">
                    <span class="status-chip-dot"></span>
                    {{ t("chat.members", { count: groupMemberCount }) }}
                  </span>
                  <span
                    v-if="currentSession.type === 'private' && e2eeStatus === 'encrypted'"
                    class="status-chip secure"
                  >
                    <span class="status-chip-dot"></span>
                    端到端加密
                  </span>
                  <span
                    v-else-if="currentSession.type === 'private' && e2eeStatus === 'negotiating'"
                    class="status-chip negotiating"
                  >
                    <span class="status-chip-dot"></span>
                    协商加密中
                  </span>
                  <span
                    v-else-if="currentSession.type === 'private' && e2eeStatus === 'failed'"
                    class="status-chip failed"
                  >
                    <span class="status-chip-dot"></span>
                    加密异常
                  </span>
                  <span v-if="autoReplyEnabled" class="status-chip ai">
                    <span class="status-chip-dot"></span>
                    AI 助手在线
                  </span>
                </div>
              </div>
            </button>

            <div class="chat-header-side">
              <div
                class="security-badge-wrap"
                v-if="currentSession.type === 'private'"
              >
                <EncryptionBadge
                  :status="e2eeStatus"
                  :expanded="showSecurityPanel"
                  @toggle="showSecurityPanel = !showSecurityPanel"
                />
                <Transition name="panel-fade">
                  <SecurityPanel
                    v-if="showSecurityPanel"
                    :status="e2eeStatus"
                    :can-enable="e2eeStatus === 'plaintext' || e2eeStatus === 'failed'"
                    class="security-popover"
                    @enable-encryption="openEncryptionDialog"
                    @close="showSecurityPanel = false"
                  />
                </Transition>
              </div>
              <div
                v-if="currentSession.type === 'private'"
                class="header-ai-badge-wrap"
              >
                <AiStatusBadge
                  :auto-reply-enabled="autoReplyEnabled"
                  :has-human-intervention="humanIntervention"
                  class="header-ai-badge"
                  @click="toggleAutoReply"
                />
              </div>
              <div class="chat-actions">
                <el-dropdown trigger="click" @command="handleChatAction">
                  <button
                    type="button"
                    class="chat-action-button interactive-reset"
                    :aria-label="t('chat.moreActions')"
                  >
                    <el-icon><MoreFilled /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        command="search-messages"
                        data-command="search-messages"
                      >
                        {{ t("chat.searchMessages") }}
                      </el-dropdown-item>
                      <el-dropdown-item
                        command="toggle-pin"
                        data-command="toggle-pin"
                      >
                        {{
                          currentSession?.isPinned
                            ? t("chat.unpin")
                            : t("chat.pin")
                        }}
                      </el-dropdown-item>
                      <el-dropdown-item
                        command="toggle-mute"
                        data-command="toggle-mute"
                      >
                        {{
                          currentSession?.isMuted
                            ? t("chat.unmute")
                            : t("chat.mute")
                        }}
                      </el-dropdown-item>
                      <el-dropdown-item
                        command="open-session-info"
                        data-command="open-session-info"
                      >
                        {{
                          currentSession?.type === "group"
                            ? t("chat.groupInfo")
                            : t("chat.contactInfo")
                        }}
                      </el-dropdown-item>
                      <el-dropdown-item
                        v-if="currentSession.type === 'private' && (e2eeStatus === 'plaintext' || e2eeStatus === 'failed')"
                        command="enable-encryption"
                        data-command="enable-encryption"
                      >
                        启用端到端加密
                      </el-dropdown-item>
                      <el-dropdown-item
                        command="clear-history"
                        data-command="clear-history"
                      >
                        {{ t("chat.clearHistory") }}
                      </el-dropdown-item>
                      <el-dropdown-item
                        command="delete-session"
                        data-command="delete-session"
                      >
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
            :current-user-name="
              userStore.userInfo?.username || userStore.nickname
            "
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
            @send-text="sendTextMessage"
            @send-media="sendMediaMessage"
            @request-members="handleRequestMembers"
          />
        </div>
      </div>

      <!-- 右侧详情面板 -->
      <div v-if="showDetailPanel && currentSession" class="chat-detail-panel">
        <div class="detail-header">
          <span class="detail-title">{{ t("chat.contactInfo") }}</span>
          <button
            type="button"
            class="topbar-icon-btn"
            @click="showDetailPanel = false"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>

        <div class="detail-body chat-soft-scrollbar">
          <div class="detail-section">
            <div class="detail-avatar-wrap">
              <el-avatar :size="64" :src="headerAvatar">{{
                headerAvatarText
              }}</el-avatar>
              <span
                v-if="currentSession.type === 'private'"
                class="presence-dot detail-presence"
                :class="{ online: currentSessionOnline }"
              ></span>
            </div>
            <div class="detail-name">{{ currentSession.targetName }}</div>
            <div class="detail-subtitle">
              <span
                v-if="currentSession.type === 'private'"
                :class="{ online: currentSessionOnline }"
              >
                {{
                  currentSessionOnline ? t("chat.onlineNow") : t("chat.offline")
                }}
              </span>
              <span v-else>{{
                t("chat.members", { count: groupMemberCount })
              }}</span>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">会话信息</div>
            <div class="detail-info-row">
              <span class="detail-info-label">类型</span>
              <span class="detail-info-value">{{
                currentSession.type === "private" ? "私聊" : "群聊"
              }}</span>
            </div>
            <div v-if="currentSession.type === 'group'" class="detail-info-row">
              <span class="detail-info-label">成员数</span>
              <span class="detail-info-value">{{ groupMemberCount }}</span>
            </div>
            <div class="detail-info-row">
              <span class="detail-info-label">置顶</span>
              <span class="detail-info-value">{{
                currentSession.isPinned ? "是" : "否"
              }}</span>
            </div>
            <div class="detail-info-row">
              <span class="detail-info-label">免打扰</span>
              <span class="detail-info-value">{{
                currentSession.isMuted ? "是" : "否"
              }}</span>
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
              <span class="detail-info-value">{{
                autoReplyEnabled ? "已开启" : "未开启"
              }}</span>
            </div>
            <div class="detail-info-row">
              <span class="detail-info-label">人工介入</span>
              <span class="detail-info-value">{{
                humanIntervention ? "已接管" : "未检测到"
              }}</span>
            </div>
            <div v-if="lastAiReplyInfo" class="detail-info-row">
              <span class="detail-info-label">最近 AI 回复</span>
              <span class="detail-info-value">{{
                formatDetailTime(lastAiReplyInfo.time)
              }}</span>
            </div>
            <div v-if="lastAiReplyInfo?.provider" class="detail-info-row">
              <span class="detail-info-label">AI 提供商</span>
              <span class="detail-info-value">{{
                lastAiReplyInfo.provider
              }}</span>
            </div>
            <div v-if="lastAiReplyInfo?.model" class="detail-info-row">
              <span class="detail-info-label">AI 模型</span>
              <span class="detail-info-value">{{ lastAiReplyInfo.model }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- .chat-body -->

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
      :session-id="pendingNegotiation.sessionId"
      :request-payload-json="pendingNegotiation.requestPayloadJson"
      @accepted="handleNegotiationAccepted"
      @rejected="handleNegotiationRejected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElNotification } from "element-plus";
import ChatComposer from "@/features/chat/ChatComposer.vue";
import ChatDialogs from "@/features/chat/ChatDialogs.vue";
import ChatE2eeNegotiationDialog from "@/features/chat/ChatE2eeNegotiationDialog.vue";
import ChatEncryptionDialog from "@/features/chat/ChatEncryptionDialog.vue";
import ChatMessageList from "@/features/chat/ChatMessageList.vue";
import ChatSidebarPanel from "@/features/chat/ChatSidebarPanel.vue";
import EncryptionBadge from "@/components/security/EncryptionBadge.vue";
import SecurityPanel from "@/components/security/SecurityPanel.vue";
import AiStatusBadge from "@/components/ai/AiStatusBadge.vue";
import ConnectionStatusBar from "@/components/status/ConnectionStatusBar.vue";
import { useChatPage } from "@/features/chat/composables/useChatPage";
import { useE2eeSessionStatus } from "@/features/e2ee/composables/useE2eeSessionStatus";
import { onE2eeNegotiation } from "@/features/e2ee/negotiation-events";
import type { E2eeNegotiationEvent } from "@/features/e2ee/negotiation-events";
import { buildSessionId } from "@/normalizers/chat";
import {
  ArrowLeft,
  ChatDotRound,
  Close,
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
    import("@/features/e2ee/manager/negotiation").then(({ setLocalSessionStatus }) => {
      setLocalSessionStatus(event.sessionId, "encrypted");
      retryDecryptPendingMessages(event.sessionId);
    });
  } else if (event.action === "rejected") {
    import("@/features/e2ee/manager/negotiation").then(({ resetNegotiation }) => {
      resetNegotiation(event.sessionId, "plaintext");
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
  try {
    const { getPendingMessages, clearPendingMessages } = await import("@/features/e2ee/manager/pending-messages");
    const { e2eeManager } = await import("@/features/e2ee/manager/e2ee-manager");
    const pending = getPendingMessages(sessionId);
    if (pending.length === 0) return;

    let decryptedCount = 0;
    for (const msg of pending) {
      try {
        if (msg.header && msg.content) {
          const decrypted = await e2eeManager.decryptMessage(
            sessionId, msg.peerId, msg.header as import("@/features/e2ee/types").RatchetHeader, msg.content,
            msg.senderIdentityKey, msg.ephemeralPublicKey,
          );
          if (decrypted) {
            msg.messageRef.content = decrypted;
            msg.messageRef.encrypted = false;
            decryptedCount++;
          }
        }
      } catch {
        // Individual message decrypt failed
      }
    }
    clearPendingMessages(sessionId);
    if (decryptedCount > 0) {
      console.log(`[E2EE] Decrypted ${decryptedCount}/${pending.length} pending messages for session=${sessionId}`);
    }
  } catch {
    // Pending message retry is best-effort
  }
};

const handleNegotiationAccepted = () => {
  showNegotiationDialog.value = false;
  const sessionId = pendingNegotiation.value?.sessionId;
  pendingNegotiation.value = null;
  if (sessionId) {
    retryDecryptPendingMessages(sessionId);
  }
};

const handleNegotiationRejected = () => {
  showNegotiationDialog.value = false;
  pendingNegotiation.value = null;
};

const handleChatAction = (command: string | number | object) => {
  if (command === "enable-encryption") {
    openEncryptionDialog();
    return;
  }
  void handleSessionAction(command);
};
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
  transition:
    background var(--motion-fast) var(--motion-ease),
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
  transition:
    background var(--motion-fast) var(--motion-ease),
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
  position: relative;
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
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  max-height: 76px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
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
  transition: background-color var(--motion-normal, 180ms)
    var(--motion-ease, ease);
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

.chat-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--chat-text-tertiary);
  background: rgba(148, 163, 184, 0.1);
}

.status-chip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--chat-text-tertiary);
  flex-shrink: 0;
}

.status-chip.online {
  color: var(--chat-success);
  background: rgba(34, 197, 94, 0.08);
}

.status-chip.online .status-chip-dot {
  background: var(--chat-success);
}

.status-chip.secure {
  color: var(--color-success, #22c55e);
  background: rgba(34, 197, 94, 0.08);
}

.status-chip.secure .status-chip-dot {
  background: var(--color-success, #22c55e);
}

.status-chip.negotiating {
  color: var(--color-warning, #f59e0b);
  background: rgba(251, 191, 36, 0.08);
}

.status-chip.negotiating .status-chip-dot {
  background: var(--color-warning, #f59e0b);
}

.status-chip.failed {
  color: var(--color-danger, #ef4444);
  background: rgba(239, 68, 68, 0.08);
}

.status-chip.failed .status-chip-dot {
  background: var(--color-danger, #ef4444);
}

.status-chip.ai {
  color: var(--color-primary-2, #818cf8);
  background: rgba(129, 140, 248, 0.08);
}

.status-chip.ai .status-chip-dot {
  background: var(--color-primary-2, #818cf8);
}

.chat-header-side {
  display: flex;
  align-items: center;
  gap: 8px;
}

.security-badge-wrap {
  position: relative;
  z-index: 40;
}

.header-ai-badge-wrap {
  cursor: pointer;
}

.header-ai-badge {
  cursor: pointer;
}

.security-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 300px;
  z-index: 1000;
  pointer-events: auto;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition:
    opacity var(--motion-normal, 180ms) var(--motion-ease, ease),
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
      animation: slideInRight var(--motion-normal, 180ms)
        var(--motion-ease, ease);
    }
  }

  .chat-header {
    min-height: 58px;
    padding: 8px 10px;
    gap: 8px;
  }

  .chat-status-row {
    gap: 4px;
  }

  .status-chip {
    font-size: 10px;
    padding: 1px 6px;
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
