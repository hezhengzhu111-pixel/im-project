<template>
  <div class="input-area">
    <div class="input-toolbar">
      <div class="toolbar-group">
        <el-button
          link
          :icon="Picture"
          title="Send image"
          aria-label="Send image"
          :disabled="disabled"
          @click="selectImage"
        />
        <el-button
          link
          :icon="Paperclip"
          title="Send file"
          aria-label="Send file"
          :disabled="disabled"
          @click="selectFile"
        />
        <el-button
          link
          :icon="voiceModeIcon"
          :title="isVoiceMode ? 'Switch to keyboard' : 'Voice message'"
          :aria-label="isVoiceMode ? 'Switch to keyboard' : 'Voice message'"
          :disabled="disabled"
          @click="toggleVoiceMode"
        />
      </div>
      <div class="toolbar-hint">
        {{ uploading ? "Uploading..." : "Paste screenshots, drag ideas into motion." }}
      </div>
    </div>

    <div class="input-box">
      <textarea
        v-if="!isVoiceMode"
        ref="textareaRef"
        v-model="messageInput"
        class="chat-textarea"
        aria-label="Message input"
        :placeholder="placeholderText"
        :disabled="disabled || uploading"
        @paste="handlePaste"
        @keydown.enter.exact.prevent="handleSend"
        @keydown.enter.shift.exact="handleShiftEnter"
      ></textarea>

      <div v-else class="voice-input-area">
        <el-button
          class="voice-record-btn"
          :class="{ 'is-recording': isRecording }"
          :disabled="disabled || uploading"
          @mousedown="handleStartRecording"
          @mouseup="handleStopRecording"
          @mouseleave="handleCancelRecording"
          @touchstart.prevent="handleStartRecording"
          @touchend.prevent="handleStopRecording"
        >
          {{ isRecording ? "Release to send" : "Hold to talk" }}
        </el-button>
        <div v-if="isRecording" class="recording-indicator">
          <div class="recording-waves">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="recording-text">Recording...</div>
        </div>
      </div>
    </div>

    <div v-if="!isVoiceMode" class="input-actions">
      <span class="tip">Enter to send, Shift + Enter for a new line</span>
      <el-button
        class="send-btn"
        type="primary"
        :disabled="disabled || !messageInput.trim() || uploading"
        @click="handleSend"
      >
        Send
      </el-button>
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
import {ChatLineSquare, Microphone, Paperclip, Picture,} from "@element-plus/icons-vue";
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
const { uploading, upload } = useFileMessageUpload();
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
  if (!text) {
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
.input-area {
  padding: 14px 18px 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.82);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
}

.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-hint {
  color: #64748b;
  font-size: 12px;
  text-align: right;
}

.input-box {
  min-height: 108px;
  padding: 4px;
  border-radius: 20px;
  background: linear-gradient(180deg, #f8fafc, #ffffff);
  border: 1px solid rgba(226, 232, 240, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.chat-textarea {
  width: 100%;
  height: 96px;
  padding: 14px 16px;
  border: 0;
  resize: none;
  outline: none;
  background: transparent;
  color: #0f172a;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
}

.chat-textarea::placeholder {
  color: #94a3b8;
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.tip {
  color: #64748b;
  font-size: 12px;
}

.send-btn {
  min-width: 92px;
  border-radius: 999px;
  box-shadow: 0 16px 28px rgba(37, 99, 235, 0.2);
}

.voice-input-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 96px;
}

.voice-record-btn {
  min-width: 180px;
  border-radius: 999px;
}

.voice-record-btn.is-recording {
  background-color: #ef4444;
  border-color: #ef4444;
  color: #fff;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  color: #ef4444;
  font-size: 12px;
  font-weight: 600;
}

.recording-waves {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 16px;
}

.recording-waves span {
  display: block;
  width: 2px;
  height: 100%;
  background-color: #ef4444;
  animation: wave 1s infinite ease-in-out;
}

.recording-waves span:nth-child(2) {
  animation-delay: 0.1s;
}

.recording-waves span:nth-child(3) {
  animation-delay: 0.2s;
}

.recording-waves span:nth-child(4) {
  animation-delay: 0.3s;
}

.recording-waves span:nth-child(5) {
  animation-delay: 0.4s;
}

@keyframes wave {
  0%,
  100% {
    height: 20%;
  }
  50% {
    height: 100%;
  }
}

@media (max-width: 768px) {
  .input-area {
    padding: 12px;
  }

  .input-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-hint,
  .tip {
    display: none;
  }

  .chat-textarea {
    height: 86px;
  }
}
</style>
