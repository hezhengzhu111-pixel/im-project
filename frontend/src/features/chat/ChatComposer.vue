<template>
  <div class="composer-shell" ref="shellRef">
    <div
      class="composer-surface"
      :class="{ 'is-disabled': disabled, 'is-focused': isFocused }"
    >
      <div class="composer-row">
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-button interactive-reset"
            title="表情"
            aria-label="表情"
            disabled
          >
            <el-icon><ChatDotRound /></el-icon>
          </button>
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
            :title="
              isRecording ? t('composer.stopVoice') : t('composer.recordVoice')
            "
            :aria-label="
              isRecording ? t('composer.stopVoice') : t('composer.recordVoice')
            "
            :disabled="disabled || uploading"
            @click="toggleVoiceRecording"
          >
            <el-icon>
              <VideoPause v-if="isRecording" />
              <Microphone v-else />
            </el-icon>
          </button>
          <button
            type="button"
            class="toolbar-button interactive-reset"
            title="AI 助手"
            aria-label="AI 助手"
            disabled
          >
            <el-icon><MagicStick /></el-icon>
          </button>
        </div>

        <div class="textarea-wrapper">
          <textarea
            ref="textareaRef"
            v-model="messageInput"
            class="chat-textarea"
            aria-label="Message input"
            :placeholder="placeholderText"
            :disabled="disabled || uploading || isRecording"
            @focus="isFocused = true"
            @blur="onBlur"
            @paste="handlePaste"
            @input="onInput"
            @keydown.enter.exact.prevent="handleSend"
            @keydown.enter.shift.exact="handleShiftEnter"
            @keydown.escape.prevent="closeMention"
            @keydown.arrow-up.prevent="mentionUp"
            @keydown.arrow-down.prevent="mentionDown"
          ></textarea>

          <div
            v-if="showMention"
            ref="mentionRef"
            class="mention-popup"
            :style="mentionStyle"
          >
            <div
              v-for="(member, idx) in filteredMembers"
              :key="member.userId"
              :ref="
                (el: unknown) =>
                  (mentionItemRefs[idx] = el as HTMLElement | null)
              "
              class="mention-item"
              :class="{ active: mentionIndex === idx }"
              @mousedown.prevent="selectMention(member)"
            >
              <el-avatar :size="24" :src="member.avatar">{{
                member.avatarText
              }}</el-avatar>
              <span class="mention-name">{{ member.name }}</span>
            </div>
            <div v-if="filteredMembers.length === 0" class="mention-empty">
              {{ t("mention.noMembers") }}
            </div>
          </div>
        </div>

        <button
          type="button"
          class="send-button interactive-reset"
          :class="{ 'can-send': canSend }"
          :disabled="!canSend"
          @click="handleSend"
        >
          <span>{{
            uploading ? t("composer.sending") : t("composer.send")
          }}</span>
        </button>
      </div>
    </div>

    <div v-if="isOtherTyping" class="typing-indicator">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
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
    const result = await upload(file, kind);
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
.interactive-reset {
  border: 0;
  background: transparent;
}

.composer-shell {
  padding: 10px 18px 14px;
  border-top: 1px solid var(--chat-panel-border);
  background: var(--chat-panel-bg);
  backdrop-filter: var(--chat-glass-blur);
  position: relative;
}

.composer-surface {
  border-radius: var(--radius-lg, 16px);
  border: 1px solid var(--chat-panel-border);
  background: var(--surface-overlay, rgba(255, 255, 255, 0.72));
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: var(--shadow-soft, 0 14px 34px rgba(15, 23, 42, 0.06));
  transition:
    border-color var(--motion-fast, 0.18s) ease,
    box-shadow var(--motion-fast, 0.18s) ease;
}

.composer-surface.is-focused {
  border-color: var(--color-primary, #6366f1);
  box-shadow: var(--shadow-glow, 0 0 0 3px rgba(99, 102, 241, 0.14));
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
  gap: 2px;
  padding-bottom: 3px;
}

.toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm, 8px);
  color: var(--chat-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--motion-fast, 0.18s) ease,
    color var(--motion-fast, 0.18s) ease,
    transform var(--motion-fast, 0.18s) ease;
}

.toolbar-button:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.08);
  color: var(--color-primary, #6366f1);
  transform: translateY(-1px);
}

.toolbar-button.is-recording {
  background: rgba(239, 68, 68, 0.12);
  color: var(--chat-danger, #ef4444);
  animation: recordingPulse 1.2s ease-in-out infinite;
}

.toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.textarea-wrapper {
  position: relative;
  width: 100%;
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
  font-family: var(--font-sans, inherit);
  font-size: 14px;
  line-height: 1.5;
}

.chat-textarea::placeholder {
  color: var(--chat-text-quaternary);
}

.mention-popup {
  position: absolute;
  min-width: 180px;
  max-width: 260px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--chat-panel-strong);
  border: 1px solid var(--chat-panel-border);
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-panel, 0 8px 24px rgba(15, 23, 42, 0.12));
  backdrop-filter: blur(18px);
  z-index: 20;
  padding: 4px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm, 8px);
  cursor: pointer;
  transition: background-color 0.12s;
}

.mention-item:hover,
.mention-item.active {
  background: var(--chat-card-active);
}

.mention-name {
  font-size: 13px;
  color: var(--chat-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mention-empty {
  padding: 12px;
  text-align: center;
  font-size: 13px;
  color: var(--chat-text-quaternary);
}

.send-button {
  flex-shrink: 0;
  width: 74px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    var(--color-primary, #6366f1),
    var(--color-primary-2, #818cf8)
  );
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  font-weight: 700;
  cursor: not-allowed;
  opacity: 0.5;
  transition:
    background-color var(--motion-fast, 0.18s) ease,
    color var(--motion-fast, 0.18s) ease,
    transform var(--motion-fast, 0.18s) ease,
    box-shadow var(--motion-fast, 0.18s) ease,
    opacity var(--motion-fast, 0.18s) ease;
}

.send-button.can-send {
  cursor: pointer;
  opacity: 1;
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}

.send-button.can-send:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
}

.send-button.can-send:active {
  transform: translateY(0);
}

// Typing indicator
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 18px 0;
  font-size: 12px;
  color: var(--chat-text-tertiary);
}

.typing-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--chat-text-tertiary);
  animation: typingBounce 1.4s ease-in-out infinite;

  &:nth-child(2) {
    animation-delay: 0.2s;
  }
  &:nth-child(3) {
    animation-delay: 0.4s;
  }
}

.typing-text {
  margin-left: 2px;
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

@keyframes typingBounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-3px);
  }
}

@media (max-width: 768px) {
  .composer-shell {
    padding: 6px 8px calc(8px + env(safe-area-inset-bottom, 0px));
  }

  .composer-surface {
    border-radius: var(--radius-md, 12px);
  }

  .composer-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 4px;
    padding: 6px;
    min-height: 48px;
  }

  .toolbar-group {
    gap: 0;
    padding-bottom: 0;
  }

  .toolbar-button {
    width: 40px;
    height: 40px;
    min-width: 40px;
  }

  .chat-textarea {
    min-height: 36px;
    max-height: 80px;
    padding: 7px 4px;
    font-size: 16px; /* prevent iOS zoom on focus */
  }

  .send-button {
    width: 56px;
    height: 40px;
    min-width: 56px;
    border-radius: 8px;
    font-size: 14px;
  }
}
</style>
