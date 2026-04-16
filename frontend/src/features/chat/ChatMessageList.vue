<template>
  <div
    ref="scrollContainerRef"
    class="message-list chat-soft-scrollbar"
    role="log"
    aria-live="polite"
    @scroll.passive="handleScroll"
  >
    <div v-if="loadingHistory" class="history-indicator">
      Loading more messages...
    </div>

    <div v-if="messages.length === 0" class="message-empty-state">
      <div class="message-empty-card">
        <div class="message-empty-icon">+</div>
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
      :items="renderItems"
      :min-item-size="56"
      key-field="id"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :data-index="index"
        >
          <div v-if="item.kind === 'separator'" class="message-separator">
            <span class="separator-pill">{{ item.label }}</span>
          </div>

          <div
            v-else-if="item.kind === 'unread'"
            class="message-separator message-separator-unread"
          >
            <span class="separator-line"></span>
            <span class="separator-pill unread-pill">{{ item.label }}</span>
            <span class="separator-line"></span>
          </div>

          <MessageItem
            v-else
            :message="item.message"
            :current-user-id="currentUserId"
            :current-user-name="currentUserName"
            :current-user-avatar="currentUserAvatar"
            :audio-playing="playingMessageId === item.message.id"
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
import MessageItem from "@/features/chat/ChatMessageItem.vue";
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
  openedUnreadCount?: number;
}

type SeparatorItem = {
  id: string;
  kind: "separator";
  label: string;
};

type UnreadItem = {
  id: string;
  kind: "unread";
  label: string;
};

type MessageRenderItem = {
  id: string;
  kind: "message";
  message: Message;
};

type RenderItem = SeparatorItem | UnreadItem | MessageRenderItem;

const props = withDefaults(defineProps<Props>(), {
  loadingHistory: false,
  openedUnreadCount: 0,
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
const {playingMessageId, toggle: toggleAudio, stop} = useAudioPlayer();
const {copy, recall, remove} = useMessageActions();
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

const unreadBoundaryIndex = computed(() => {
  const unreadCount = Math.max(0, props.openedUnreadCount || 0);
  if (!unreadCount || unreadCount > props.messages.length) {
    return -1;
  }
  return props.messages.length - unreadCount;
});

const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = [];
  let previousDateKey = "";

  props.messages.forEach((message, index) => {
    const currentDate = new Date(message.sendTime);
    const currentDateKey = Number.isNaN(currentDate.getTime())
      ? ""
      : currentDate.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          weekday: "short",
        });

    if (currentDateKey && currentDateKey !== previousDateKey) {
      items.push({
        id: `separator-${currentDateKey}-${messageKey(message)}`,
        kind: "separator",
        label: currentDateKey,
      });
      previousDateKey = currentDateKey;
    }

    if (unreadBoundaryIndex.value === index) {
      items.push({
        id: `unread-${messageKey(message)}`,
        kind: "unread",
        label: "Unread messages",
      });
    }

    items.push({
      id: `message-${messageKey(message)}`,
      kind: "message",
      message,
    });
  });

  return items;
});

const lastMessageRenderIndex = computed(() => {
  for (let index = renderItems.value.length - 1; index >= 0; index -= 1) {
    if (renderItems.value[index]?.kind === "message") {
      return index;
    }
  }
  return renderItems.value.length - 1;
});

const showScrollToLatest = computed(() => !nearBottom.value && props.messages.length > 0);

const messageListSignal = computed(() => ({
  length: props.messages.length,
  first: firstMessageKey.value,
  tail: tailMessageKey.value,
  unread: unreadBoundaryIndex.value,
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
  if (scroller?.scrollToItem && renderItems.value.length > 0) {
    scroller.scrollToItem(Math.max(lastMessageRenderIndex.value, 0));
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
  {flush: "post"},
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
  padding: 20px 22px 24px;
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 24%),
    linear-gradient(180deg, #f6faff 0%, #eef4fb 100%);
}

.history-indicator {
  position: sticky;
  top: 0;
  z-index: 2;
  width: fit-content;
  margin: 0 auto 14px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(191, 219, 254, 0.82);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  color: var(--chat-text-secondary);
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(12px);
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
  padding: 28px 30px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(191, 219, 254, 0.6);
  box-shadow: 0 28px 56px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.message-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(125, 211, 252, 0.2));
  color: var(--chat-accent);
  font-size: 28px;
  font-weight: 700;
}

.message-empty-title {
  margin-top: 16px;
  color: var(--chat-text-primary);
  font-size: 20px;
  font-weight: 800;
}

.message-empty-text {
  margin-top: 8px;
  color: var(--chat-text-tertiary);
  font-size: 14px;
  line-height: 1.7;
}

.message-scroller {
  min-height: 100%;
}

.message-separator {
  display: flex;
  justify-content: center;
  padding: 10px 0 18px;
}

.message-separator-unread {
  align-items: center;
  gap: 12px;
  padding-top: 6px;
}

.separator-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.42), transparent);
}

.separator-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(203, 213, 225, 0.74);
  color: var(--chat-text-tertiary);
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 10px 22px rgba(148, 163, 184, 0.12);
}

.unread-pill {
  border-color: rgba(96, 165, 250, 0.42);
  color: var(--chat-accent-strong);
  background: rgba(239, 246, 255, 0.96);
}

.scroll-to-latest {
  position: sticky;
  left: calc(100% - 156px);
  bottom: 18px;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 122px;
  padding: 11px 16px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 18px 38px rgba(37, 99, 235, 0.24);
  cursor: pointer;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 132px;
  padding: 6px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(203, 213, 225, 0.86);
  box-shadow: 0 20px 42px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(12px);
}

.menu-item {
  padding: 10px 12px;
  border-radius: 12px;
  color: var(--chat-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;

  &:hover {
    background: rgba(239, 246, 255, 0.96);
    color: var(--chat-accent);
  }
}

.menu-item.danger:hover {
  background: rgba(254, 242, 242, 0.94);
  color: var(--chat-danger);
}

@media (max-width: 768px) {
  .message-list {
    padding: 16px 12px 18px;
  }

  .message-empty-card {
    padding: 24px 22px;
  }

  .message-empty-title {
    font-size: 18px;
  }

  .message-empty-text {
    font-size: 14px;
  }

  .scroll-to-latest {
    left: auto;
    right: 0;
    bottom: 12px;
  }
}
</style>
