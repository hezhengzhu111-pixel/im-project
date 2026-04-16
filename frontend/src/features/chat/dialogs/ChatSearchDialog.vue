<template>
  <el-dialog
    v-model="visible"
    title="Search messages"
    width="560px"
    append-to-body
    class="chat-shell-dialog"
  >
    <div class="search-panel">
      <el-input
        v-model="messageSearchKeyword"
        clearable
        placeholder="Search in current conversation"
      />

      <div class="search-results chat-soft-scrollbar">
        <el-empty
          v-if="!messageSearchKeyword.trim()"
          description="Type a keyword to search this conversation."
          :image-size="60"
        />
        <el-empty
          v-else-if="searchResults.length === 0"
          description="No matching messages."
          :image-size="60"
        />
        <template v-else>
          <div
            v-for="result in searchResults"
            :key="`${result.message.id}-${result.message.sendTime}`"
            class="search-result-item"
          >
            <div class="search-result-meta">
              <span>{{ result.message.senderName || result.message.senderId }}</span>
              <span>{{ formatMessageTime(result.message.sendTime) }}</span>
            </div>
            <div class="search-result-content">{{ formatMessageContent(result.message) }}</div>
            <div v-if="result.context.length > 1" class="search-result-context">
              {{ formatContext(result) }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {useChatStore} from "@/stores/chat";
import type {Message, MessageSearchResult} from "@/types";

const props = defineProps<{
  modelValue: boolean;
  sessionId?: string;
  searchResults: MessageSearchResult[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const chatStore = useChatStore();
const messageSearchKeyword = ref("");

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const searchResults = computed(() => props.searchResults);

watch(
  [visible, messageSearchKeyword, () => props.sessionId],
  ([isVisible, keyword, sessionId]) => {
    if (!isVisible) {
      void chatStore.searchMessages("", sessionId);
      return;
    }
    if (!sessionId) {
      return;
    }
    void chatStore.searchMessages(keyword, sessionId);
  },
);

watch(visible, (isVisible) => {
  if (!isVisible) {
    messageSearchKeyword.value = "";
  }
});

const formatMessageTime = (value?: string) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

const formatMessageContent = (message: Message) => {
  switch (message.messageType) {
    case "IMAGE":
      return "[Image]";
    case "FILE":
      return message.mediaName ? `[File] ${message.mediaName}` : "[File]";
    case "VOICE":
      return "[Voice]";
    case "VIDEO":
      return "[Video]";
    default:
      return message.content || "";
  }
};

const formatContext = (result: MessageSearchResult) =>
  result.context
    .map((message) => formatMessageContent(message))
    .filter(Boolean)
    .join("  |  ");
</script>

<style scoped lang="scss">
.search-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.search-results {
  max-height: 340px;
  overflow-y: auto;
}

.search-result-item {
  padding: 12px 14px;
  border: 1px solid rgba(226, 232, 240, 0.82);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.82);
}

.search-result-item + .search-result-item {
  margin-top: 10px;
}

.search-result-meta,
.search-result-context {
  color: var(--chat-text-tertiary);
  font-size: 12px;
}

.search-result-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.search-result-content {
  margin-top: 8px;
  color: var(--chat-text-primary);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.search-result-context {
  margin-top: 8px;
  line-height: 1.5;
}
</style>
