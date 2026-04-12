<template>
  <div
    ref="scrollContainerRef"
    class="message-list"
    role="log"
    aria-live="polite"
    @scroll="handleScroll"
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

const scrollerRef = ref<{ scrollToItem?: (index: number) => void } | null>(null);
const scrollContainerRef = ref<HTMLElement | null>(null);
const loadingHistory = ref(false);
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
};

const handleScroll = async () => {
  const container = scrollContainerRef.value;
  if (!container) {
    return;
  }
  if (!loadingHistory.value && container.scrollTop < 80) {
    loadingHistory.value = true;
    const previousHeight = container.scrollHeight;
    emit("request-history");
    await nextTick();
    container.scrollTop = container.scrollHeight - previousHeight + container.scrollTop;
    loadingHistory.value = false;
  }
  if (!document.hidden) {
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (nearBottom) {
      emit("mark-read");
    }
  }
};

watch(
  () => props.messages.map((item) => item.id).join("|"),
  async (_, previousValue) => {
    if (!previousValue) {
      await scrollToBottom();
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
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 180;
    if (isSelfMessage || nearBottom) {
      await scrollToBottom();
    }
  },
);

onMounted(() => {
  window.addEventListener("click", closeContextMenu);
  window.addEventListener("contextmenu", closeContextMenu);
});

onUnmounted(() => {
  stop();
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
