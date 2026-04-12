<template>
  <div class="input-area">
    <div class="input-toolbar">
      <el-button
        link
        :icon="Picture"
        title="发送图片"
        aria-label="发送图片"
        :disabled="disabled"
        @click="selectImage"
      />
      <el-button
        link
        :icon="Paperclip"
        title="发送文件"
        aria-label="发送文件"
        :disabled="disabled"
        @click="selectFile"
      />
      <el-button
        link
        :icon="voiceModeIcon"
        :title="isVoiceMode ? '切换键盘' : '语音消息'"
        :aria-label="isVoiceMode ? '切换键盘' : '语音消息'"
        :disabled="disabled"
        @click="toggleVoiceMode"
      />
    </div>

    <div class="input-box">
      <textarea
        v-if="!isVoiceMode"
        v-model="messageInput"
        class="chat-textarea"
        aria-label="消息输入框"
        :disabled="disabled || uploading"
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
          {{ isRecording ? "松开 发送" : "按住 说话" }}
        </el-button>
        <div v-if="isRecording" class="recording-indicator">
          <div class="recording-waves">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="recording-text">正在录音...</div>
        </div>
      </div>
    </div>

    <div class="input-actions" v-if="!isVoiceMode">
      <span class="tip">Enter 发送，Shift + Enter 换行</span>
      <el-button
        class="send-btn"
        :disabled="disabled || !messageInput.trim() || uploading"
        @click="handleSend"
      >
        发送
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
import { computed, nextTick, ref } from "vue";
import {
  ChatLineSquare,
  Microphone,
  Paperclip,
  Picture,
} from "@element-plus/icons-vue";
import { useFileMessageUpload } from "@/features/chat/composables/useFileMessageUpload";
import { useVoiceRecorder } from "@/features/chat/composables/useVoiceRecorder";
import type { MessageType } from "@/types";

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

const handleSend = () => {
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }
  emit("send-text", text);
  messageInput.value = "";
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
  const result = await upload(file, "IMAGE");
  emit("send-media", {
    type: "IMAGE",
    url: result.url,
  });
};

const handleFileSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file) {
    return;
  }
  const result = await upload(file, "FILE");
  emit("send-media", {
    type: "FILE",
    url: result.url,
    extra: {
      mediaName: result.fileName,
      mediaSize: result.size,
    },
  });
};

const handleStartRecording = async () => {
  await startRecording();
};

const handleStopRecording = async () => {
  const recorded = await finishRecording();
  if (!recorded) {
    return;
  }
  const result = await upload(recorded.file, "VOICE");
  emit("send-media", {
    type: "VOICE",
    url: result.url,
    extra: { duration: recorded.duration },
  });
};

const handleCancelRecording = () => {
  cancelRecording();
};
</script>

<style scoped lang="scss">
.input-area {
  border-top: 1px solid #dcdfe6;
  padding: 10px 20px;
  background-color: #fff;
}

.input-toolbar {
  margin-bottom: 10px;
  display: flex;
  gap: 10px;
}

.input-box {
  min-height: 80px;
  margin-bottom: 10px;
}

.chat-textarea {
  width: 100%;
  height: 80px;
  border: none;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 14px;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tip {
  font-size: 12px;
  color: #909399;
}

.voice-input-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80px;
}

.voice-record-btn.is-recording {
  background-color: #f56c6c;
  color: #fff;
  border-color: #f56c6c;
}

.recording-indicator {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #f56c6c;
  font-size: 12px;
}

.recording-waves {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 15px;
}

.recording-waves span {
  display: block;
  width: 2px;
  height: 100%;
  background-color: #f56c6c;
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
  .tip {
    display: none;
  }
}
</style>
