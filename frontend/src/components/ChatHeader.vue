<!-- Deprecated: legacy chat UI component. Active chat flow uses frontend/src/features/chat/*. -->
<template>
  <div class="chat-header">
    <div class="chat-info">
      <el-avatar :size="36" :src="conversation?.targetAvatar" class="chat-avatar">
        {{ getAvatarText(conversation?.targetName) }}
      </el-avatar>

      <div class="chat-details">
        <div class="chat-name">{{ conversation?.targetName || "未知用户" }}</div>
        <div class="chat-status" :class="`status-${onlineStatus}`">
          <el-icon class="status-icon">
            <SuccessFilled v-if="onlineStatus === 'online'" />
            <Clock v-else-if="onlineStatus === 'away'" />
            <Minus v-else-if="onlineStatus === 'busy'" />
            <CircleCloseFilled v-else />
          </el-icon>
          {{ getStatusText(onlineStatus) }}
        </div>
      </div>
    </div>

    <div class="chat-actions">
      <el-button
        link
        :icon="VideoCamera"
        title="视频通话"
        @click="startVideoCall"
      />
      <el-button link :icon="Phone" title="语音通话" @click="startVoiceCall" />

      <el-dropdown trigger="click" @command="handleCommand">
        <el-button link :icon="MoreFilled" title="更多操作" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="info">
              <el-icon><InfoFilled /></el-icon>
              聊天信息
            </el-dropdown-item>
            <el-dropdown-item command="search">
              <el-icon><Search /></el-icon>
              搜索聊天记录
            </el-dropdown-item>
            <el-dropdown-item command="pin">
              <el-icon><Top /></el-icon>
              {{ conversation?.isPinned ? "取消置顶" : "置顶聊天" }}
            </el-dropdown-item>
            <el-dropdown-item command="mute">
              <el-icon><Bell /></el-icon>
              {{ conversation?.isMuted ? "取消免打扰" : "消息免打扰" }}
            </el-dropdown-item>
            <el-dropdown-item divided command="clear">
              <el-icon><Delete /></el-icon>
              清空聊天记录
            </el-dropdown-item>
            <el-dropdown-item command="delete">
              <el-icon><Close /></el-icon>
              删除聊天
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from "vue";
import {ElMessage, ElMessageBox} from "element-plus";
import {
  Bell,
  CircleCloseFilled,
  Clock,
  Close,
  Delete,
  InfoFilled,
  Minus,
  MoreFilled,
  Phone,
  Search,
  SuccessFilled,
  Top,
  VideoCamera,
} from "@element-plus/icons-vue";
import {getAvatarText} from "@/utils/common";
import {USER_STATUS} from "@/constants";
import type {Conversation} from "@/types/chat";

interface Props {
  conversation?: Conversation | null;
  onlineStatus?: string;
}

interface Emits {
  (e: "video-call"): void;
  (e: "voice-call"): void;
  (e: "show-info"): void;
  (e: "search-messages"): void;
  (e: "pin-conversation", isPinned: boolean): void;
  (e: "mute-conversation", isMuted: boolean): void;
  (e: "clear-messages"): void;
  (e: "delete-conversation"): void;
}

const props = withDefaults(defineProps<Props>(), {
  onlineStatus: "offline",
});

const emit = defineEmits<Emits>();

// 计算属性
const isGroupChat = computed(() => {
  return props.conversation?.type === "group";
});

// 方法
const getStatusText = (status: string): string => {
  if (isGroupChat.value) {
    return `${props.conversation?.memberCount || 0}人`;
  }

  switch (status) {
    case USER_STATUS.ONLINE:
      return "在线";
    case USER_STATUS.AWAY:
      return "离开";
    case USER_STATUS.BUSY:
      return "忙碌";
    case USER_STATUS.OFFLINE:
      return "离线";
    default:
      return "未知";
  }
};

const startVideoCall = () => {
  if (!props.conversation) {
    ElMessage.warning("请先选择聊天对象");
    return;
  }
  emit("video-call");
};

const startVoiceCall = () => {
  if (!props.conversation) {
    ElMessage.warning("请先选择聊天对象");
    return;
  }
  emit("voice-call");
};

const handleCommand = async (command: string) => {
  if (!props.conversation) {
    ElMessage.warning("请先选择聊天对象");
    return;
  }

  switch (command) {
    case "info":
      emit("show-info");
      break;

    case "search":
      emit("search-messages");
      break;

    case "pin":
      emit("pin-conversation", !props.conversation.isPinned);
      break;

    case "mute":
      emit("mute-conversation", !props.conversation.isMuted);
      break;

    case "clear":
      try {
        await ElMessageBox.confirm(
          "确定要清空聊天记录吗？此操作不可恢复。",
          "清空聊天记录",
          {
            confirmButtonText: "确定",
            cancelButtonText: "取消",
            type: "warning",
          },
        );
        emit("clear-messages");
      } catch (error) {
        // 用户取消操作
      }
      break;

    case "delete":
      try {
        await ElMessageBox.confirm(
          "确定要删除此聊天吗？此操作不可恢复。",
          "删除聊天",
          {
            confirmButtonText: "确定",
            cancelButtonText: "取消",
            type: "warning",
          },
        );
        emit("delete-conversation");
      } catch (error) {
        // 用户取消操作
      }
      break;
  }
};
</script>

<style lang="scss" scoped>
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: #fff;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.chat-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.chat-avatar {
  flex-shrink: 0;
}

.chat-details {
  flex: 1;
  min-width: 0;
}

.chat-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;

  .status-icon {
    font-size: 8px;
  }

  &.status-online .status-icon {
    color: #67c23a;
  }

  &.status-away .status-icon {
    color: #e6a23c;
  }

  &.status-busy .status-icon {
    color: #f56c6c;
  }

  &.status-offline .status-icon {
    color: #909399;
  }
}

.chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  .el-button {
    color: #606266;

    &:hover {
      color: #409eff;
    }
  }
}

// 响应式设计
@media (max-width: 768px) {
  .chat-header {
    padding: 8px 12px;
  }

  .chat-name {
    font-size: 14px;
  }

  .chat-actions {
    gap: 4px;

    .el-button {
      padding: 4px;
    }
  }
}
</style>
