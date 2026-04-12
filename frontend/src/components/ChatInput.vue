<template>
  <div class="chat-input">
    <!-- 工具栏 -->
    <div class="input-toolbar">
      <el-button
        :icon="Plus"
        circle
        size="small"
        @click="showFileMenu = !showFileMenu"
      />

      <!-- 文件菜单 -->
      <div v-if="showFileMenu" class="file-menu">
        <div class="file-menu-item" @click="selectImage">
          <el-icon><Picture /></el-icon>
          <span>图片</span>
        </div>
        <div class="file-menu-item" @click="selectFile">
          <el-icon><Document /></el-icon>
          <span>文件</span>
        </div>
        <div class="file-menu-item" @click="selectVideo">
          <el-icon><VideoCamera /></el-icon>
          <span>视频</span>
        </div>
      </div>

      <el-button
        :icon="Microphone"
        circle
        size="small"
        @click="toggleVoiceInput"
      />
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <el-input
        v-model="inputMessage"
        type="textarea"
        :rows="3"
        :maxlength="1000"
        placeholder="输入消息..."
        resize="none"
        @keydown.enter.exact="handleSend"
        @keydown.enter.shift.exact="handleNewLine"
        @input="handleInput"
      />

      <!-- 上传进度 -->
      <div v-if="uploading" class="upload-progress">
        <el-progress
          :percentage="uploadProgress"
          :show-text="false"
          size="small"
        />
        <span class="upload-text">上传中... {{ uploadProgress }}%</span>
      </div>
    </div>

    <!-- 发送按钮 -->
    <div class="send-area">
      <el-button
        type="primary"
        :loading="sending"
        :disabled="!canSend"
        @click="handleSend"
      >
        发送
      </el-button>
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      ref="imageInput"
      type="file"
      accept="image/*"
      multiple
      style="display: none"
      @change="handleImageSelect"
    />
    <input
      ref="fileInput"
      type="file"
      multiple
      style="display: none"
      @change="handleFileSelect"
    />
    <input
      ref="videoInput"
      type="file"
      accept="video/*"
      multiple
      style="display: none"
      @change="handleVideoSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import {
  Plus,
  Picture,
  Document,
  VideoCamera,
  Microphone,
} from "@element-plus/icons-vue";
import { useMessage } from "@/hooks/useMessage";
import { useFileUpload } from "@/hooks/useFileUpload";
import { MESSAGE_TYPES } from "@/constants";
import type { MessageType } from "@/types/message";
import type { Conversation } from "@/types/chat";

interface Props {
  currentConversation: Conversation | null;
  currentUserId: string;
}

interface Emits {
  (
    e: "send",
    data: {
      content: string;
      messageType: string;
      receiverId?: string;
      groupId?: string;
    },
  ): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { sending, sendPrivateMessage, sendGroupMessage } = useMessage();

const { uploading, uploadProgress, uploadFile, validateFile } = useFileUpload();

// 响应式数据
const inputMessage = ref("");
const showFileMenu = ref(false);
const imageInput = ref<HTMLInputElement>();
const fileInput = ref<HTMLInputElement>();
const videoInput = ref<HTMLInputElement>();

// 计算属性
const canSend = computed(() => {
  return (
    inputMessage.value.trim() && props.currentConversation && !sending.value
  );
});

// 方法
const handleInput = () => {
  // 可以在这里添加输入监听逻辑，比如显示正在输入状态
};

const handleSend = async (event?: KeyboardEvent) => {
  if (event) {
    event.preventDefault();
  }

  if (!canSend.value) return;

  const content = inputMessage.value.trim();
  const conversation = props.currentConversation!;

  // 先清空输入框，提升用户体验
  const originalContent = content;
  inputMessage.value = "";

  try {
    if (conversation.type === "private") {
      await sendPrivateMessage({
        receiverId: conversation.targetId,
        content: originalContent,
        messageType: MESSAGE_TYPES.TEXT,
      });
    } else if (conversation.type === "group") {
      await sendGroupMessage({
        groupId: conversation.targetId,
        content: originalContent,
        messageType: MESSAGE_TYPES.TEXT,
      });
    } else {
      throw new Error("不支持的会话类型");
    }

    // 消息发送成功后，触发事件通知父组件
    emit("send", {
      content: originalContent,
      messageType: MESSAGE_TYPES.TEXT,
      receiverId:
        conversation.type === "private" ? conversation.targetId : undefined,
      groupId:
        conversation.type === "group" ? conversation.targetId : undefined,
    });
  } catch (error: any) {
    // 发送失败时恢复输入框内容
    inputMessage.value = originalContent;
    ElMessage.error(error.message || "消息发送失败");
  }
};

const handleNewLine = (event: KeyboardEvent) => {
  // Shift+Enter 换行
  event.preventDefault();
  inputMessage.value += "\n";
};

const selectImage = () => {
  showFileMenu.value = false;
  imageInput.value?.click();
};

const selectFile = () => {
  showFileMenu.value = false;
  fileInput.value?.click();
};

const selectVideo = () => {
  showFileMenu.value = false;
  videoInput.value?.click();
};

const handleImageSelect = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files;
  if (!files?.length) return;

  await handleFileUpload(Array.from(files), MESSAGE_TYPES.IMAGE);
};

const handleFileSelect = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files;
  if (!files?.length) return;

  await handleFileUpload(Array.from(files), MESSAGE_TYPES.FILE);
};

const handleVideoSelect = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files;
  if (!files?.length) return;

  await handleFileUpload(Array.from(files), MESSAGE_TYPES.VIDEO);
};

const handleFileUpload = async (files: File[], messageType: MessageType) => {
  if (!props.currentConversation) {
    ElMessage.error("请先选择一个会话");
    return;
  }

  // 限制同时上传的文件数量
  if (files.length > 5) {
    ElMessage.error("一次最多只能上传5个文件");
    return;
  }

  const conversation = props.currentConversation;
  const uploadPromises = files.map(async (file) => {
    try {
      // 验证文件
      const validation = validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      // 上传文件
      const result = await uploadFile(file);

      // 发送文件消息
      if (conversation.type === "private") {
        await sendPrivateMessage({
          receiverId: conversation.targetId,
          mediaUrl: result.url,
          messageType,
        });
      } else if (conversation.type === "group") {
        await sendGroupMessage({
          groupId: conversation.targetId,
          mediaUrl: result.url,
          messageType,
        });
      } else {
        throw new Error("不支持的会话类型");
      }

      // 触发事件通知父组件
      emit("send", {
        content: result.url,
        messageType,
        receiverId:
          conversation.type === "private" ? conversation.targetId : undefined,
        groupId:
          conversation.type === "group" ? conversation.targetId : undefined,
      });

      return { success: true, fileName: file.name };
    } catch (error: any) {
      console.error("文件上传失败:", error);
      return { success: false, fileName: file.name, error: error.message };
    }
  });

  // 等待所有上传完成
  const results = await Promise.all(uploadPromises);

  // 统计结果
  const successCount = results.filter((r) => r.success).length;
  const failedFiles = results.filter((r) => !r.success);

  if (successCount > 0) {
    ElMessage.success(`成功发送 ${successCount} 个文件`);
  }

  if (failedFiles.length > 0) {
    const failedNames = failedFiles.map((f) => f.fileName).join(", ");
    ElMessage.error(`发送失败: ${failedNames}`);
  }
};

const toggleVoiceInput = () => {
  // 语音输入逻辑
  ElMessage.info("语音输入功能开发中");
};

// 点击外部关闭文件菜单
const handleClickOutside = () => {
  showFileMenu.value = false;
};

// 组件卸载时清理事件监听
onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

// 监听点击事件
onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});
</script>

<style lang="scss" scoped>
.chat-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 16px;
  background-color: #fff;
  border-top: 1px solid #e4e7ed;
  position: relative;
}

.input-toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
}

.file-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  background-color: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;

  .file-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: #f5f7fa;
    }

    &:first-child {
      border-radius: 8px 8px 0 0;
    }

    &:last-child {
      border-radius: 0 0 8px 8px;
    }

    span {
      font-size: 14px;
      color: #606266;
    }
  }
}

.input-area {
  flex: 1;
  position: relative;

  :deep(.el-textarea__inner) {
    border-radius: 8px;
    resize: none;
  }
}

.upload-progress {
  position: absolute;
  top: -30px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: #f5f7fa;
  border-radius: 4px;

  .upload-text {
    font-size: 12px;
    color: #909399;
  }
}

.send-area {
  display: flex;
  align-items: flex-end;
}
</style>
