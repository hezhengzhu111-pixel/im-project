<template>
  <div
    class="message-item"
    :class="{ 'is-mine': isMine }"
    @contextmenu.prevent="emit('open-context-menu', message, $event)"
  >
    <el-avatar
      v-if="!isMine"
      :size="36"
      :src="message.senderAvatar"
      class="message-avatar"
      shape="square"
    >
      {{ senderAvatarText }}
    </el-avatar>

    <div class="message-content">
      <div v-if="showSenderInfo && !isMine" class="message-sender">
        {{ senderDisplayName }}
      </div>

      <div
        class="message-bubble"
        :class="`message-type-${message.messageType.toLowerCase()}`"
      >
        <div v-if="isRecalled" class="recalled-content">消息已撤回</div>
        <div v-else-if="isDeleted" class="deleted-content">消息已删除</div>

        <div v-else-if="message.messageType === 'TEXT'" class="text-content">
          {{ message.content }}
        </div>

        <button
          v-else-if="message.messageType === 'IMAGE'"
          class="image-content interactive-reset"
          type="button"
          @click="emit('preview-image', message)"
        >
          <el-image
            :src="message.mediaUrl || message.content"
            :preview-src-list="[]"
            fit="cover"
            class="message-image"
          />
        </button>

        <div v-else-if="message.messageType === 'FILE'" class="file-content">
          <div class="file-info">
            <el-icon class="file-icon"><Document /></el-icon>
            <div class="file-details">
              <div class="file-name">{{ fileName }}</div>
              <div class="file-size">{{ fileSize }}</div>
            </div>
            <el-button type="primary" size="small" @click="emit('download-file', message)">
              下载
            </el-button>
          </div>
        </div>

        <div v-else-if="message.messageType === 'VOICE'" class="voice-content">
          <el-button
            :icon="audioPlaying ? VideoPause : VideoPlay"
            circle
            @click="emit('toggle-audio', message)"
          />
          <span class="voice-duration">{{ voiceDuration }}</span>
        </div>

        <div v-else-if="message.messageType === 'VIDEO'" class="video-content">
          <video
            :src="message.mediaUrl || message.content"
            :poster="message.thumbnailUrl"
            controls
            class="message-video"
            @play="emit('play-video', message)"
          />
          <div v-if="message.duration" class="video-duration">
            {{ voiceDuration }}
          </div>
        </div>

        <div v-else-if="message.messageType === 'SYSTEM'" class="system-content">
          {{ message.content }}
        </div>

        <div v-if="isMine" class="message-status">
          <el-icon
            v-if="message.status === 'SENDING'"
            class="status-sending is-loading"
          >
            <Loading />
          </el-icon>
          <el-icon
            v-else-if="message.status === 'FAILED'"
            class="status-failed"
            title="发送失败"
            color="#f56c6c"
          >
            <Warning />
          </el-icon>
          <span
            v-else-if="isGroupMessage && groupReadCount > 0"
            class="status-group-read"
            :title="`群成员已读 ${groupReadCount} 人`"
            @click.stop="emit('show-group-readers', message)"
          >
            已读{{ groupReadCount }}
          </span>
          <span
            v-else-if="message.status === 'READ' || message.readStatus === 1"
            class="status-read"
            title="对方已读"
          >
            ✓✓
          </span>
          <span
            v-else-if="message.status === 'SENT' || message.status === 'DELIVERED'"
            class="status-sent"
            title="发送成功"
          >
            ✓
          </span>
        </div>
      </div>
    </div>

    <el-avatar
      v-if="isMine"
      :size="36"
      :src="currentUserAvatar"
      class="message-avatar"
      shape="square"
    >
      {{ currentUserAvatarText }}
    </el-avatar>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Document,
  Loading,
  VideoPause,
  VideoPlay,
  Warning,
} from "@element-plus/icons-vue";
import { formatFileSize, getAvatarText } from "@/utils/common";
import type { Message } from "@/types";

interface Props {
  message: Message;
  currentUserId: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  showSenderInfo?: boolean;
  audioPlaying?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showSenderInfo: true,
  audioPlaying: false,
});

const emit = defineEmits<{
  (e: "show-group-readers", message: Message): void;
  (e: "open-context-menu", message: Message, event: MouseEvent): void;
  (e: "toggle-audio", message: Message): void;
  (e: "download-file", message: Message): void;
  (e: "preview-image", message: Message): void;
  (e: "play-video", message: Message): void;
}>();

const senderDisplayName = computed(() => {
  return props.message.senderName || "未知用户";
});

const senderAvatarText = computed(() => {
  return getAvatarText(senderDisplayName.value);
});

const isMine = computed(() => {
  const senderId = String(props.message.senderId || "");
  const currentUserId = String(props.currentUserId || "");
  if (senderId && currentUserId && senderId === currentUserId) {
    return true;
  }
  return Boolean(
    props.currentUserName &&
      props.message.senderName &&
      props.currentUserName === props.message.senderName,
  );
});

const isRecalled = computed(() => props.message.status === "RECALLED");

const isDeleted = computed(() => props.message.status === "DELETED");

const isGroupMessage = computed(() => Boolean(props.message.groupId));

const groupReadCount = computed(() => {
  if (typeof props.message.readByCount === "number" && props.message.readByCount > 0) {
    return props.message.readByCount;
  }
  return props.message.readBy?.length || 0;
});

const voiceDuration = computed(() => {
  if (!props.message.duration) {
    return "0:00";
  }
  const minutes = Math.floor(props.message.duration / 60);
  const seconds = props.message.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
});

const fileName = computed(() => {
  if (props.message.mediaName) {
    return props.message.mediaName;
  }
  try {
    const url = new URL(props.message.mediaUrl || props.message.content);
    return url.pathname.split("/").pop() || "未知文件";
  } catch {
    return "未知文件";
  }
});

const fileSize = computed(() => {
  return props.message.mediaSize ? formatFileSize(props.message.mediaSize) : "未知大小";
});

const currentUserAvatarText = computed(() => {
  return getAvatarText(props.currentUserName || props.currentUserId);
});
</script>

<style lang="scss" scoped>
.interactive-reset {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.message-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;

  &.is-mine {
    justify-content: flex-end;

    .message-content {
      align-items: flex-end;
    }

    .message-bubble {
      background-color: #95ec69;
      color: #000;
      border: 1px solid #7dde53;

      &::before {
        border-right: 0;
        border-left: 6px solid #95ec69;
        border-right-color: transparent;
        left: auto;
        right: -6px;
      }

      &::after {
        border-right: 0;
        border-left: 6px solid #7dde53;
        border-right-color: transparent;
        left: auto;
        right: -7px;
        z-index: -1;
      }
    }

    .message-sender {
      text-align: right;
    }
  }
}

.message-avatar {
  flex-shrink: 0;
  border-radius: 4px;
}

.message-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
  max-width: min(100%, 520px);
}

.message-sender {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.message-bubble {
  position: relative;
  display: inline-block;
  max-width: 100%;
  padding: 10px 14px;
  border-radius: 6px;
  background-color: #ffffff;
  word-break: break-word;
  white-space: pre-wrap;
  border: 1px solid #ededed;
  font-size: 15px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &::before {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    border: 6px solid transparent;
    border-right-color: #ffffff;
    border-left: 0;
    left: -6px;
    top: 14px;
    margin-top: -6px;
  }

  &::after {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    border: 6px solid transparent;
    border-right-color: #ededed;
    border-left: 0;
    left: -7px;
    top: 14px;
    margin-top: -6px;
    z-index: -1;
  }

  &.message-type-system {
    background-color: #e6f7ff;
    color: #1890ff;
    text-align: center;
    border: none;

    &::before,
    &::after {
      display: none;
    }
  }
}

.text-content {
  line-height: 1.4;
}

.image-content .message-image {
  max-width: 240px;
  max-height: 240px;
  border-radius: 6px;
}

.file-content .file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background-color: white;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}

.file-icon {
  font-size: 24px;
  color: #409eff;
}

.file-details {
  flex: 1;
}

.file-name {
  font-weight: 500;
  margin-bottom: 2px;
}

.file-size {
  font-size: 12px;
  color: #909399;
}

.voice-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.voice-duration,
.video-duration {
  font-size: 12px;
  color: #909399;
}

.video-content .message-video {
  max-width: 300px;
  max-height: 200px;
  border-radius: 4px;
}

.system-content {
  font-style: italic;
  color: #909399;
}

.message-status {
  position: absolute;
  top: 50%;
  left: -24px;
  margin-top: -8px;
}

.status-sending {
  color: #dcdfe6;
}

.status-failed {
  color: #f56c6c;
}

.status-sent,
.status-read,
.status-group-read {
  font-size: 12px;
  line-height: 16px;
}

.status-sent {
  color: #909399;
}

.status-read {
  color: #67c23a;
}

.status-group-read {
  color: #409eff;
  cursor: pointer;
}
</style>
