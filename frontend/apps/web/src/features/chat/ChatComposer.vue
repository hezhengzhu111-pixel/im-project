<template>
  <div class="wechat-composer" ref="shellRef">
    <div class="composer-toolbar">
      <button class="toolbar-btn" title="表情" disabled>
        <el-icon><ChatDotRound /></el-icon>
      </button>
      <button
        class="toolbar-btn"
        title="文件"
        :disabled="disabled || uploading || isRecording"
        @click="selectFile"
      >
        <el-icon><Paperclip /></el-icon>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-recording': isRecording }"
        :title="isRecording ? '停止录音' : '语音'"
        :disabled="disabled || uploading"
        @click="toggleVoiceRecording"
      >
        <el-icon>
          <VideoPause v-if="isRecording" />
          <Microphone v-else />
        </el-icon>
      </button>
    </div>
    <div class="composer-input-row">
      <textarea
        ref="textareaRef"
        v-model="messageInput"
        class="composer-textarea"
        :placeholder="placeholderText"
        :disabled="disabled || uploading || isRecording"
        rows="1"
        @keydown.enter.exact.prevent="handleSend"
        @keydown.enter.shift.exact.prevent="handleShiftEnter"
        @input="onInput"
        @paste="handlePaste"
        @focus="isFocused = true"
      />
      <button
        class="send-btn"
        :class="{ 'send-btn--active': canSend }"
        :disabled="!canSend"
        @click="handleSend"
      >发送</button>
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
import { computed, nextTick, onUnmounted, ref } from "vue";
import {
  ChatDotRound,
  MagicStick,
  Microphone,
  Paperclip,
  Picture,
  VideoPause,
} from "@element-plus/icons-vue";
import { useFileMessageUpload } from "@/features/chat/composables/useFileMessageUpload";
import { useVoiceRecorder } from "@/features/chat/composables/useVoiceRecorder";
import { useI18nStore } from "@/stores/i18n";
import type { MessageType } from "@/types";
import { isCameraAvailable, takePhoto, pickFromGallery, base64ToFile } from "@/services/camera.service";
import { compressImage, blobToFile } from "@/utils/image-compression";
import { ActionSheet } from "@capacitor/action-sheet";

interface MentionMember {
  userId: string;
  name: string;
  avatar?: string;
  avatarText: string;
}

const props = defineProps<{
  disabled?: boolean;
  members?: MentionMember[];
  isOtherTyping?: boolean;
  sessionId?: string;
}>();

const emit = defineEmits<{
  (e: "send-text", value: string, mentionedUserIds: string[]): void;
  (
    e: "send-media",
    payload: {
      type: Extract<MessageType, "IMAGE" | "FILE" | "VIDEO" | "VOICE">;
      url: string;
      extra?: Record<string, unknown>;
    },
  ): void;
  (e: "request-members"): void;
  (e: "typing"): void;
}>();

const shellRef = ref<HTMLElement | null>(null);
const imageInputRef = ref<HTMLInputElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const mentionRef = ref<HTMLElement | null>(null);
const mentionItemRefs = ref<(HTMLElement | null)[]>([]);
const messageInput = ref("");
const isFocused = ref(false);
const { uploading, upload } = useFileMessageUpload();
const { isRecording, startRecording, finishRecording, cancelRecording } =
  useVoiceRecorder();
const { t } = useI18nStore();

const showMention = ref(false);
const mentionIndex = ref(0);
const mentionStart = ref(0);
const mentionFilter = ref("");
const mentionedIds = ref<string[]>([]);
const mentionStyle = ref({ top: "auto", bottom: "56px", left: "8px" });

const members = computed(() => props.members || []);

const filteredMembers = computed(() => {
  if (!mentionFilter.value) return members.value.slice(0, 8);
  const q = mentionFilter.value.toLowerCase();
  return members.value
    .filter((m) => m.name.toLowerCase().includes(q) || m.userId.includes(q))
    .slice(0, 8);
});

const placeholderText = computed(() => {
  if (props.disabled) return t("composer.selectConversation");
  if (isRecording.value) return t("composer.recording");
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
  if (props.disabled) return;
  nextTick(() => textareaRef.value?.focus());
};

const resetMention = () => {
  showMention.value = false;
  mentionIndex.value = 0;
  mentionStart.value = 0;
  mentionFilter.value = "";
};

const closeMention = () => {
  resetMention();
  focusTextarea();
};

const selectMention = (member: MentionMember) => {
  const before = messageInput.value.slice(0, mentionStart.value);
  const atPos = before.lastIndexOf("@");
  const preAt = before.slice(0, atPos);
  const after = messageInput.value.slice(mentionStart.value);
  messageInput.value = preAt + "@" + member.name + " " + after;
  if (!mentionedIds.value.includes(member.userId)) {
    mentionedIds.value.push(member.userId);
  }
  resetMention();
  focusTextarea();
};

const mentionUp = () => {
  if (!showMention.value) return;
  mentionIndex.value = Math.max(0, mentionIndex.value - 1);
  scrollMentionIntoView();
};

const mentionDown = () => {
  if (!showMention.value) return;
  mentionIndex.value = Math.min(
    filteredMembers.value.length - 1,
    mentionIndex.value + 1,
  );
  scrollMentionIntoView();
};

const scrollMentionIntoView = () => {
  nextTick(() => {
    mentionItemRefs.value[mentionIndex.value]?.scrollIntoView({
      block: "nearest",
    });
  });
};

let typingTimeout: ReturnType<typeof setTimeout> | null = null;

function onTextareaInput() {
  if (typingTimeout) clearTimeout(typingTimeout);
  emit("typing");
  typingTimeout = setTimeout(() => {
    typingTimeout = null;
  }, 2000);
}

const onInput = () => {
  onTextareaInput();
  const ta = textareaRef.value;
  if (!ta) return;
  const pos = ta.selectionStart;
  const before = messageInput.value.slice(0, pos);

  const atIdx = before.lastIndexOf("@");
  if (
    atIdx === -1 ||
    (atIdx > 0 && before[atIdx - 1] !== " " && before[atIdx - 1] !== "\n")
  ) {
    resetMention();
    return;
  }

  const afterAt = before.slice(atIdx + 1);
  if (afterAt.includes(" ")) {
    resetMention();
    return;
  }

  if (showMention.value) {
    mentionIndex.value = 0;
  } else {
    mentionedIds.value = [];
    const rect = ta.getBoundingClientRect();
    const shellRect = shellRef.value?.getBoundingClientRect();
    if (shellRect) {
      mentionStyle.value.top = "auto";
      mentionStyle.value.bottom = shellRect.bottom - rect.top + 8 + "px";
      mentionStyle.value.left = rect.left - shellRect.left + 8 + "px";
    }
  }
  showMention.value = true;
  mentionStart.value = pos;
  mentionFilter.value = afterAt;
  if (members.value.length === 0) {
    emit("request-members");
  }
};

const onBlur = () => {
  isFocused.value = false;
  setTimeout(() => {
    if (!shellRef.value?.contains(document.activeElement)) {
      resetMention();
    }
  }, 150);
};

const handleSend = () => {
  const text = messageInput.value.trim();
  if (!text || !canSend.value) return;
  const ids = [...mentionedIds.value];
  mentionedIds.value = [];
  emit("send-text", text, ids);
  messageInput.value = "";
  focusTextarea();
};

const handleShiftEnter = (event: KeyboardEvent) => {
  const textarea = event.target as HTMLTextAreaElement;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  messageInput.value =
    messageInput.value.slice(0, start) + "\n" + messageInput.value.slice(end);
  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = start + 1;
  });
};

async function selectImage() {
  if (isCameraAvailable()) {
    try {
      const result = await ActionSheet.showActions({
        title: "选择图片",
        options: [
          { title: "拍照" },
          { title: "从相册选择" },
        ],
      });
      if (result.index === 0) {
        const photo = await takePhoto();
        const file = base64ToFile(photo.base64, photo.format);
        const compressed = await compressImage(file);
        const finalFile = blobToFile(compressed, file.name);
        await emitUploadedMedia(finalFile, "IMAGE");
      } else if (result.index === 1) {
        const photo = await pickFromGallery();
        const file = base64ToFile(photo.base64, photo.format);
        const compressed = await compressImage(file);
        const finalFile = blobToFile(compressed, file.name);
        await emitUploadedMedia(finalFile, "IMAGE");
      }
    } catch {
      // Fallback to file input
      imageInputRef.value?.click();
    }
  } else {
    imageInputRef.value?.click();
  }
}
const selectFile = () => fileInputRef.value?.click();

const emitUploadedMedia = async (
  file: File,
  kind: Extract<MessageType, "IMAGE" | "FILE" | "VIDEO" | "VOICE">,
  extra?: Record<string, unknown>,
) => {
  try {
    const result = await upload(file, kind, props.sessionId);
    const mediaName =
      result.fileName ||
      result.originalFilename ||
      result.filename ||
      file.name;
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

const handleImageSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file) return;
  await emitUploadedMedia(file, "IMAGE");
};

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
      const d = Math.round(media.duration);
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? d : undefined);
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
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("audio/")) return "VOICE";
  if (file.type.startsWith("video/")) return "VIDEO";
  return "FILE";
};

const handleFileSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file) return;
  const kind = resolveFileMessageKind(file);
  const duration =
    kind === "VOICE" || kind === "VIDEO"
      ? await readMediaDuration(file)
      : undefined;
  await emitUploadedMedia(file, kind, { duration });
};

const handlePaste = async (event: ClipboardEvent) => {
  if (props.disabled || uploading.value || isRecording.value) return;
  const file = Array.from(event.clipboardData?.items || [])
    .find((i) => i.type.startsWith("image/"))
    ?.getAsFile();
  if (!file) return;
  event.preventDefault();
  await emitUploadedMedia(file, "IMAGE");
};

const toggleVoiceRecording = async () => {
  if (props.disabled || uploading.value) return;
  if (!isRecording.value) {
    await startRecording();
    return;
  }
  const recorded = await finishRecording();
  if (recorded)
    await emitUploadedMedia(recorded.file, "VOICE", {
      duration: recorded.duration,
    });
};

onUnmounted(() => {
  if (typingTimeout) clearTimeout(typingTimeout);
  cancelRecording();
});
</script>

<style scoped lang="scss">
.wechat-composer {
  background: var(--chat-composer-bg, var(--chat-panel-bg));
  border-top: 1px solid var(--chat-composer-border, var(--chat-panel-border));
  padding: var(--space-2, 8px) var(--space-4, 16px) var(--space-3, 12px);
}

.composer-toolbar {
  display: flex;
  gap: 4px;
  margin-bottom: var(--space-2, 8px);
}

.toolbar-btn {
  width: var(--chat-composer-toolbar-size, 32px);
  height: var(--chat-composer-toolbar-size, 32px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm, 8px);
  color: var(--text-secondary, var(--chat-text-secondary));
  font-size: 20px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--chat-card-hover, rgba(99, 102, 241, 0.08));
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  &.is-recording {
    background: rgba(239, 68, 68, 0.12);
    color: var(--chat-danger, #ef4444);
    animation: recordingPulse 1.2s ease-in-out infinite;
  }
}

.composer-input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2, 8px);
}

.composer-textarea {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: var(--space-2, 8px);
  font-family: var(--font-sans, inherit);
  font-size: var(--font-size-base, 14px);
  line-height: var(--line-height-base, 1.5);
  color: var(--text-primary, var(--chat-text-primary));
  background: var(--surface-primary, transparent);
  border: 1px solid var(--border-light, var(--chat-panel-border));
  border-radius: var(--radius-sm, 8px);
  resize: none;
  outline: none;
  transition: border-color var(--motion-fast, 0.18s) ease;

  &:focus {
    border-color: var(--color-primary, #6366f1);
  }

  &::placeholder {
    color: var(--text-placeholder, var(--chat-text-quaternary));
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.send-btn {
  width: 68px;
  height: 40px;
  flex-shrink: 0;
  background: var(--surface-tertiary, rgba(255, 255, 255, 0.4));
  color: var(--text-tertiary, rgba(0, 0, 0, 0.4));
  border: none;
  border-radius: var(--radius-sm, 8px);
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
  transition: all var(--motion-fast, 0.18s) ease;

  &--active {
    background: var(--color-primary, #6366f1);
    color: var(--text-inverse, #fff);
  }

  &:hover:not(:disabled) {
    background: var(--color-primary-dark, #4f46e5);
  }

  &:disabled {
    cursor: not-allowed;
  }
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
  .wechat-composer {
    padding: 6px 8px calc(8px + env(safe-area-inset-bottom, 0px));
  }

  .composer-textarea {
    min-height: 36px;
    max-height: 80px;
    font-size: 16px; /* prevent iOS zoom on focus */
  }

  .send-btn {
    width: 56px;
    height: 40px;
  }
}
</style>
