<template>
  <div
    v-memo="[renderDigest, audioPlaying]"
    class="msg-item"
    :class="{
      'msg-item--self': isMine,
      'msg-item--compact': compact,
      'msg-item--system': isSystemMessage,
    }"
    @contextmenu.prevent="handleContextMenu"
  >
    <div v-if="isSystemMessage" class="msg-system">
      {{ content }}
    </div>

    <template v-else>
      <!-- 对方头像在左 -->
      <el-avatar
        v-if="!isMine && showAvatar"
        :src="senderAvatar"
        :size="36"
        class="msg-avatar msg-avatar--left"
      >
        {{ senderAvatarText }}
      </el-avatar>
      <div v-else-if="!isMine" class="msg-avatar-spacer"></div>

      <div class="msg-body" :class="{ 'msg-body--self': isMine }">
        <!-- 昵称（群聊） -->
        <div v-if="showSenderLabel && !isMine" class="msg-sender">
          {{ senderName || t("message.unknownUser") }}
        </div>

        <div class="msg-bubble" :class="bubbleClass">
          <!-- 撤回 / 删除 -->
          <div v-if="isRecalled" class="msg-text status-copy">
            {{ t("message.recalled") }}
          </div>
          <div v-else-if="isDeleted" class="msg-text status-copy">
            {{ t("message.deleted") }}
          </div>

          <!-- 文件 -->
          <div v-else-if="messageType === 'FILE'" class="msg-file" @click="emit('download-file', messageId)">
            <el-icon><Document /></el-icon>
            <span class="msg-file-name">{{ fileName || t("message.unknownFile") }}</span>
            <span class="msg-file-size">{{ fileSizeLabel || '' }}</span>
          </div>

          <!-- 图片 -->
          <button
            v-else-if="messageType === 'IMAGE'"
            type="button"
            class="interactive-reset msg-image-btn"
            :aria-label="t('message.previewImage')"
            @click="emit('preview-image', messageId)"
          >
            <el-image
              :src="mediaSource"
              :preview-src-list="[]"
              :scroll-container="imageScrollContainer || undefined"
              fit="contain"
              class="msg-image"
              @load="handleMediaLoaded"
              @error="handleMediaLoaded"
            >
              <template #placeholder>
                <div class="media-placeholder">{{ t("message.loadingImage") }}</div>
              </template>
              <template #error>
                <div class="media-placeholder">{{ t("message.previewUnavailable") }}</div>
              </template>
            </el-image>
          </button>

          <!-- 语音 -->
          <button
            v-else-if="messageType === 'VOICE'"
            type="button"
            class="interactive-reset msg-voice"
            @click="emit('toggle-audio', messageId)"
          >
            <el-icon>
              <VideoPause v-if="audioPlaying" />
              <Microphone v-else />
            </el-icon>
            <span>{{ durationLabel || "0:00" }}</span>
          </button>

          <!-- 视频 -->
          <div v-else-if="messageType === 'VIDEO'" class="msg-video-card">
            <video
              :src="mediaSource"
              :poster="thumbnailUrl"
              controls
              class="msg-video"
              @play="emit('play-video', messageId)"
              @loadeddata="handleMediaLoaded"
            />
          </div>

          <!-- AI 回复 -->
          <div v-else-if="messageType === 'AI_REPLY'" class="msg-text">
            <span class="ai-badge">AI</span>
            <span v-if="aiProvider" class="ai-provider">{{ aiProvider }}</span>
            <span v-if="shouldMaskEncryptedContent" class="msg-encrypted">加密消息暂无法解密</span>
            <template v-else v-for="(token, ti) in messageTokens" :key="ti">
              <span v-if="token.type === 'mention'" class="mention-highlight">{{ token.text }}</span>
              <template v-else>{{ token.text }}</template>
            </template>
          </div>

          <!-- 文本 -->
          <div v-else class="msg-text">
            <span v-if="shouldMaskEncryptedContent" class="msg-encrypted">加密消息暂无法解密</span>
            <template v-else v-for="(token, ti) in messageTokens" :key="ti">
              <span v-if="token.type === 'mention'" class="mention-highlight">{{ token.text }}</span>
              <template v-else>{{ token.text }}</template>
            </template>
          </div>
        </div>

        <div class="msg-meta" :class="{ 'msg-meta--self': isMine }">
          <span class="msg-time">{{ timeLabel }}</span>
          <ChatEncryptionBadge :encrypted="encrypted" />
          <span
            v-if="statusLabel"
            class="msg-state"
            :class="statusToneClass"
            :aria-label="statusLabel"
          >
            <span v-if="statusTone === 'sending' || statusTone === 'loading'" class="msg-state-icon">
              <el-icon class="spin"><Loading /></el-icon>
            </span>
            <span v-else-if="statusTone === 'sent'" class="msg-state-icon">
              <el-icon><Check /></el-icon>
            </span>
            <span v-else-if="statusTone === 'delivered'" class="msg-state-icon">
              <el-icon><Check /></el-icon>
            </span>
            <span v-else-if="statusTone === 'read'" class="msg-state-icon">
              <el-icon><Check /></el-icon>
            </span>
            <el-icon v-else-if="statusTone === 'failed'" class="msg-state-icon msg-state-icon--failed">
              <Warning />
            </el-icon>
            {{ statusLabel }}
          </span>
          <button
            v-if="groupReadLabel"
            type="button"
            class="msg-state interactive-reset is-link"
            :title="groupReadLabel"
            @click.stop="emit('show-group-readers', messageId)"
          >
            {{ groupReadLabel }}
          </button>
        </div>
      </div>

      <!-- 自己头像在右 -->
      <el-avatar
        v-if="isMine && showAvatar"
        :src="senderAvatar"
        :size="36"
        class="msg-avatar msg-avatar--right"
      >
        {{ senderAvatarText }}
      </el-avatar>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Check,
  Document,
  Loading,
  Microphone,
  VideoPause,
  Warning,
} from "@element-plus/icons-vue";
import { useI18nStore } from "@/stores/i18n";
import { getAvatarText } from "@/utils/common";
import ChatEncryptionBadge from "@/features/chat/ChatEncryptionBadge.vue";
import { parseMessageTokens } from "@/features/chat/utils/renderMessageTokens";
import type { MessageType } from "@/types";

interface Props {
  messageId: string;
  renderDigest: string;
  isMine: boolean;
  isSystemMessage: boolean;
  isRecalled: boolean;
  isDeleted: boolean;
  messageType: MessageType;
  content: string;
  isAiGenerated?: boolean;
  aiProvider?: string;
  senderName?: string;
  senderAvatar?: string;
  showSenderLabel?: boolean;
  currentUserName?: string;
  currentUserAvatar?: string;
  timeLabel?: string;
  statusLabel?: string;
  statusTone?:
    | "default"
    | "loading"
    | "sending"
    | "sent"
    | "delivered"
    | "failed"
    | "read";
  groupReadLabel?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSizeLabel?: string;
  durationLabel?: string;
  audioPlaying?: boolean;
  imageScrollContainer?: HTMLElement | null;
  showAvatar?: boolean;
  compact?: boolean;
  encrypted?: boolean;
  decryptStatus?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showSenderLabel: false,
  currentUserName: "",
  currentUserAvatar: "",
  timeLabel: "",
  statusLabel: "",
  statusTone: "default",
  groupReadLabel: "",
  mediaUrl: "",
  thumbnailUrl: "",
  fileName: "",
  fileSizeLabel: "",
  durationLabel: "",
  audioPlaying: false,
  imageScrollContainer: null,
  showAvatar: true,
  compact: false,
  encrypted: false,
});

const emit = defineEmits<{
  (e: "show-group-readers", messageId: string): void;
  (e: "open-context-menu", messageId: string, event: MouseEvent): void;
  (e: "toggle-audio", messageId: string): void;
  (e: "download-file", messageId: string): void;
  (e: "preview-image", messageId: string): void;
  (e: "play-video", messageId: string): void;
  (e: "media-loaded", messageId: string): void;
}>();

const { t } = useI18nStore();
const senderAvatarText = computed(() =>
  getAvatarText(props.senderName || t("message.unknownUser")),
);
const mediaSource = computed(() => props.mediaUrl || props.content);
const messageTokens = computed(() => parseMessageTokens(props.content || ""));
const shouldMaskEncryptedContent = computed(() => {
  // 自己的加密消息：content 是本地明文，不遮罩
  if (props.isMine) return false;
  // 已成功解密：content 是解密结果
  if (props.decryptStatus === "success") return false;
  // 解密失败或未解密：遮罩，content 为空时 UI 显示占位文案
  return !props.content && !!props.encrypted;
});
const bubbleClass = computed(() => ({
  "is-own": props.isMine,
  "is-muted": props.isRecalled || props.isDeleted,
}));
const statusToneClass = computed(() => ({
  "is-failed": props.statusTone === "failed",
  "is-read": props.statusTone === "read",
  "is-sending": props.statusTone === "sending",
  "is-sent": props.statusTone === "sent",
  "is-delivered": props.statusTone === "delivered",
}));

const handleContextMenu = (event: MouseEvent) => {
  if (props.isSystemMessage) {
    return;
  }
  emit("open-context-menu", props.messageId, event);
};

const handleMediaLoaded = () => {
  emit("media-loaded", props.messageId);
};
</script>

<style scoped lang="scss">
.interactive-reset {
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
}

.msg-item {
  display: flex;
  align-items: flex-start;
  padding: 0 var(--space-4, 16px);
  margin-bottom: 24px !important;
  animation: msgFadeIn 0.25s var(--motion-out, ease-out) both;

  &--self { flex-direction: row-reverse; }
  &--compact { margin-bottom: 24px !important; }
  &--system { justify-content: center; margin-bottom: 20px !important; }
}

.msg-avatar {
  flex-shrink: 0;
  margin-top: 0;
  &--left { margin-right: var(--space-2); }
  &--right { margin-left: var(--space-2); }
}

.msg-avatar-spacer {
  flex-shrink: 0;
  width: 36px;
}

.msg-body {
  max-width: var(--chat-bubble-max-width, 420px);
  min-width: 0;
}

.msg-sender {
  font-size: var(--font-size-xs, 12px);
  color: var(--text-tertiary);
  margin-bottom: 2px;
}

.msg-bubble {
  display: inline-block;
  padding: 9px 13px;
  border-radius: var(--chat-bubble-radius, 12px);
  font-size: var(--font-size-base, 14px);
  line-height: var(--line-height-base, 1.5);
  word-break: break-word;
  background: var(--chat-bubble-other);
  color: var(--chat-bubble-other-text, var(--chat-text-primary));
  border: 0.5px solid var(--border-light, var(--chat-panel-border));

  &.is-own {
    background: var(--chat-bubble-own);
    color: var(--chat-bubble-own-text, #fff);
    border: none;
  }

  &.is-muted {
    background: rgba(248, 250, 252, 0.96);
    color: var(--chat-text-tertiary);
  }
}

.msg-image {
  max-width: 240px;
  border-radius: var(--radius-xs, 4px);
  display: block;
  width: 100%;
  height: auto;
  max-height: 320px;
  object-fit: cover;
}

.msg-image-btn {
  display: block;
  width: 100%;
  max-width: min(320px, 62vw);
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.media-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 240px;
  max-width: 100%;
  aspect-ratio: 4 / 3;
  color: var(--chat-text-tertiary);
  font-size: 13px;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
}

.msg-file {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;

  &-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }

  &-size {
    color: var(--text-tertiary);
    font-size: var(--font-size-xs, 12px);
  }
}

.msg-voice {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
  min-width: 60px;
  text-align: left;
}

.msg-video-card {
  max-width: min(320px, 62vw);
  border-radius: var(--radius-sm, 8px);
  overflow: hidden;
}

.msg-video {
  display: block;
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  background: rgba(15, 23, 42, 0.88);
  border-radius: var(--radius-sm, 8px);
}

.msg-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  &.status-copy {
    font-size: 14px;
    line-height: 1.5;
    color: var(--chat-text-tertiary);
  }
}

.msg-encrypted {
  color: var(--text-tertiary);
  font-style: italic;
  font-size: var(--font-size-sm, 13px);
}

.msg-meta {
  font-size: var(--font-size-xs, 12px);
  color: var(--text-tertiary);
  margin-top: var(--space-1, 4px);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 4px);

  &--self { text-align: right; justify-content: flex-end; }
}

.msg-time {
  white-space: nowrap;
}

.msg-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  cursor: default;

  &.is-link {
    cursor: pointer;
  }

  &.is-failed {
    color: var(--chat-danger, #ef4444);
  }

  &.is-read {
    color: var(--chat-success, #22c55e);
  }
}

.msg-state-icon {
  display: inline-flex;
  align-items: center;
  font-size: 12px;

  &--failed {
    color: var(--chat-danger, #ef4444);
  }
}

.msg-system {
  text-align: center;
  font-size: var(--font-size-xs, 12px);
  color: var(--text-tertiary);
  padding: var(--space-1, 4px) var(--space-4, 16px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: min(100%, 460px);
  background: var(--chat-bubble-system);
  backdrop-filter: blur(8px);
  border-radius: var(--radius-full, 999px);
  font-weight: 600;
  padding: 6px 14px;
}

.ai-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: var(--radius-xs, 4px);
  margin-right: 2px;
  background: var(--color-primary, #6366f1);
  color: #fff;
  vertical-align: middle;
}

.ai-provider {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: var(--radius-xs, 4px);
  margin-right: 4px;
  background: color-mix(in srgb, var(--color-primary, #6366f1), transparent 85%);
  color: var(--color-primary, #6366f1);
  vertical-align: middle;
  text-transform: capitalize;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes msgFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .msg-item {
    padding: 0 var(--space-2, 8px);
  }
  .msg-bubble {
    padding: 8px 10px;
  }
  .msg-image {
    max-width: 200px;
  }
  .msg-file {
    font-size: var(--font-size-xs, 12px);
  }
}
</style>

<style>
.mention-highlight {
  color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.1);
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 500;
}
</style>
