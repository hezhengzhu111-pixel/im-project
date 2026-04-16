<!-- Deprecated: legacy chat UI component. Active chat flow uses frontend/src/features/chat/*. -->
<template>
  <div class="conversation-list">
    <!-- 搜索框 -->
    <div class="search-box">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索聊天记录"
        :prefix-icon="Search"
        clearable
        @input="handleSearch"
      />
    </div>

    <!-- 会话列表 -->
    <div class="conversation-items">
      <div
        v-for="conversation in filteredConversations"
        :key="conversation.id"
        class="conversation-item"
        :class="{ active: conversation.id === activeConversationId }"
        @click="selectConversation(conversation)"
      >
        <!-- 头像 -->
        <el-avatar
          :size="48"
          :src="conversation.targetAvatar"
          class="conversation-avatar"
        >
          {{ getAvatarText(conversation.targetName) }}
        </el-avatar>

        <!-- 会话信息 -->
        <div class="conversation-info">
          <div class="conversation-header">
            <span class="conversation-name">{{ conversation.targetName }}</span>
            <span class="conversation-time">{{
              formatTime(
                conversation.lastMessage?.sendTime ||
                  conversation.updateTime ||
                  Date.now(),
              )
            }}</span>
          </div>

          <div class="conversation-footer">
            <span class="last-message">{{
              getLastMessageText(conversation)
            }}</span>
            <el-badge
              v-if="(conversation.unreadCount || 0) > 0"
              :value="conversation.unreadCount || 0"
              :max="99"
              class="unread-badge"
            />
          </div>
        </div>

        <!-- 置顶标识 -->
        <el-icon v-if="conversation.isPinned" class="pin-icon">
          <Top />
        </el-icon>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredConversations.length === 0" class="empty-state">
        <el-empty description="暂无聊天记录" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from "vue";
import {Search, Top} from "@element-plus/icons-vue";
import {debounce, formatTime, getAvatarText} from "@/utils/common";
import type {Conversation} from "@/types/chat";

interface Props {
  conversations: Conversation[];
  activeConversationId?: string;
}

interface Emits {
  (e: "select", conversation: Conversation): void;
  (e: "search", keyword: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 响应式数据
const searchKeyword = ref("");

// 计算属性
const filteredConversations = computed(() => {
  console.log("ConversationList: 接收到的会话数据", props.conversations);
  if (!searchKeyword.value.trim()) {
    return props.conversations;
  }

  const keyword = searchKeyword.value.toLowerCase();
  return props.conversations.filter(
    (conversation) =>
      conversation.targetName.toLowerCase().includes(keyword) ||
      conversation.lastMessage?.content?.toLowerCase().includes(keyword),
  );
});

// 方法
const selectConversation = (conversation: Conversation) => {
  console.log("ConversationList: 选择会话", conversation);
  emit("select", conversation);
};

const handleSearch = debounce((keyword: string) => {
  emit("search", keyword);
}, 300);

const getLastMessageText = (conversation: Conversation): string => {
  if (!conversation.lastMessage) {
    return "暂无消息";
  }

  // 直接返回消息内容，因为lastMessage已经是一个对象
  return conversation.lastMessage.content || "暂无消息";
};
</script>

<style lang="scss" scoped>
.conversation-list {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-box {
  padding: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.conversation-items {
  flex: 1;
  overflow-y: auto;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;

  &:hover {
    background-color: #f5f7fa;
  }

  &.active {
    background-color: #e6f7ff;

    &::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background-color: #409eff;
    }
  }
}

.conversation-avatar {
  flex-shrink: 0;
}

.conversation-info {
  flex: 1;
  min-width: 0;
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.conversation-name {
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-time {
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}

.conversation-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.last-message {
  font-size: 13px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.unread-badge {
  flex-shrink: 0;
}

.pin-icon {
  position: absolute;
  top: 8px;
  right: 8px;
  color: #f56c6c;
  font-size: 12px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

// 滚动条样式
.conversation-items::-webkit-scrollbar {
  width: 4px;
}

.conversation-items::-webkit-scrollbar-track {
  background: transparent;
}

.conversation-items::-webkit-scrollbar-thumb {
  background-color: #c0c4cc;
  border-radius: 2px;

  &:hover {
    background-color: #909399;
  }
}
</style>
