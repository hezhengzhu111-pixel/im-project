<template>
  <div
    ref="containerRef"
    class="mcr"
    style="--chat-max-bubble-width: min(80%, calc(100vw - 72px))"
    :style="{ '--mcr-keyboard-inset': keyboardHeight + 'px' }"
  >
    <MobileChatHeader
      :name="session.targetName"
      :avatar="session.targetAvatar"
      :is-private="session.type === 'private'"
      :online="online"
      :member-count="session.type === 'group' ? session.memberCount : undefined"
      @back="$emit('back')"
      @more="$emit('more')"
    />

    <ChatMessageList
      class="mcr-messages"
      :messages="messages"
      :current-user-id="currentUserId"
      :current-user-name="currentUserName"
      :current-user-avatar="currentUserAvatar"
      :loading-history="loadingHistory"
      :opened-unread-count="openedUnreadCount"
      :session-type="session.type"
      @request-history="$emit('request-history')"
      @mark-read="$emit('mark-read')"
      @show-group-readers="(msg) => $emit('show-group-readers', msg)"
    />

    <ChatComposer
      class="mcr-composer"
      :disabled="false"
      :members="members"
      :is-other-typing="isOtherTyping"
      @send-text="handleSendText"
      @send-media="(payload) => $emit('send-media', payload)"
      @request-members="$emit('request-members')"
      @typing="$emit('typing')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import ChatComposer from "@/features/chat/ChatComposer.vue";
import ChatMessageList from "@/features/chat/ChatMessageList.vue";
import MobileChatHeader from "@/components/mobile/MobileChatHeader.vue";
import { useKeyboardInset } from "@/composables/useKeyboardInset";
import { useMessageScroll } from "@/composables/useMessageScroll";
import type { ChatSession, Message } from "@/types";

defineProps<{
  session: ChatSession;
  messages: Message[];
  currentUserId: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  loadingHistory?: boolean;
  openedUnreadCount?: number;
  online?: boolean;
  isOtherTyping?: boolean;
  members?: {
    userId: string;
    name: string;
    avatar?: string;
    avatarText: string;
  }[];
}>();

const emit = defineEmits<{
  (e: "back"): void;
  (e: "more"): void;
  (e: "send-text", text: string, mentionedUserIds?: string[]): void;
  (
    e: "send-media",
    payload: {
      type: "IMAGE" | "FILE" | "VIDEO" | "VOICE";
      url: string;
      extra?: Record<string, unknown>;
    },
  ): void;
  (e: "request-history"): void;
  (e: "mark-read"): void;
  (e: "show-group-readers", message: Message): void;
  (e: "request-members"): void;
  (e: "typing"): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const { keyboardHeight } = useKeyboardInset();
const { scrollToBottomDelayed } = useMessageScroll(
  containerRef,
  keyboardHeight,
);

const handleSendText = (text: string, mentionedUserIds?: string[]) => {
  emit("send-text", text, mentionedUserIds);
  scrollToBottomDelayed();
};
</script>

<style scoped lang="scss">
.mcr {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: var(--chat-shell-bg);
  height: 100dvh;
  height: 100vh;
  height: 100%;
}

.mcr-messages {
  flex: 1;
  min-height: 0;
}

.mcr-composer {
  flex-shrink: 0;
  margin-bottom: var(--mcr-keyboard-inset, 0px);
}
</style>
