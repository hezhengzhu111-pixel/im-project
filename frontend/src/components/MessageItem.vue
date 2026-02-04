<template>
  <div
    class="message-item"
    :class="{ 'is-mine': String(message.senderId) === String(currentUserId) }"
  >
    <!-- 发送者头像 -->
    <el-avatar
      v-if="String(message.senderId) !== String(currentUserId)"
      :size="36"
      :src="message.senderAvatar || message.sender?.avatar"
      class="message-avatar"
      shape="square"
    >
      {{ getMessageSenderAvatar(message) }}
    </el-avatar>

    <!-- 消息内容 -->
    <div class="message-content">
      <!-- 发送者信息 -->
      <div v-if="showSenderInfo && String(message.senderId) !== String(currentUserId)" class="message-sender">
        {{ getMessageSenderName(message) }}
      </div>

      <!-- 消息气泡 -->
      <div
        class="message-bubble"
        :class="`message-type-${messageType.toLowerCase()}`"
        @contextmenu.prevent="showContextMenu"
      >
        <!-- 文本消息 -->
        <div v-if="messageType === 'TEXT'" class="text-content">
          {{ message.content }}
        </div>

        <!-- 图片消息 -->
        <div v-else-if="messageType === 'IMAGE'" class="image-content">
          <el-image
            :src="getImageUrl(message)"
            :preview-src-list="[getImageUrl(message)]"
            fit="cover"
            class="message-image"
            @click="previewImage"
          >
            <template #placeholder>
              <div class="image-placeholder">加载中...</div>
            </template>
            <template #error>
              <div class="image-error">加载失败</div>
            </template>
          </el-image>
        </div>

        <!-- 文件消息 -->
        <div v-else-if="messageType === 'FILE'" class="file-content">
          <div class="file-info">
            <el-icon class="file-icon"><Document /></el-icon>
            <div class="file-details">
              <div class="file-name">{{ getFileName(message.content) }}</div>
              <div class="file-size">{{ getFileSize(message.content) }}</div>
            </div>
            <el-button type="primary" size="small" @click="downloadFile">
              下载
            </el-button>
          </div>
        </div>

        <!-- 语音消息 -->
        <div v-else-if="messageType === 'VOICE'" class="voice-content">
          <el-button
            :icon="audioPlaying ? 'VideoPause' : 'VideoPlay'"
            circle
            @click="toggleAudio"
          />
          <span class="voice-duration">{{ getVoiceDuration(message) }}</span>
        </div>

        <!-- 视频消息 -->
        <div v-else-if="messageType === 'VIDEO'" class="video-content">
          <video
            :src="getVideoUrl(message)"
            :poster="message.thumbnailUrl"
            controls
            class="message-video"
            @click="playVideo"
          />
          <div v-if="message.duration" class="video-duration">
            {{ getVoiceDuration(message) }}
          </div>
        </div>

        <!-- 系统消息 -->
        <div
          v-else-if="messageType === 'SYSTEM'"
          class="system-content"
        >
          {{ message.content }}
        </div>

        <!-- 消息状态 -->
        <div
          v-if="String(message.senderId) === String(currentUserId)"
          class="message-status"
        >
          <el-icon v-if="message.status === 'SENDING'" class="status-sending is-loading"
            ><Loading
          /></el-icon>
          <el-icon
            v-else-if="message.status === 'FAILED'"
            class="status-failed"
            title="发送失败"
            color="#f56c6c"
            ><Warning
          /></el-icon>
        </div>
      </div>
    </div>

    <!-- 我的头像 -->
    <el-avatar
      v-if="String(message.senderId) === String(currentUserId)"
      :size="36"
      :src="currentUserAvatar"
      class="message-avatar"
      shape="square"
    >
      {{ currentUserAvatarText }}
    </el-avatar>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ top: `${contextMenuY}px`, left: `${contextMenuX}px` }"
      v-click-outside="closeContextMenu"
    >
      <div class="menu-item" @click="handleCopy" v-if="messageType === 'TEXT'">复制</div>
      <div class="menu-item" @click="handleRecall" v-if="canRecall">撤回</div>
      <div class="menu-item" @click="handleDelete">删除</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { Document, Loading, Warning, VideoPlay, VideoPause } from "@element-plus/icons-vue";
import { useMessage } from "@/hooks/useMessage";
import { formatFileSize, getAvatarText } from "@/utils/common";
import type { Message } from "@/types/message";
import { ElMessage, ElMessageBox } from "element-plus";
import { useChatStore } from "@/stores/chat";

// Computed message type (API may use 'type' or 'messageType')
const messageType = computed(() => {
  return props.message.messageType || props.message.type || 'TEXT';
});

// Custom directive for clicking outside
const vClickOutside = {
  mounted(el: HTMLElement, binding: any) {
    el._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event);
      }
    };
    document.addEventListener("click", el._clickOutside);
    document.addEventListener("contextmenu", el._clickOutside);
  },
  unmounted(el: HTMLElement) {
    document.removeEventListener("click", el._clickOutside);
    document.removeEventListener("contextmenu", el._clickOutside);
  },
};

interface Props {
  message: Message;
  currentUserId: string;
  currentUserAvatar?: string;
  showSenderInfo?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showSenderInfo: true,
});

const { getMessageSenderAvatar, getMessageSenderName, formatMessageTime, canRecallMessage, recallMessage } =
  useMessage();
const chatStore = useChatStore();

const audioPlaying = ref(false);
let audioPlayer: HTMLAudioElement | null = null;

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);

// 组件销毁时停止播放
onUnmounted(() => {
  stopAudio();
});

const canRecall = computed(() => {
  return canRecallMessage(props.message, props.currentUserId);
});

// Context Menu Logic
const showContextMenu = (event: MouseEvent) => {
  contextMenuVisible.value = true;
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
};

const closeContextMenu = () => {
  contextMenuVisible.value = false;
};

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    ElMessage.success("已复制");
  } catch (err) {
    ElMessage.error("复制失败");
  }
  closeContextMenu();
};

const handleRecall = async () => {
  try {
    await recallMessage(String(props.message.id));
    ElMessage.success("已撤回");
  } catch (error: any) {
    ElMessage.error(error.message || "撤回失败");
  }
  closeContextMenu();
};

const handleDelete = async () => {
  try {
    await ElMessageBox.confirm("确定删除这条消息吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    await chatStore.deleteMessage(String(props.message.id));
  } catch (error) {
    // Cancelled
  }
  closeContextMenu();
};

// 获取语音消息时长
const getVoiceDuration = (message: Message) => {
  if (message.duration) {
    const minutes = Math.floor(message.duration / 60);
    const seconds = message.duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  return "0:00";
};

// 获取文件名
const getFileName = (content: string) => {
  if (props.message.mediaName) {
    return props.message.mediaName;
  }
  try {
    const url = new URL(props.message.mediaUrl || content);
    const pathname = url.pathname;
    return pathname.split("/").pop() || "未知文件";
  } catch {
    return "未知文件";
  }
};

// 获取文件大小
const getFileSize = (_content: string) => {
  if (props.message.mediaSize) {
    return formatFileSize(props.message.mediaSize);
  }
  return "未知大小";
};

// 获取图片URL
const getImageUrl = (message: Message) => {
  return message.mediaUrl || message.content;
};

// 获取视频URL
const getVideoUrl = (message: Message) => {
  return message.mediaUrl || message.content;
};

// 播放/暂停语音
const toggleAudio = () => {
  if (audioPlaying.value) {
    stopAudio();
  } else {
    playAudio();
  }
};

const playAudio = () => {
  // 检查是否是Base64内容
  const content = props.message.content || "";
  const mediaUrl = props.message.mediaUrl || "";
  let url = mediaUrl;
  
  if (!url && content && content.startsWith("data:audio")) {
      url = content;
  } else if (!url && content) {
      // 兼容可能没有前缀的Base64
      // 这里假设如果是VOICE类型且没有URL，那content可能就是Base64（虽然这不太规范，但为了鲁棒性）
      // 或者 content 只是文件名，那也没办法播放
      // 如果content是url
      if (content.startsWith("http")) {
          url = content;
      }
  }

  if (!url) {
    ElMessage.warning("语音文件无效");
    return;
  }
  
  // 如果之前已经创建过player但url变了（不太可能，但为了安全），或者第一次创建
  if (!audioPlayer) {
    audioPlayer = new Audio(url);
    
    audioPlayer.onended = () => {
      audioPlaying.value = false;
    };
    
    audioPlayer.onerror = () => {
      audioPlaying.value = false;
      console.error("Audio playback error");
      ElMessage.error("语音播放失败");
    };
  } else if (audioPlayer.src !== url) {
      audioPlayer.src = url;
  }
  
  audioPlayer.play().then(() => {
    audioPlaying.value = true;
  }).catch(e => {
    console.error("Play failed", e);
    ElMessage.error("播放失败: " + e.message);
    audioPlaying.value = false;
  });
};

const stopAudio = () => {
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }
  audioPlaying.value = false;
};

// 预览图片
const previewImage = () => {
  // Element Plus的图片预览会自动处理
};

// 下载文件
const downloadFile = () => {
  const url = props.message.mediaUrl || props.message.content;
  if (url) {
    window.open(url, "_blank");
  }
};

// 播放视频
const playVideo = () => {
  // 视频播放由HTML5 video元素自动处理
};

// 计算属性
const currentUserAvatarText = computed(() => {
  return getAvatarText(props.currentUserAvatar);
});
</script>

<style lang="scss" scoped>
.message-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;

  &.is-mine {
    flex-direction: row-reverse;

    .message-content {
      align-items: flex-end;
    }

    .message-bubble {
      background-color: #95EC69;
      color: #000;
      border: 1px solid #7DDE53; /* Slightly darker border for depth */
      border-radius: 6px; /* Slightly more rounded */

      &::before {
        border-right: 0;
        border-left: 6px solid #95EC69;
        border-right-color: transparent;
        left: auto;
        right: -6px;
      }

      &::after {
        border-right: 0;
        border-left: 6px solid #7DDE53; /* Match border color */
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
  border-radius: 4px; /* WeChat style rounded square */
}

.message-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 60%;
}

.message-sender {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.message-bubble {
  position: relative;
  padding: 10px 14px;
  border-radius: 6px;
  background-color: #ffffff;
  word-wrap: break-word;
  border: 1px solid #ededed;
  font-size: 15px; /* Improved readability */
  box-shadow: 0 1px 2px rgba(0,0,0,0.05); /* Subtle shadow */

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
    /* Border outline for arrow */
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
    &::before, &::after {
      display: none;
    }
  }
}

.text-content {
  line-height: 1.4;
}

.image-content {
  .message-image {
    max-width: 200px;
    max-height: 200px;
    border-radius: 4px;
    cursor: pointer;
  }
}

.file-content {
  .file-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background-color: white;
    border-radius: 4px;
    border: 1px solid #e4e7ed;

    .file-icon {
      font-size: 24px;
      color: #409eff;
    }

    .file-details {
      flex: 1;

      .file-name {
        font-weight: 500;
        margin-bottom: 2px;
      }

      .file-size {
        font-size: 12px;
        color: #909399;
      }
    }
  }
}

.audio-content {
  display: flex;
  align-items: center;
  gap: 8px;

  .audio-duration {
    font-size: 12px;
    color: #909399;
  }
}

.video-content {
  .message-video {
    max-width: 300px;
    max-height: 200px;
    border-radius: 4px;
  }
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
  
  .status-sending {
    color: #dcdfe6;
  }

  .status-failed {
    color: #f56c6c;
    cursor: pointer;
  }
}

.context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
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
