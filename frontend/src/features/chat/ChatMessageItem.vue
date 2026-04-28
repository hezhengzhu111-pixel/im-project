<template>
  <div
    v-memo="[renderDigest, audioPlaying]"
    class="message-item"
    :class="{
      'is-mine': isMine,
      'is-system': isSystemMessage,
      'is-status-only': isRecalled || isDeleted,
    }"
    @contextmenu.prevent="handleContextMenu"
  >
    <template v-if="isSystemMessage">
      <div class="system-pill">{{ content }}</div>
    </template>

    <template v-else>
      <el-avatar
        v-if="!isMine"
        :size="32"
        :src="senderAvatar"
        class="message-avatar"
      >
        {{ senderAvatarText }}
      </el-avatar>

      <div class="message-lane">
        <div v-if="showSenderLabel" class="message-sender">
          {{ senderName || t("message.unknownUser") }}
        </div>

        <div class="message-stack">
          <div class="message-bubble" :class="bubbleClass">
            <div v-if="isRecalled" class="status-copy">{{ t("message.recalled") }}</div>
            <div v-else-if="isDeleted" class="status-copy">{{ t("message.deleted") }}</div>

            <div v-else-if="messageType === 'TEXT'" class="text-content">
              {{ content }}
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
                lazy
                class="message-image"
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

            <div v-else-if="messageType === 'FILE'" class="attachment-card">
              <div class="attachment-icon">
                <el-icon><Document /></el-icon>
              </div>
              <div class="attachment-meta">
                <div class="attachment-title">{{ fileName || t("message.unknownFile") }}</div>
                <div class="attachment-subtitle">{{ fileSizeLabel || t("message.sizeUnknown") }}</div>
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
                  {{ audioPlaying ? t("message.playingVoice") : t("message.voice") }}
                </div>
                <div class="attachment-subtitle">{{ durationLabel || "0:00" }}</div>
              </div>
            </button>

            <div v-else-if="messageType === 'VIDEO'" class="media-card media-card-video">
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
              <el-icon v-if="statusTone === 'loading'" class="message-state-icon is-loading">
                <Loading />
              </el-icon>
              <el-icon v-else-if="statusTone === 'failed'" class="message-state-icon">
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
import {computed} from "vue";
import {Document, Loading, Microphone, VideoPause, Warning} from "@element-plus/icons-vue";
import {useI18nStore} from "@/stores/i18n";
import {getAvatarText} from "@/utils/common";
import type {MessageType} from "@/types";

interface Props {
  messageId: string;
  renderDigest: string;
  isMine: boolean;
  isSystemMessage: boolean;
  isRecalled: boolean;
  isDeleted: boolean;
  messageType: MessageType;
  content: string;
  senderName?: string;
  senderAvatar?: string;
  showSenderLabel?: boolean;
  currentUserName?: string;
  currentUserAvatar?: string;
  timeLabel?: string;
  statusLabel?: string;
  statusTone?: "default" | "loading" | "failed" | "read";
  groupReadLabel?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSizeLabel?: string;
  durationLabel?: string;
  audioPlaying?: boolean;
  imageScrollContainer?: HTMLElement | null;
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

const {t} = useI18nStore();
const senderAvatarText = computed(() => getAvatarText(props.senderName || t("message.unknownUser")));
const mediaSource = computed(() => props.mediaUrl || props.content);
const bubbleClass = computed(() => ({
  "is-own": props.isMine,
  "is-muted": props.isRecalled || props.isDeleted,
}));
const statusToneClass = computed(() => ({
  "is-failed": props.statusTone === "failed",
  "is-read": props.statusTone === "read",
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
  margin-bottom: 8px;

  &.is-mine {
    justify-content: flex-end;
  }

  &.is-system {
    justify-content: center;
    margin-bottom: 10px;
  }
}

.message-avatar {
  flex-shrink: 0;
  border: 1px solid var(--chat-panel-border);
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
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--chat-panel-border);
  background: var(--chat-bubble-other);
  color: var(--chat-text-primary);
  box-shadow: var(--chat-message-shadow);
  backdrop-filter: var(--chat-glass-blur);
  overflow: hidden;

  &.is-own {
    border-color: rgba(37, 99, 235, 0.6);
    background: var(--chat-bubble-own);
    color: #fff;
  }

  &.is-muted {
    background: rgba(248, 250, 252, 0.96);
    color: var(--chat-text-tertiary);
  }
}

.text-content,
.status-copy {
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.media-card,
.attachment-card {
  width: min(320px, 62vw);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.94);
  overflow: hidden;
}

.message-bubble.is-own .media-card,
.message-bubble.is-own .attachment-card {
  background: rgba(255, 255, 255, 0.16);
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
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.12);
  color: var(--chat-accent);
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
  border-radius: 8px;
  background: rgba(37, 99, 235, 0.12);
  color: var(--chat-accent-strong);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.message-bubble.is-own .attachment-action {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.message-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
  color: var(--chat-text-quaternary);
  font-size: 11px;
  line-height: 1.2;

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
  color: var(--chat-danger);
}

.message-state.is-read {
  color: var(--chat-success);
}

.message-state.is-link {
  cursor: pointer;
}

.system-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: min(100%, 460px);
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--chat-bubble-system);
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

@media (max-width: 768px) {
  .message-item {
    gap: 8px;
    margin-bottom: 8px;
  }

  .message-avatar {
    width: 36px;
    height: 36px;
  }

  .message-bubble {
    padding: 8px 10px;
    border-radius: 8px;
  }

  .text-content,
  .status-copy {
    font-size: 14px;
    line-height: 1.6;
  }

  .attachment-card,
  .media-card {
    width: min(280px, 64vw);
  }
}
</style>
