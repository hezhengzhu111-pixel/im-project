<template>
  <div
    ref="scrollContainerRef"
    class="message-list"
    role="log"
    aria-live="polite"
    @scroll.passive="handleScroll"
  >
    <DynamicScroller
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
            @show-group-readers="emit('show-group-readers', $event)"
            @open-context-menu="openContextMenu"
            @toggle-audio="toggleAudio"
            @download-file="downloadFile"
            @preview-image="previewImage"
            @play-video="playVideo"
            @media-loaded="handleMediaLoaded"
            :image-scroll-container="scrollContainerRef"
          />
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>

    <div
      v-if="contextMenu.visible && contextTargetMessage"
      class="context-menu"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      @click.self="contextMenu.close()"
    >
      <div
        v-if="contextTargetMessage?.messageType === 'TEXT'"
        class="menu-item"
        @click="handleCopy"
      >
        复制
      </div>
      <div v-if="canRecall" class="menu-item" @click="handleRecall">撤回</div>
      <div class="menu-item" @click="handleDelete">删除</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import MessageItem from "@/components/MessageItem.vue";
import { useAudioPlayer } from "@/features/chat/composables/useAudioPlayer";
import { useMessageActions } from "@/features/chat/composables/useMessageActions";
import { useMessageContextMenu } from "@/features/chat/composables/useMessageContextMenu";
import type { Message } from "@/types";

interface Props {
  messages: Message[];
  currentUserId: string;
  currentUserName?: string;
  currentUserAvatar?: string;
}

const props = defineProps<Props>();

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
const loadingHistory = ref(false);
const nearBottom = ref(true);
const pendingHistoryAnchor = ref<HistoryAnchor | null>(null);
const historyFallbackTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const refreshScheduled = ref(false);
const { playingMessageId, toggle: toggleAudio, stop } = useAudioPlayer();
const { copy, recall, remove } = useMessageActions();
const contextMenu = useMessageContextMenu();
const contextTargetMessage = computed(() => contextMenu.targetMessage.value);

const canRecall = computed(() => {
  const message = contextMenu.targetMessage.value;
  if (!message) {
    return false;
  }
  if (String(message.senderId) !== props.currentUserId) {
    return false;
  }
  const sentAt = new Date(message.sendTime).getTime();
  return Date.now() - sentAt <= 2 * 60 * 1000;
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
  if (contextMenu.targetMessage.value) {
    await copy(contextMenu.targetMessage.value);
  }
  closeContextMenu();
};

const handleRecall = async () => {
  if (contextMenu.targetMessage.value) {
    await recall(contextMenu.targetMessage.value);
  }
  closeContextMenu();
};

const handleDelete = async () => {
  if (contextMenu.targetMessage.value) {
    await remove(contextMenu.targetMessage.value);
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

const clearHistoryFallbackTimer = () => {
  if (historyFallbackTimer.value) {
    clearTimeout(historyFallbackTimer.value);
    historyFallbackTimer.value = null;
  }
};

const releaseHistoryLoading = () => {
  loadingHistory.value = false;
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
  if (!loadingHistory.value && container.scrollTop < HISTORY_TRIGGER_TOP) {
    loadingHistory.value = true;
    pendingHistoryAnchor.value = {
      previousHeight: container.scrollHeight,
      previousTop: container.scrollTop,
      firstMessageKey: firstMessageKey.value,
      length: props.messages.length,
    };
    emit("request-history");
    scheduleHistoryFallback();
  }
  if (!document.hidden) {
    if (isNearBottom(READ_ACK_BOTTOM_THRESHOLD)) {
      emit("mark-read");
    }
  }
};

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
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #f5f7fa;
  position: relative;
}

.message-scroller {
  min-height: 100%;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 5px 0;
  min-width: 100px;
}

.menu-item {
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #606266;

  &:hover {
    background-color: #f5f7fa;
    color: #409eff;
  }
}
</style>
