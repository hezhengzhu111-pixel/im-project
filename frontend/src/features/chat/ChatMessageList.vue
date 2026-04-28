<template>
  <div
    ref="scrollContainerRef"
    class="message-list chat-soft-scrollbar"
    role="log"
    aria-live="polite"
    @scroll.passive="handleScroll"
  >
    <div v-if="loadingHistory" class="history-indicator">
      {{ t("message.loadingMore") }}
    </div>

    <div v-if="messages.length === 0" class="message-empty-state">
      <div class="message-empty-card">
        <div class="message-empty-title">{{ t("message.noMessages") }}</div>
      </div>
    </div>

    <div
      v-else
      ref="scrollerRef"
      class="message-scroller"
      :class="{ 'is-short-list': messageTopOffset > 0 }"
      :style="messageScrollerStyle"
    >
      <div class="message-scroller-inner">
        <div
          v-for="(item, index) in renderItems"
          :key="item.id"
          class="message-row"
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
            v-bind="item.view"
            :audio-playing="playingMessageId === item.messageId"
            :image-scroll-container="scrollContainerRef"
            @show-group-readers="handleShowGroupReaders"
            @open-context-menu="openContextMenu"
            @toggle-audio="toggleAudioById"
            @download-file="downloadFile"
            @preview-image="previewImage"
            @play-video="playVideo"
            @media-loaded="handleMediaLoaded"
          />
        </div>
      </div>
    </div>

    <button
      v-if="showScrollToLatest"
      type="button"
      class="scroll-to-latest"
      @click="handleScrollToLatest"
    >
      {{ t("message.jumpLatest") }}
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
        {{ t("message.copy") }}
      </div>
      <div v-if="canRecall" class="menu-item" @click="handleRecall">
        {{ t("message.recall") }}
      </div>
      <div v-if="canDelete" class="menu-item danger" @click="handleDelete">
        {{ t("message.delete") }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from "vue";
import MessageItem from "@/features/chat/ChatMessageItem.vue";
import {useAudioPlayer} from "@/features/chat/composables/useAudioPlayer";
import {useMessageActions} from "@/features/chat/composables/useMessageActions";
import {useMessageContextMenu} from "@/features/chat/composables/useMessageContextMenu";
import {useI18nStore} from "@/stores/i18n";
import {formatFileSize} from "@/utils/common";
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

type MessageListItemView = {
  messageId: string;
  renderDigest: string;
  isMine: boolean;
  isSystemMessage: boolean;
  isRecalled: boolean;
  isDeleted: boolean;
  messageType: Message["messageType"];
  content: string;
  senderName?: string;
  senderAvatar?: string;
  showSenderLabel: boolean;
  currentUserName?: string;
  currentUserAvatar?: string;
  timeLabel: string;
  statusLabel: string;
  statusTone: "default" | "loading" | "failed" | "read";
  groupReadLabel: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSizeLabel?: string;
  durationLabel?: string;
};

type MessageRenderItem = {
  id: string;
  kind: "message";
  messageId: string;
  view: MessageListItemView;
};

type RenderItem = SeparatorItem | UnreadItem | MessageRenderItem;

const props = withDefaults(defineProps<Props>(), {
  loadingHistory: false,
  openedUnreadCount: 0,
  currentUserName: "",
  currentUserAvatar: "",
});

const emit = defineEmits<{
  (e: "request-history"): void;
  (e: "mark-read"): void;
  (e: "show-group-readers", message: Message): void;
}>();

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
const scrollerRef = ref<HTMLElement | null>(null);
const scrollContainerRef = ref<HTMLElement | null>(null);
const loadingHistoryLocal = ref(false);
const nearBottom = ref(true);
const messageTopOffset = ref(0);
const scrollVersion = ref(0);
const pendingHistoryAnchor = ref<HistoryAnchor | null>(null);
const historyFallbackTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const refreshScheduled = ref(false);
const messageViewCache = new Map<string, MessageListItemView>();
const messageRenderItemCache = new Map<string, MessageRenderItem>();
const {locale, t} = useI18nStore();
const {playingMessageId, toggle: toggleAudio, stop} = useAudioPlayer();
const {copy, recall, remove} = useMessageActions();
const contextMenu = useMessageContextMenu();
const contextTargetMessage = computed(() => contextMenu.targetMessage.value);
const timeFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      hour: "2-digit",
      minute: "2-digit",
    }),
);
const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      month: "short",
      day: "numeric",
      weekday: "short",
    }),
);

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

const messageById = computed(() => {
  const next = new Map<string, Message>();
  props.messages.forEach((message) => {
    const key = messageKey(message);
    if (key) {
      next.set(key, message);
    }
  });
  return next;
});

const unreadBoundaryIndex = computed(() => {
  const unreadCount = Math.max(0, props.openedUnreadCount || 0);
  if (!unreadCount || unreadCount > props.messages.length) {
    return -1;
  }
  return props.messages.length - unreadCount;
});

const formatDuration = (duration?: number) => {
  if (!duration) {
    return "0:00";
  }
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const resolveFileName = (message: Message) => {
  if (message.mediaName) {
    return message.mediaName;
  }
  try {
    const url = new URL(message.mediaUrl || message.content, window.location.origin);
    return url.pathname.split("/").pop() || t("message.unknownFile");
  } catch {
    return t("message.unknownFile");
  }
};

const resolveStatusView = (message: Message, isMine: boolean) => {
  if (!isMine) {
    return {
      statusLabel: "",
      statusTone: "default" as const,
      groupReadLabel: "",
    };
  }

  if (message.status === "SENDING") {
    return {
      statusLabel: t("message.sending"),
      statusTone: "loading" as const,
      groupReadLabel: "",
    };
  }

  if (message.status === "FAILED") {
    return {
      statusLabel: t("message.failed"),
      statusTone: "failed" as const,
      groupReadLabel: "",
    };
  }

  const groupReadCount =
    typeof message.readByCount === "number" && message.readByCount > 0
      ? message.readByCount
      : message.readBy?.length || 0;
  if ((message.groupId || message.isGroupChat) && groupReadCount > 0) {
    return {
      statusLabel: "",
      statusTone: "default" as const,
      groupReadLabel: t("message.readBy", {count: groupReadCount}),
    };
  }

  if (message.status === "READ" || message.readStatus === 1) {
    return {
      statusLabel: t("message.read"),
      statusTone: "read" as const,
      groupReadLabel: "",
    };
  }

  if (message.status === "SENT" || message.status === "DELIVERED") {
    return {
      statusLabel: t("message.delivered"),
      statusTone: "default" as const,
      groupReadLabel: "",
    };
  }

  return {
    statusLabel: "",
    statusTone: "default" as const,
    groupReadLabel: "",
  };
};

const buildRenderDigest = (message: Message) => {
  const readCount =
    typeof message.readByCount === "number" ? message.readByCount : message.readBy?.length || 0;
  return [
    messageKey(message),
    message.senderId,
    message.senderName || "",
    message.senderAvatar || "",
    message.messageType,
    message.status,
    message.readStatus ?? "",
    readCount,
    message.content || "",
    message.mediaUrl || "",
    message.mediaName || "",
    message.mediaSize || "",
    message.thumbnailUrl || "",
    message.duration || "",
    message.sendTime || "",
    locale.value,
  ].join("|");
};

const buildMessageView = (message: Message): MessageListItemView => {
  const key = messageKey(message);
  const digest = buildRenderDigest(message);
  const cached = messageViewCache.get(key);
  if (cached?.renderDigest === digest) {
    return cached;
  }

  const isMine = isOwnMessage(message);
  const isSystemMessage = message.messageType === "SYSTEM";
  const isRecalled = message.status === "RECALLED";
  const isDeleted = message.status === "DELETED";
  const timeLabel = Number.isNaN(new Date(message.sendTime).getTime())
    ? ""
    : timeFormatter.value.format(new Date(message.sendTime));
  const statusView = resolveStatusView(message, isMine);

  const view: MessageListItemView = {
    messageId: key,
    renderDigest: digest,
    isMine,
    isSystemMessage,
    isRecalled,
    isDeleted,
    messageType: message.messageType,
    content: message.content || "",
    senderName: message.senderName || message.groupName || t("message.unknownUser"),
    senderAvatar: message.senderAvatar,
    showSenderLabel: !isMine && Boolean(message.groupId || message.isGroupChat),
    currentUserName: props.currentUserName,
    currentUserAvatar: props.currentUserAvatar,
    timeLabel,
    statusLabel: statusView.statusLabel,
    statusTone: statusView.statusTone,
    groupReadLabel: statusView.groupReadLabel,
    mediaUrl: message.mediaUrl || message.content,
    thumbnailUrl: message.thumbnailUrl,
    fileName: resolveFileName(message),
    fileSizeLabel: message.mediaSize ? formatFileSize(message.mediaSize) : t("message.sizeUnknown"),
    durationLabel: formatDuration(message.duration),
  };

  messageViewCache.set(key, view);
  return view;
};

const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = [];
  let previousDateKey = "";
  const activeMessageIds = new Set<string>();

  props.messages.forEach((message, index) => {
    const key = messageKey(message);
    activeMessageIds.add(key);

    const currentDate = new Date(message.sendTime);
    const currentDateKey = Number.isNaN(currentDate.getTime())
      ? ""
      : dateFormatter.value.format(currentDate);

    if (currentDateKey && currentDateKey !== previousDateKey) {
      items.push({
        id: `separator-${currentDateKey}-${key}`,
        kind: "separator",
        label: currentDateKey,
      });
      previousDateKey = currentDateKey;
    }

    if (unreadBoundaryIndex.value === index) {
      items.push({
        id: `unread-${key}`,
        kind: "unread",
        label: t("message.unreadMessages"),
      });
    }

    const view = buildMessageView(message);
    const cached = messageRenderItemCache.get(key);
    if (cached?.view === view) {
      items.push(cached);
      return;
    }

    const nextItem: MessageRenderItem = {
      id: `message-${key}`,
      kind: "message",
      messageId: key,
      view,
    };
    messageRenderItemCache.set(key, nextItem);
    items.push(nextItem);
  });

  Array.from(messageViewCache.keys()).forEach((key) => {
    if (!activeMessageIds.has(key)) {
      messageViewCache.delete(key);
      messageRenderItemCache.delete(key);
    }
  });

  return items;
});

const tailMessageSignal = computed(() => {
  const lastMessage = props.messages[props.messages.length - 1];
  if (!lastMessage) {
    return "";
  }
  return buildRenderDigest(lastMessage);
});

const showScrollToLatest = computed(() => !nearBottom.value && props.messages.length > 0);
const messageScrollerStyle = computed(() => ({
  "--message-top-offset": `${messageTopOffset.value}px`,
}));

const messageListSignal = computed(() => ({
  length: props.messages.length,
  first: firstMessageKey.value,
  tail: tailMessageSignal.value,
  unread: unreadBoundaryIndex.value,
}));

const resolveMessageById = (messageId: string) => messageById.value.get(messageId) || null;

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

const updateShortListOffset = async () => {
  await nextTick();
  await nextFrame();
  const scrollerElement = scrollerRef.value;
  const wrapper = scrollerElement?.querySelector<HTMLElement>(".message-scroller-inner");
  if (!scrollerElement || !wrapper) {
    messageTopOffset.value = 0;
    return;
  }
  const nextOffset = Math.max(0, scrollerElement.clientHeight - wrapper.offsetHeight - 8);
  messageTopOffset.value = nextOffset > 12 ? nextOffset : 0;
};

const closeContextMenu = () => contextMenu.close();

const openContextMenu = (messageId: string, event: MouseEvent) => {
  const message = resolveMessageById(messageId);
  if (!message) {
    return;
  }
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

const previewImage = (messageId: string) => {
  const message = resolveMessageById(messageId);
  if (!message) {
    return;
  }
  window.open(message.mediaUrl || message.content, "_blank", "noopener,noreferrer");
};

const downloadFile = (messageId: string) => {
  const message = resolveMessageById(messageId);
  if (!message) {
    return;
  }
  const url = message.mediaUrl || message.content;
  if (!url) {
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = resolveFileName(message);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const playVideo = (_messageId: string) => {
  closeContextMenu();
};

const handleShowGroupReaders = (messageId: string) => {
  const message = resolveMessageById(messageId);
  if (message) {
    emit("show-group-readers", message);
  }
};

const toggleAudioById = (messageId: string) => {
  const message = resolveMessageById(messageId);
  if (message) {
    void toggleAudio(message);
  }
};

const scrollToBottom = async () => {
  const expectedScrollVersion = scrollVersion.value;
  await nextTick();
  await nextFrame();
  if (expectedScrollVersion !== scrollVersion.value) {
    return;
  }
  const container = scrollContainerRef.value;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
  await updateShortListOffset();
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
  refreshScheduled.value = false;
  await updateShortListOffset();
  if (stickToBottom) {
    await scrollToBottom();
  }
};

const handleResize = () => {
  void updateShortListOffset();
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
  scrollVersion.value += 1;
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
  window.addEventListener("resize", handleResize);
  void updateShortListOffset();
});

onUnmounted(() => {
  stop();
  clearHistoryFallbackTimer();
  messageViewCache.clear();
  messageRenderItemCache.clear();
  window.removeEventListener("click", closeContextMenu);
  window.removeEventListener("contextmenu", closeContextMenu);
  window.removeEventListener("resize", handleResize);
});
</script>

<style scoped lang="scss">
.message-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0)),
    rgba(226, 232, 240, 0.42);
}

.history-indicator {
  position: sticky;
  top: 0;
  z-index: 2;
  width: fit-content;
  margin: 0 auto 10px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--chat-panel-bg);
  border: 1px solid var(--chat-panel-border);
  backdrop-filter: var(--chat-glass-blur);
  color: var(--chat-text-secondary);
  font-size: 12px;
  font-weight: 600;
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
  padding: 18px 22px;
  border-radius: 8px;
  background: var(--chat-panel-bg);
  border: 1px solid var(--chat-panel-border);
  box-shadow: var(--chat-surface-shadow);
  backdrop-filter: var(--chat-glass-blur);
  text-align: center;
}

.message-empty-title {
  color: var(--chat-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.message-scroller {
  min-height: 100%;
}

.message-scroller-inner {
  width: 100%;
}

.message-scroller.is-short-list .message-scroller-inner {
  transform: translateY(var(--message-top-offset));
}

.message-row {
  min-width: 0;
}

.message-separator {
  display: flex;
  justify-content: center;
  padding: 6px 0 10px;
}

.message-separator-unread {
  align-items: center;
  gap: 10px;
  padding-top: 4px;
}

.separator-line {
  flex: 1;
  height: 1px;
  background: var(--chat-panel-border);
}

.separator-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--chat-panel-bg);
  border: 1px solid var(--chat-panel-border);
  color: var(--chat-text-tertiary);
  font-size: 11px;
  font-weight: 600;
}

.unread-pill {
  border-color: #93c5fd;
  color: var(--chat-accent-strong);
  background: rgba(37, 99, 235, 0.08);
}

.scroll-to-latest {
  position: sticky;
  left: calc(100% - 156px);
  bottom: 18px;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 108px;
  padding: 8px 12px;
  border: 0;
  border-radius: 999px;
  background: var(--chat-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
  cursor: pointer;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 132px;
  padding: 6px;
  border-radius: 8px;
  background: var(--chat-panel-bg);
  border: 1px solid var(--chat-panel-border);
  backdrop-filter: var(--chat-glass-blur);
  box-shadow: 0 20px 42px rgba(15, 23, 42, 0.16);
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
    padding: 12px 10px 14px;
  }

  .message-empty-card {
    padding: 24px 22px;
  }

  .message-empty-title {
    font-size: 14px;
  }

  .scroll-to-latest {
    left: auto;
    right: 0;
    bottom: 12px;
  }
}
</style>
