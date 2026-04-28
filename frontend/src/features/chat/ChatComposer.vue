<template>
  <div class="composer-shell">
    <div class="composer-surface" :class="{ 'is-disabled': disabled, 'is-focused': isFocused }">
      <div class="composer-row">
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-button interactive-reset"
            :title="t('composer.sendImage')"
            :aria-label="t('composer.sendImage')"
            :disabled="disabled || uploading || isRecording"
            @click="selectImage"
          >
            <el-icon><Picture /></el-icon>
          </button>
          <button
            type="button"
            class="toolbar-button interactive-reset"
            :title="t('composer.sendFile')"
            :aria-label="t('composer.sendFile')"
            :disabled="disabled || uploading || isRecording"
            @click="selectFile"
          >
            <el-icon><Paperclip /></el-icon>
          </button>
          <button
            type="button"
            class="toolbar-button interactive-reset"
            :class="{ 'is-recording': isRecording }"
            :title="isRecording ? t('composer.stopVoice') : t('composer.recordVoice')"
            :aria-label="isRecording ? t('composer.stopVoice') : t('composer.recordVoice')"
            :disabled="disabled || uploading"
            @click="toggleVoiceRecording"
          >
            <el-icon>
              <VideoPause v-if="isRecording" />
              <Microphone v-else />
            </el-icon>
          </button>
        </div>

        <textarea
          ref="textareaRef"
          v-model="messageInput"
          class="chat-textarea"
          aria-label="Message input"
          :placeholder="placeholderText"
          :disabled="disabled || uploading || isRecording"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @paste="handlePaste"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.enter.shift.exact="handleShiftEnter"
        ></textarea>

        <button
          type="button"
          class="send-button interactive-reset"
          :class="{ 'can-send': canSend }"
          :disabled="!canSend"
          @click="handleSend"
        >
          <span>{{ uploading ? t("composer.sending") : t("composer.send") }}</span>
        </button>
      </div>
    </div>

    <input
      ref="imageInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleImageSelect"
    />
    <input
      ref="fileInputRef"
      type="file"
      style="display: none"
      @change="handleFileSelect"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onUnmounted, ref} from "vue";
import {Microphone, Paperclip, Picture, VideoPause} from "@element-plus/icons-vue";
import {useFileMessageUpload} from "@/features/chat/composables/useFileMessageUpload";
import {useVoiceRecorder} from "@/features/chat/composables/useVoiceRecorder";
import {useI18nStore} from "@/stores/i18n";
import type {MessageType} from "@/types";

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "send-text", value: string): void;
  (e: "send-media", payload: {
    type: Extract<MessageType, "IMAGE" | "FILE" | "VIDEO" | "VOICE">;
    url: string;
    extra?: Record<string, unknown>;
  }): void;
}>();

const imageInputRef = ref<HTMLInputElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const messageInput = ref("");
const isFocused = ref(false);
const {uploading, upload} = useFileMessageUpload();
const {
  isRecording,
  startRecording,
  finishRecording,
  cancelRecording,
} = useVoiceRecorder();
const {t} = useI18nStore();

const placeholderText = computed(() => {
  if (props.disabled) {
    return t("composer.selectConversation");
  }
  return t("composer.writeMessage");
});

const canSend = computed(
  () =>
    !props.disabled &&
    !uploading.value &&
    !isRecording.value &&
    Boolean(messageInput.value.trim()),
);

const focusTextarea = () => {
  if (props.disabled) {
    return;
  }
  nextTick(() => {
    textareaRef.value?.focus();
  });
};

const emitUploadedMedia = async (
  file: File,
  kind: Extract<MessageType, "IMAGE" | "FILE" | "VIDEO" | "VOICE">,
  extra?: Record<string, unknown>,
) => {
  try {
    const result = await upload(file, kind);
    const mediaName = result.fileName || result.originalFilename || result.filename || file.name;
    emit("send-media", {
      type: kind,
      url: result.url,
      extra: {
        mediaName,
        mediaSize: result.size ?? file.size,
        contentType: result.contentType || file.type,
        category: result.category,
        filename: result.filename,
        ...extra,
      },
    });
    focusTextarea();
    return true;
  } catch {
    focusTextarea();
    return false;
  }
};

const handleSend = () => {
  const text = messageInput.value.trim();
  if (!text || !canSend.value) {
    return;
  }
  emit("send-text", text);
  messageInput.value = "";
  focusTextarea();
};

const handleShiftEnter = (event: KeyboardEvent) => {
  const textarea = event.target as HTMLTextAreaElement;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  messageInput.value =
    messageInput.value.slice(0, start) +
    "\n" +
    messageInput.value.slice(end);
  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = start + 1;
  });
};

const selectImage = () => imageInputRef.value?.click();
const selectFile = () => fileInputRef.value?.click();

const readMediaDuration = (file: File) =>
  new Promise<number | undefined>((resolve) => {
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      resolve(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const media = file.type.startsWith("video/")
      ? document.createElement("video")
      : document.createElement("audio");
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      media.removeAttribute("src");
      media.load();
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = Math.round(media.duration);
      cleanup();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : undefined);
    };
    media.onerror = () => {
      cleanup();
      resolve(undefined);
    };
    media.src = objectUrl;
  });

const resolveFileMessageKind = (
  file: File,
): Extract<MessageType, "IMAGE" | "FILE" | "VIDEO" | "VOICE"> => {
  if (file.type.startsWith("image/")) {
    return "IMAGE";
  }
  if (file.type.startsWith("audio/")) {
    return "VOICE";
  }
  if (file.type.startsWith("video/")) {
    return "VIDEO";
  }
  return "FILE";
};

const handleImageSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file) {
    return;
  }
  await emitUploadedMedia(file, "IMAGE");
};

const handleFileSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file) {
    return;
  }
  const kind = resolveFileMessageKind(file);
  const duration =
    kind === "VOICE" || kind === "VIDEO" ? await readMediaDuration(file) : undefined;
  await emitUploadedMedia(file, kind, {duration});
};

const handlePaste = async (event: ClipboardEvent) => {
  if (props.disabled || uploading.value || isRecording.value) {
    return;
  }
  const file = Array.from(event.clipboardData?.items || [])
    .find((item) => item.type.startsWith("image/"))
    ?.getAsFile();
  if (!file) {
    return;
  }
  event.preventDefault();
  await emitUploadedMedia(file, "IMAGE");
};

const toggleVoiceRecording = async () => {
  if (props.disabled || uploading.value) {
    return;
  }
  if (!isRecording.value) {
    await startRecording();
    return;
  }
  const recorded = await finishRecording();
  if (recorded) {
    await emitUploadedMedia(recorded.file, "VOICE", {
      duration: recorded.duration,
    });
  }
};

onUnmounted(() => {
  cancelRecording();
});
</script>

<style scoped lang="scss">
.interactive-reset {
  border: 0;
  background: transparent;
}

.composer-shell {
  padding: 10px 18px 14px;
  border-top: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  backdrop-filter: var(--chat-glass-blur);
}

.composer-surface {
  border-radius: 8px;
  border: 1px solid var(--chat-panel-border);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.composer-surface.is-focused {
  border-color: #8ab4f8;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
}

.composer-surface.is-disabled {
  opacity: 0.72;
}

.composer-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
  min-height: 58px;
  padding: 8px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 3px;
}

.toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--chat-text-secondary);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.toolbar-button:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.1);
  color: var(--chat-accent);
}

.toolbar-button.is-recording {
  background: rgba(239, 68, 68, 0.12);
  color: var(--chat-danger);
  animation: recordingPulse 1.2s ease-in-out infinite;
}

.toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.chat-textarea {
  width: 100%;
  min-height: 40px;
  max-height: 116px;
  padding: 9px 6px;
  border: 0;
  resize: none;
  outline: none;
  background: transparent;
  color: var(--chat-text-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.45;
}

.chat-textarea::placeholder {
  color: var(--chat-text-quaternary);
}

.send-button {
  flex-shrink: 0;
  width: 74px;
  height: 38px;
  border-radius: 8px;
  background: #e2e8f0;
  color: var(--chat-text-quaternary);
  font-size: 13px;
  font-weight: 700;
  cursor: not-allowed;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.send-button.can-send {
  cursor: pointer;
  background: var(--chat-accent);
  color: #fff;
}

.send-button.can-send:hover {
  background: #1d4ed8;
}

@keyframes recordingPulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.18);
  }

  50% {
    box-shadow: 0 0 0 5px rgba(239, 68, 68, 0);
  }
}

@media (max-width: 768px) {
  .composer-shell {
    padding: 8px 10px calc(10px + env(safe-area-inset-bottom, 0px));
  }

  .composer-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px;
    padding: 7px;
  }

  .toolbar-button {
    width: 32px;
    height: 32px;
  }

  .send-button {
    width: 62px;
  }
}
</style>
