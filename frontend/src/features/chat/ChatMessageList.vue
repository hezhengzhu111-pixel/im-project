<template>
  <div
    ref="scrollContainerRef"
    class="message-list"
    role="log"
    aria-live="polite"
    @scroll.passive="handleScroll"
  >
    <div v-if="loadingHistory" class="history-indicator">
      Loading more messages...
    </div>

    <div v-if="messages.length === 0" class="message-empty-state">
      <div class="message-empty-card">
        <div class="message-empty-title">No messages yet</div>
        <div class="message-empty-text">
          Start the conversation and new messages will appear here in real time.
        </div>
      </div>
    </div>

    <DynamicScroller
      v-else
      ref="scrollerRef"
      class="message-scroller"
      :items="messages"
      :min-item-size="88"
      key-field="id"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :data-index="index"
        >
          <MessageItem
            :message="item"
            :current-user-id="currentUserId"
            :current-user-name="currentUserName"
            :current-user-avatar="currentUserAvatar"
            :audio-playing="playingMessageId === item.id"
            :image-scroll-container="scrollContainerRef"
            @show-group-readers="emit('show-group-readers', $event)"
            @open-context-menu="openContextMenu"
            @toggle-audio="toggleAudio"
            @download-file="downloadFile"
            @preview-image="previewImage"
            @play-video="playVideo"
            @media-loaded="handleMediaLoaded"
          />
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>

    <button
      v-if="showScrollToLatest"
      type="button"
      class="scroll-to-latest"
      @click="handleScrollToLatest"
    >
      Jump to latest
    </button>

    <div
      v-if="contextMenu.visible && contextTargetMessage"
      class="context-menu"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      @click.self="contextMenu.close()"
    >
      <div
        v-if="contextTargetMessage.messageType === 'TEXT'"
        class="menu-item"
        @click="handleCopy"
      >
        Copy
      </div>
      <div v-if="canRecall" class="menu-item" @click="handleRecall">
        Recall
      </div>
      <div v-if="canDelete" class="menu-item danger" @click="handleDelete">
        Delete
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from "vue";
import {DynamicScroller, DynamicScrollerItem} from "vue-virtual-scroller";
import MessageItem from "@/components/MessageItem.vue";
import {useAudioPlayer} from "@/features/chat/composables/useAudioPlayer";
import {useMessageActions} from "@/features/chat/composables/useMessageActions";
import {useMessageContextMenu} from "@/features/chat/composables/useMessageContextMenu";
import type {Message} from "@/types";

interface Props {
  messages: Message[];
  currentUserId: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  loadingHistory?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loadingHistory: false,
});

const emit = defineEmits<{
  (e: "request-history"): void;
  (e: "mark-read"): void;
  (e: "show-group-readers", message: Message): void;
}>();

type DynamicScrollerRef = {
  scrollToItem?: (index: number) => void;
  forceUpdate?: () => void;
  $forceUpdate?: () => void;
  updateVisibleItems?: (checkItem?: boolean) => void;
};

type HistoryAnchor = {
  previousHeight: number;
  previousTop: number;
  firstMessageKey: string;
  length: number;
};

const BOTTOM_FOLLOW_THRESHOLD = 180;
const READ_ACK_BOTTOM_THRESHOLD = 120;
const HISTORY_TRIGGER_TOP = 80;
const HISTORY_FALLBACK_MS = 2000;

const scrollerRef = ref<DynamicScrollerRef | null>(null);
const scrollContainerRef = ref<HTMLElement | null>(null);
const loadingHistoryLocal = ref(false);
const nearBottom = ref(true);
const pendingHistoryAnchor = ref<HistoryAnchor | null>(null);
const historyFallbackTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const refreshScheduled = ref(false);
const { playingMessageId, toggle: toggleAudio, stop } = useAudioPlayer();
const { copy, recall, remove } = useMessageActions();
const contextMenu = useMessageContextMenu();
const contextTargetMessage = computed(() => contextMenu.targetMessage.value);

const isOwnMessage = (message: Message | null | undefined) =>
  Boolean(message && String(message.senderId) === props.currentUserId);

const canRecall = computed(() => {
  const message = contextTargetMessage.value;
  if (!message || !isOwnMessage(message)) {
    return false;
  }
  if (message.status === "RECALLED" || message.status === "DELETED") {
    return false;
  }
  const sentAt = new Date(message.sendTime).getTime();
  return Number.isFinite(sentAt) && Date.now() - sentAt <= 2 * 60 * 1000;
});

const canDelete = computed(() => {
  const message = contextTargetMessage.value;
  if (!message || !isOwnMessage(message)) {
    return false;
  }
  return message.status !== "DELETED";
});

const showScrollToLatest = computed(() => !nearBottom.value && props.messages.length > 0);

const messageKey = (message?: Message): string => {
  if (!message) {
    return "";
  }
  return String(message.id || message.messageId || message.clientMessageId || "");
};

const firstMessageKey = computed(() => messageKey(props.messages[0]));

const tailMessageKey = computed(() => {
  const message = props.messages[props.messages.length - 1];
  if (!message) {
    return "";
  }
  return [
    messageKey(message),
    message.clientMessageId || "",
    message.status || "",
    message.readStatus ?? "",
    message.readByCount ?? "",
  ].join(":");
});

const messageListSignal = computed(() => ({
  length: props.messages.length,
  first: firstMessageKey.value,
  tail: tailMessageKey.value,
}));

const isNearBottom = (threshold = BOTTOM_FOLLOW_THRESHOLD) => {
  const container = scrollContainerRef.value;
  if (!container) {
    return true;
  }
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
};

const updateNearBottom = () => {
  nearBottom.value = isNearBottom();
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });

const closeContextMenu = () => contextMenu.close();

const openContextMenu = (message: Message, event: MouseEvent) => {
  contextMenu.open(message, event);
};

const handleCopy = async () => {
  if (contextTargetMessage.value) {
    await copy(contextTargetMessage.value);
  }
  closeContextMenu();
};

const handleRecall = async () => {
  if (contextTargetMessage.value && canRecall.value) {
    await recall(contextTargetMessage.value);
  }
  closeContextMenu();
};

const handleDelete = async () => {
  if (contextTargetMessage.value && canDelete.value) {
    await remove(contextTargetMessage.value);
  }
  closeContextMenu();
};

const previewImage = (message: Message) => {
  window.open(message.mediaUrl || message.content, "_blank", "noopener,noreferrer");
};

const downloadFile = (message: Message) => {
  window.open(message.mediaUrl || message.content, "_blank", "noopener,noreferrer");
};

const playVideo = (_message: Message) => {
  closeContextMenu();
};

const scrollToBottom = async () => {
  await nextTick();
  const scroller = scrollerRef.value;
  if (scroller?.scrollToItem && props.messages.length > 0) {
    scroller.scrollToItem(props.messages.length - 1);
  }
  await nextFrame();
  const container = scrollContainerRef.value;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
  nearBottom.value = true;
};

const handleScrollToLatest = async () => {
  await scrollToBottom();
  emit("mark-read");
};

const clearHistoryFallbackTimer = () => {
  if (historyFallbackTimer.value) {
    clearTimeout(historyFallbackTimer.value);
    historyFallbackTimer.value = null;
  }
};

const releaseHistoryLoading = () => {
  loadingHistoryLocal.value = false;
  pendingHistoryAnchor.value = null;
  clearHistoryFallbackTimer();
};

const scheduleHistoryFallback = () => {
  clearHistoryFallbackTimer();
  historyFallbackTimer.value = setTimeout(() => {
    releaseHistoryLoading();
  }, HISTORY_FALLBACK_MS);
};

const restoreHistoryAnchor = async (anchor: HistoryAnchor) => {
  await nextTick();
  await nextFrame();
  const container = scrollContainerRef.value;
  if (container) {
    const heightDelta = container.scrollHeight - anchor.previousHeight;
    container.scrollTop = anchor.previousTop + heightDelta;
  }
  releaseHistoryLoading();
};

const refreshScroller = async (stickToBottom: boolean) => {
  if (refreshScheduled.value) {
    return;
  }
  refreshScheduled.value = true;
  await nextTick();
  await nextFrame();
  const scroller = scrollerRef.value;
  scroller?.forceUpdate?.();
  scroller?.$forceUpdate?.();
  scroller?.updateVisibleItems?.(true);
  refreshScheduled.value = false;
  if (stickToBottom) {
    await scrollToBottom();
  }
};

const handleMediaLoaded = () => {
  const shouldStickToBottom = nearBottom.value || isNearBottom();
  void refreshScroller(shouldStickToBottom);
};

const handleScroll = async () => {
  const container = scrollContainerRef.value;
  if (!container) {
    return;
  }
  updateNearBottom();
  if (!loadingHistoryLocal.value && container.scrollTop < HISTORY_TRIGGER_TOP) {
    loadingHistoryLocal.value = true;
    pendingHistoryAnchor.value = {
      previousHeight: container.scrollHeight,
      previousTop: container.scrollTop,
      firstMessageKey: firstMessageKey.value,
      length: props.messages.length,
    };
    emit("request-history");
    scheduleHistoryFallback();
  }
  if (!document.hidden && isNearBottom(READ_ACK_BOTTOM_THRESHOLD)) {
    emit("mark-read");
  }
};

watch(
  () => props.loadingHistory,
  (value) => {
    if (!value && loadingHistoryLocal.value && pendingHistoryAnchor.value == null) {
      releaseHistoryLoading();
    }
  },
);

watch(
  messageListSignal,
  async (current, previous) => {
    if (!previous || previous.length === 0) {
      await scrollToBottom();
      return;
    }

    const anchor = pendingHistoryAnchor.value;
    if (
      anchor &&
      (current.length > anchor.length || current.first !== anchor.firstMessageKey)
    ) {
      await restoreHistoryAnchor(anchor);
      return;
    }

    if (loadingHistoryLocal.value && current.length === previous.length) {
      releaseHistoryLoading();
    }

    const lastMessage = props.messages[props.messages.length - 1];
    if (!lastMessage) {
      return;
    }
    const container = scrollContainerRef.value;
    if (!container) {
      await scrollToBottom();
      return;
    }
    const isSelfMessage = String(lastMessage.senderId) === props.currentUserId;
    if (isSelfMessage || nearBottom.value) {
      await scrollToBottom();
      return;
    }
    updateNearBottom();
  },
  { flush: "post" },
);

onMounted(() => {
  window.addEventListener("click", closeContextMenu);
  window.addEventListener("contextmenu", closeContextMenu);
});

onUnmounted(() => {
  stop();
  clearHistoryFallbackTimer();
  window.removeEventListener("click", closeContextMenu);
  window.removeEventListener("contextmenu", closeContextMenu);
});
</script>

<style scoped lang="scss">
.message-list {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 24px;
  background:
    radial-gradient(circle at top left, rgba(64, 158, 255, 0.08), transparent 28%),
    linear-gradient(180deg, #f8fbff 0%, #f3f7fb 100%);
}

.history-indicator {
  position: sticky;
  top: 0;
  z-index: 2;
  width: fit-content;
  margin: 0 auto 12px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(64, 158, 255, 0.16);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  color: #4b5563;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(10px);
}

.message-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 32px 16px;
}

.message-empty-card {
  max-width: 360px;
  padding: 24px 28px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.message-empty-title {
  color: #111827;
  font-size: 18px;
  font-weight: 700;
}

.message-empty-text {
  margin-top: 8px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.message-scroller {
  min-height: 100%;
}

.scroll-to-latest {
  position: sticky;
  left: calc(100% - 148px);
  bottom: 18px;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  padding: 10px 14px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.28);
  cursor: pointer;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 132px;
  padding: 6px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(12px);
}

.menu-item {
  padding: 10px 12px;
  border-radius: 10px;
  color: #475569;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;

  &:hover {
    background: #eff6ff;
    color: #2563eb;
  }
}

.menu-item.danger:hover {
  background: #fef2f2;
  color: #dc2626;
}

@media (max-width: 768px) {
  .message-list {
    padding: 14px 12px 18px;
  }

  .scroll-to-latest {
    left: auto;
    right: 0;
    bottom: 12px;
  }
}
</style>
