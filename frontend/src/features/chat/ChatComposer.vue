<template>
  <div class="composer-shell">
    <div class="composer-surface" :class="{ 'is-disabled': disabled, 'is-focused': isFocused }">
      <div class="composer-toolbar">
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-button interactive-reset"
            title="Send image"
            aria-label="Send image"
            :disabled="disabled || uploading"
            @click="selectImage"
          >
            <el-icon><Picture /></el-icon>
          </button>
          <button
            type="button"
            class="toolbar-button interactive-reset"
            title="Send file"
            aria-label="Send file"
            :disabled="disabled || uploading"
            @click="selectFile"
          >
            <el-icon><Paperclip /></el-icon>
          </button>
          <button
            type="button"
            class="toolbar-button interactive-reset"
            :class="{ 'is-active': isVoiceMode }"
            :title="isVoiceMode ? 'Switch to keyboard' : 'Voice message'"
            :aria-label="isVoiceMode ? 'Switch to keyboard' : 'Voice message'"
            :disabled="disabled || uploading"
            @click="toggleVoiceMode"
          >
            <el-icon><component :is="voiceModeIcon" /></el-icon>
          </button>
          <button
            type="button"
            class="toolbar-button interactive-reset"
            title="Emoji tools coming soon"
            aria-label="Emoji tools coming soon"
            disabled
          >
            <span class="toolbar-emoji">☺</span>
          </button>
        </div>

        <div class="toolbar-status">
          {{ uploading ? "Uploading..." : isVoiceMode ? "Hold to talk" : "Shift + Enter for a new line" }}
        </div>
      </div>

      <div class="composer-body">
        <textarea
          v-if="!isVoiceMode"
          ref="textareaRef"
          v-model="messageInput"
          class="chat-textarea"
          aria-label="Message input"
          :placeholder="placeholderText"
          :disabled="disabled || uploading"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @paste="handlePaste"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.enter.shift.exact="handleShiftEnter"
        ></textarea>

        <div v-else class="voice-input-area">
          <button
            type="button"
            class="voice-record-btn interactive-reset"
            :class="{ 'is-recording': isRecording }"
            :disabled="disabled || uploading"
            @mousedown="handleStartRecording"
            @mouseup="handleStopRecording"
            @mouseleave="handleCancelRecording"
            @touchstart.prevent="handleStartRecording"
            @touchend.prevent="handleStopRecording"
          >
            <span class="voice-button-title">
              {{ isRecording ? "Release to send" : "Hold to talk" }}
            </span>
            <span class="voice-button-subtitle">
              {{ isRecording ? "Recording is in progress" : "Tap and hold anywhere on the button" }}
            </span>
          </button>
          <div v-if="isRecording" class="recording-indicator">
            <span class="recording-dot"></span>
            <span>Recording...</span>
          </div>
        </div>

        <button
          v-if="!isVoiceMode"
          type="button"
          class="send-button interactive-reset"
          :class="{ 'can-send': canSend }"
          :disabled="!canSend"
          @click="handleSend"
        >
          <span>Send</span>
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
import {computed, nextTick, ref} from "vue";
import {ChatLineSquare, Microphone, Paperclip, Picture} from "@element-plus/icons-vue";
import {useFileMessageUpload} from "@/features/chat/composables/useFileMessageUpload";
import {useVoiceRecorder} from "@/features/chat/composables/useVoiceRecorder";
import type {MessageType} from "@/types";

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "send-text", value: string): void;
  (e: "send-media", payload: {
    type: Extract<MessageType, "IMAGE" | "FILE" | "VOICE">;
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
  isVoiceMode,
  isRecording,
  toggleVoiceMode,
  startRecording,
  finishRecording,
  cancelRecording,
} = useVoiceRecorder();

const voiceModeIcon = computed(() =>
  isVoiceMode.value ? ChatLineSquare : Microphone,
);

const placeholderText = computed(() => {
  if (props.disabled) {
    return "Select a conversation to start typing";
  }
  return "Write a message...";
});

const canSend = computed(
  () => !props.disabled && !uploading.value && Boolean(messageInput.value.trim()),
);

const focusTextarea = () => {
  if (props.disabled || isVoiceMode.value) {
    return;
  }
  nextTick(() => {
    textareaRef.value?.focus();
  });
};

const emitUploadedMedia = async (
  file: File,
  kind: Extract<MessageType, "IMAGE" | "FILE" | "VOICE">,
  extra?: Record<string, unknown>,
) => {
  const result = await upload(file, kind);
  emit("send-media", {
    type: kind,
    url: result.url,
    extra:
      kind === "FILE"
        ? {
            mediaName: result.fileName,
            mediaSize: result.size,
            ...extra,
          }
        : extra,
  });
  focusTextarea();
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
  await emitUploadedMedia(file, "FILE");
};

const handlePaste = async (event: ClipboardEvent) => {
  if (props.disabled || uploading.value) {
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

const handleStartRecording = async () => {
  await startRecording();
};

const handleStopRecording = async () => {
  const recorded = await finishRecording();
  if (!recorded) {
    focusTextarea();
    return;
  }
  await emitUploadedMedia(recorded.file, "VOICE", {
    duration: recorded.duration,
  });
};

const handleCancelRecording = () => {
  cancelRecording();
  focusTextarea();
};
</script>

<style scoped lang="scss">
.interactive-reset {
  border: 0;
  background: transparent;
}

.composer-shell {
  padding: 16px 18px 18px;
  border-top: 1px solid rgba(203, 213, 225, 0.78);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(16px);
}

.composer-surface {
  border-radius: 26px;
  border: 1px solid rgba(203, 213, 225, 0.8);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.94));
  box-shadow: 0 22px 42px rgba(15, 23, 42, 0.08);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.composer-surface.is-focused {
  border-color: rgba(96, 165, 250, 0.86);
  box-shadow:
    0 22px 44px rgba(37, 99, 235, 0.12),
    0 0 0 4px rgba(191, 219, 254, 0.56);
}

.composer-surface.is-disabled {
  opacity: 0.72;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--chat-touch-size);
  height: var(--chat-touch-size);
  border-radius: 14px;
  color: var(--chat-text-secondary);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.toolbar-button:hover:not(:disabled),
.toolbar-button.is-active {
  background: rgba(239, 246, 255, 0.96);
  color: var(--chat-accent);
  box-shadow: 0 10px 18px rgba(37, 99, 235, 0.12);
}

.toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.toolbar-emoji {
  font-size: 16px;
  line-height: 1;
}

.toolbar-status {
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  text-align: right;
}

.composer-body {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 0 16px 16px;
}

.chat-textarea {
  width: 100%;
  min-height: 104px;
  max-height: 180px;
  padding: 8px 4px 0;
  border: 0;
  resize: none;
  outline: none;
  background: transparent;
  color: var(--chat-text-primary);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
}

.chat-textarea::placeholder {
  color: var(--chat-text-quaternary);
}

.send-button {
  flex-shrink: 0;
  align-self: stretch;
  min-width: 108px;
  padding: 0 20px;
  border-radius: 20px;
  background: rgba(226, 232, 240, 0.96);
  color: var(--chat-text-quaternary);
  font-size: 14px;
  font-weight: 800;
  cursor: not-allowed;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.send-button.can-send {
  cursor: pointer;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 18px 30px rgba(37, 99, 235, 0.24);
}

.send-button.can-send:hover {
  transform: translateY(-1px);
}

.voice-input-area {
  width: 100%;
  min-height: 112px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 4px;
}

.voice-record-btn {
  width: min(100%, 320px);
  padding: 16px 18px;
  border-radius: 22px;
  background: rgba(239, 246, 255, 0.94);
  color: var(--chat-accent-strong);
  text-align: center;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(191, 219, 254, 0.74);
}

.voice-record-btn.is-recording {
  background: rgba(254, 242, 242, 0.96);
  color: var(--chat-danger);
  box-shadow: inset 0 0 0 1px rgba(252, 165, 165, 0.74);
}

.voice-button-title {
  display: block;
  font-size: 15px;
  font-weight: 800;
}

.voice-button-subtitle {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: inherit;
  opacity: 0.72;
}

.recording-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--chat-danger);
  font-size: 12px;
  font-weight: 700;
}

.recording-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

@media (max-width: 768px) {
  .composer-shell {
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  }

  .composer-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .toolbar-status {
    text-align: left;
  }

  .composer-body {
    gap: 10px;
    align-items: stretch;
  }

  .chat-textarea {
    min-height: 96px;
    font-size: 14px;
  }

  .send-button {
    min-width: 92px;
    border-radius: 18px;
  }
}
</style>
