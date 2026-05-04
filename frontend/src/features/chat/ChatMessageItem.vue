<template>
  <div
    v-memo="[renderDigest, audioPlaying]"
    class="message-item"
    :class="{
      'is-mine': isMine,
      'is-system': isSystemMessage,
      'is-status-only': isRecalled || isDeleted,
      'is-ai': isAiGenerated,
      'is-compact': compact,
    }"
    @contextmenu.prevent="handleContextMenu"
  >
    <template v-if="isSystemMessage">
      <div class="system-pill">{{ content }}</div>
    </template>

    <template v-else>
      <el-avatar
        v-if="!isMine && showAvatar"
        :size="32"
        :src="senderAvatar"
        class="message-avatar"
      >
        {{ senderAvatarText }}
      </el-avatar>

      <div v-else-if="!isMine" class="message-avatar-spacer"></div>

      <div class="message-lane">
        <div v-if="showSenderLabel" class="message-sender">
          {{ senderName || t("message.unknownUser") }}
        </div>

        <div class="message-stack">
          <div class="message-bubble" :class="bubbleClass">
            <div v-if="isRecalled" class="status-copy">
              {{ t("message.recalled") }}
            </div>
            <div v-else-if="isDeleted" class="status-copy">
              {{ t("message.deleted") }}
            </div>

            <div v-else-if="messageType === 'TEXT'" class="text-content">
              <span v-html="renderedContent"></span>
            </div>

            <div v-else-if="messageType === 'AI_REPLY'" class="text-content">
              <span class="ai-badge">AI</span>
              <span v-if="aiProvider" class="ai-provider">{{
                aiProvider
              }}</span>
              <span v-html="renderedContent"></span>
            </div>

            <button
              v-else-if="messageType === 'IMAGE'"
              type="button"
              class="media-card interactive-reset"
              :aria-label="t('message.previewImage')"
              @click="emit('preview-image', messageId)"
            >
              <el-image
                :src="mediaSource"
                :preview-src-list="[]"
                :scroll-container="imageScrollContainer || undefined"
                fit="cover"
                class="message-image"
                @load="handleMediaLoaded"
                @error="handleMediaLoaded"
              >
                <template #placeholder>
                  <div class="media-placeholder">
                    {{ t("message.loadingImage") }}
                  </div>
                </template>
                <template #error>
                  <div class="media-placeholder">
                    {{ t("message.previewUnavailable") }}
                  </div>
                </template>
              </el-image>
            </button>

            <div v-else-if="messageType === 'FILE'" class="attachment-card">
              <div class="attachment-icon">
                <el-icon><Document /></el-icon>
              </div>
              <div class="attachment-meta">
                <div class="attachment-title">
                  {{ fileName || t("message.unknownFile") }}
                </div>
                <div class="attachment-subtitle">
                  {{ fileSizeLabel || t("message.sizeUnknown") }}
                </div>
              </div>
              <button
                type="button"
                class="attachment-action interactive-reset"
                @click="emit('download-file', messageId)"
              >
                {{ t("message.download") }}
              </button>
            </div>

            <button
              v-else-if="messageType === 'VOICE'"
              type="button"
              class="attachment-card attachment-card-voice interactive-reset"
              @click="emit('toggle-audio', messageId)"
            >
              <div class="attachment-icon">
                <el-icon>
                  <VideoPause v-if="audioPlaying" />
                  <Microphone v-else />
                </el-icon>
              </div>
              <div class="attachment-meta">
                <div class="attachment-title">
                  {{
                    audioPlaying
                      ? t("message.playingVoice")
                      : t("message.voice")
                  }}
                </div>
                <div class="attachment-subtitle">
                  {{ durationLabel || "0:00" }}
                </div>
              </div>
            </button>

            <div
              v-else-if="messageType === 'VIDEO'"
              class="media-card media-card-video"
            >
              <video
                :src="mediaSource"
                :poster="thumbnailUrl"
                controls
                class="message-video"
                @play="emit('play-video', messageId)"
                @loadeddata="handleMediaLoaded"
              />
              <div class="media-caption">
                <span>{{ t("message.video") }}</span>
                <span>{{ durationLabel || "0:00" }}</span>
              </div>
            </div>
          </div>

          <div class="message-meta" :class="{ 'is-mine': isMine }">
            <span class="message-time">{{ timeLabel }}</span>
            <span
              v-if="statusLabel"
              class="message-state"
              :class="statusToneClass"
              :aria-label="statusLabel"
            >
              <span
                v-if="statusTone === 'sending'"
                class="status-icon status-sending"
              >
                <el-icon class="spin"><Loading /></el-icon>
              </span>
              <span
                v-else-if="statusTone === 'loading'"
                class="status-icon status-sending"
              >
                <el-icon class="spin"><Loading /></el-icon>
              </span>
              <span
                v-else-if="statusTone === 'sent'"
                class="status-icon status-sent"
              >
                <el-icon><Check /></el-icon>
              </span>
              <span
                v-else-if="statusTone === 'delivered'"
                class="status-icon status-delivered"
              >
                <el-icon><Check /></el-icon>
              </span>
              <span
                v-else-if="statusTone === 'read'"
                class="status-icon status-read"
              >
                <el-icon><Check /></el-icon>
              </span>
              <el-icon
                v-else-if="statusTone === 'failed'"
                class="message-state-icon"
              >
                <Warning />
              </el-icon>
              {{ statusLabel }}
            </span>
            <button
              v-if="groupReadLabel"
              type="button"
              class="message-state interactive-reset is-link"
              :title="groupReadLabel"
              @click.stop="emit('show-group-readers', messageId)"
            >
              {{ groupReadLabel }}
            </button>
          </div>
        </div>
      </div>
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
const renderedContent = computed(() => {
  const text = props.content || "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(
    /@(\S+)/g,
    '<span class="mention-highlight">@$1</span>',
  );
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
}

.message-item {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 12px;
  animation: msgFadeIn 0.25s var(--motion-out, ease-out) both;

  &.is-mine {
    justify-content: flex-end;
  }

  &.is-system {
    justify-content: center;
    margin-bottom: 12px;
  }

  &.is-compact {
    margin-bottom: 2px;
  }
}

.message-avatar {
  flex-shrink: 0;
  border: 1px solid var(--chat-panel-border);
}

.message-avatar-spacer {
  flex-shrink: 0;
  width: 32px;
}

.message-lane {
  min-width: 0;
  max-width: var(--chat-max-bubble-width);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-sender {
  padding-left: 4px;
  color: var(--chat-accent-strong);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.message-bubble {
  position: relative;
  max-width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--chat-panel-border);
  background: var(--chat-bubble-other);
  color: var(--chat-text-primary);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  backdrop-filter: var(--chat-glass-blur);
  overflow: hidden;
  transition: box-shadow 0.15s ease;

  &.is-own {
    border-color: transparent;
    background: linear-gradient(
      135deg,
      var(--color-primary, #6366f1),
      var(--color-primary-2, #818cf8)
    );
    color: #fff;
    box-shadow: 0 1px 4px rgba(99, 102, 241, 0.12);
  }

  &.is-muted {
    background: rgba(248, 250, 252, 0.96);
    color: var(--chat-text-tertiary);
  }
}

.message-item.is-ai .message-bubble:not(.is-own) {
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.06),
    rgba(139, 92, 246, 0.06)
  );
  border-color: rgba(99, 102, 241, 0.15);
}

.text-content,
.status-copy {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.media-card {
  width: min(320px, 62vw);
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-sm, 8px);
  background: rgba(248, 250, 252, 0.94);
  overflow: hidden;
}

.attachment-card {
  width: min(320px, 62vw);
  border-radius: var(--radius-sm, 8px);
  background: rgba(248, 250, 252, 0.94);
  overflow: hidden;
}

.message-bubble.is-own .media-card,
.message-bubble.is-own .attachment-card {
  background: rgba(255, 255, 255, 0.16);
}

.message-bubble:has(.media-card) {
  padding: 0;

  .media-card {
    border-radius: 0;
  }
}

.message-image,
.message-video {
  display: block;
  width: 100%;
}

.message-image {
  aspect-ratio: 4 / 3;
}

.message-video {
  max-height: 260px;
  background: rgba(15, 23, 42, 0.88);
}

.media-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  color: var(--chat-text-tertiary);
  font-size: 13px;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
}

.media-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 12px;
  color: inherit;
  font-size: 12px;
  font-weight: 600;
}

.attachment-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
}

.attachment-card-voice {
  text-align: left;
  cursor: pointer;
}

.attachment-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm, 8px);
  background: rgba(99, 102, 241, 0.1);
  color: var(--color-primary, #6366f1);
  font-size: 18px;
  flex-shrink: 0;
}

.message-bubble.is-own .attachment-icon {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.attachment-meta {
  min-width: 0;
  flex: 1;
}

.attachment-title {
  color: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
}

.attachment-subtitle {
  margin-top: 4px;
  color: inherit;
  opacity: 0.72;
  font-size: 12px;
}

.attachment-action {
  flex-shrink: 0;
  padding: 8px 10px;
  border-radius: var(--radius-sm, 8px);
  background: rgba(99, 102, 241, 0.1);
  color: var(--color-primary, #6366f1);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(99, 102, 241, 0.18);
  }
}

.message-bubble.is-own .attachment-action {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

.message-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
  color: var(--chat-text-quaternary);
  font-size: 10px;
  line-height: 1.2;
  opacity: 0.7;

  &.is-mine {
    justify-content: flex-end;
  }
}

.message-time {
  white-space: nowrap;
}

.message-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--chat-text-tertiary);
  font-weight: 600;
}

.message-state-icon {
  font-size: 12px;
}

.message-state.is-failed {
  color: var(--chat-danger, #ef4444);
}

.message-state.is-read {
  color: var(--chat-success, #22c55e);
}

.message-state.is-link {
  cursor: pointer;
}

.status-icon {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
}

.status-sending {
  color: var(--text-placeholder);
}

.status-sent {
  color: var(--text-placeholder);
  animation: fadeIn 0.3s ease;
}

.status-delivered {
  color: var(--text-secondary);
  animation: fadeIn 0.3s ease;
}

.status-read {
  color: var(--el-color-primary);
  animation: colorShift 0.3s ease;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes colorShift {
  from {
    color: var(--text-secondary);
  }
  to {
    color: var(--el-color-primary);
  }
}

.ai-provider {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: var(--radius-xs, 4px);
  margin-right: 4px;
  background: color-mix(
    in srgb,
    var(--color-primary, #6366f1),
    transparent 85%
  );
  color: var(--color-primary, #6366f1);
  vertical-align: middle;
  text-transform: capitalize;
}

.system-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: min(100%, 460px);
  padding: 6px 14px;
  border-radius: var(--radius-full, 999px);
  background: var(--chat-bubble-system);
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  backdrop-filter: blur(8px);
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
  .message-item {
    gap: 6px;
    margin-bottom: 10px;
  }

  .message-item.is-compact {
    margin-bottom: 1px;
  }

  .message-avatar {
    width: 36px;
    height: 36px;
  }

  .message-avatar-spacer {
    width: 36px;
  }

  .message-bubble {
    padding: 8px 10px;
    border-radius: var(--radius-sm, 8px);
  }

  .text-content,
  .status-copy {
    font-size: 14px;
    line-height: 1.6;
  }

  .attachment-card {
    width: min(280px, 64vw);
  }

  .media-card {
    width: min(280px, 64vw);
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
