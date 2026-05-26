<template>
  <div class="moments-composer">
    <!-- 作者区域 -->
    <div class="composer-author">
      <el-avatar :src="userAvatar" :size="44" class="composer-avatar">
        {{ userNickname?.[0] || 'U' }}
      </el-avatar>
      <div class="composer-author-info">
        <span class="composer-author-name">{{ userNickname || '用户' }}</span>
        <span class="composer-visibility-hint">
          <el-icon><Lock v-if="visibility === 2" /><User v-else /></el-icon>
          {{ visibility === 2 ? '仅自己可见' : visibility === 1 ? '好友可见' : '公开' }}
        </span>
      </div>
    </div>

    <!-- 文本输入区 -->
    <div class="composer-input-area">
      <el-input
        v-model="content"
        type="textarea"
        :rows="4"
        :maxlength="1000"
        show-word-limit
        placeholder="分享新鲜事..."
        class="composer-textarea"
      />
    </div>

    <!-- 上传区九宫格 -->
    <div class="composer-upload-section">
      <div class="composer-media-preview" :class="previewGridClass">
        <div
          v-for="(item, index) in fileList"
          :key="index"
          class="media-preview-item"
        >
          <el-image
            v-if="item.isImage"
            :src="item.url"
            fit="cover"
            class="preview-image"
          />
          <video
            v-else
            :src="item.url"
            class="preview-video"
          />
          <button
            class="media-remove-btn"
            @click="removeFile(index)"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <!-- 添加按钮占位格 -->
        <div
          v-if="fileList.length < 9"
          class="media-preview-item media-add-cell"
        >
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept="image/*,video/*"
            multiple
            :on-change="handleFileChange"
            class="composer-upload-inline"
          >
            <div class="upload-trigger-inline">
              <el-icon><Plus /></el-icon>
            </div>
          </el-upload>
        </div>
        <!-- 空九宫格占位（无文件时） -->
        <template v-if="fileList.length === 0">
          <span v-for="i in 9" :key="'placeholder-' + i" class="upload-placeholder-cell">
            <span class="placeholder-dot" />
          </span>
        </template>
      </div>
      <p class="upload-hint">添加图片/视频，最多 9 张</p>
    </div>

    <!-- 选项区 -->
    <div class="composer-options">
      <!-- 谁可以看 -->
      <div class="composer-option-row">
        <label class="option-label">谁可以看</label>
        <MomentsVisibilityPicker v-model="visibility" />
      </div>

      <!-- 所在位置 -->
      <div class="composer-option-row">
        <label class="option-label">
          <el-icon><Location /></el-icon>
          所在位置
        </label>
        <el-input
          v-model="location"
          placeholder="添加位置（选填）"
          clearable
          class="location-input"
        />
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="composer-footer">
      <div class="composer-tools">
        <button type="button" class="tool-btn" title="表情">
          <span class="tool-emoji">😊</span>
        </button>
        <button type="button" class="tool-btn" title="话题">
          <span class="tool-hash">#</span>
        </button>
        <button type="button" class="tool-btn" title="@提醒">
          <span class="tool-at">@</span>
        </button>
      </div>
      <div class="composer-actions">
        <button type="button" class="cancel-btn" @click="$emit('close')">
          取消
        </button>
        <button
          type="button"
          class="publish-btn"
          :disabled="!canPublish || loading"
          @click="handlePublish"
        >
          {{ loading ? '发布中...' : '发布' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Close, Location, Lock, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useMomentsComposer } from './composables/useMomentsComposer'
import MomentsVisibilityPicker from './dialogs/MomentsVisibilityPicker.vue'

const emit = defineEmits<{
  close: []
}>()

const { loading, publish } = useMomentsComposer()
const userStore = useUserStore()

const userAvatar = computed(() => userStore.avatar)
const userNickname = computed(() => userStore.nickname)

// Form state
const content = ref('')
const visibility = ref(0)
const location = ref('')

// File state
interface FileItem {
  file: File
  url: string
  isImage: boolean
}

const fileList = ref<FileItem[]>([])

// Computed
const canPublish = computed(() => {
  return content.value.trim().length > 0 || fileList.value.length > 0
})

const previewGridClass = computed(() => {
  const count = fileList.value.length
  if (count === 0) return 'grid-empty'
  return `grid-count-${Math.min(count + 1, 9)}`
})

// File handling
function handleFileChange(uploadFile: UploadFile) {
  if (!uploadFile.raw) return

  if (fileList.value.length >= 9) {
    ElMessage.warning('最多上传9个文件')
    return
  }

  const file = uploadFile.raw
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')

  if (!isImage && !isVideo) {
    ElMessage.warning('只支持图片和视频文件')
    return
  }

  if (isImage && file.size > 20 * 1024 * 1024) {
    ElMessage.warning('图片不能超过20MB')
    return
  }
  if (isVideo && file.size > 100 * 1024 * 1024) {
    ElMessage.warning('视频不能超过100MB')
    return
  }

  const url = URL.createObjectURL(file)
  fileList.value.push({ file, url, isImage })
}

function removeFile(index: number) {
  const item = fileList.value[index]
  if (item.url) {
    URL.revokeObjectURL(item.url)
  }
  fileList.value.splice(index, 1)
}

// Publish
async function handlePublish() {
  if (!canPublish.value) return

  try {
    const data = {
      content: content.value.trim() || undefined,
      visibility: visibility.value as 0 | 1 | 2,
      location: location.value.trim() || undefined,
    }

    const files = fileList.value.map((item) => item.file)
    const success = await publish(data, files.length > 0 ? files : undefined)

    if (success) {
      ElMessage.success('发布成功')
      fileList.value.forEach((item) => URL.revokeObjectURL(item.url))
      fileList.value = []
      content.value = ''
      location.value = ''
      visibility.value = 0
      emit('close')
    }
  } catch {
    // Error handled by composable
  }
}
</script>

<style scoped lang="scss">
.moments-composer {
  display: flex;
  flex-direction: column;
  gap: 0;
}

// ── 作者区域 ──
.composer-author {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(24, 37, 31, 0.06);
  margin-bottom: 14px;
}

.composer-avatar {
  border-radius: 14px;
  border: 2px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 4px 12px rgba(22, 47, 37, 0.08);
  flex-shrink: 0;
}

.composer-author-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.composer-author-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--fresh-text);
}

.composer-visibility-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--fresh-text-muted);

  .el-icon {
    font-size: 14px;
  }
}

// ── 文本输入区 ──
.composer-input-area {
  margin-bottom: 14px;
}

.composer-textarea {
  :deep(.el-textarea__inner) {
    min-height: 132px;
    border: none;
    border-radius: 16px;
    background: rgba(244, 250, 247, 0.85);
    padding: 14px 16px;
    resize: none;
    font-size: 15px;
    line-height: 1.6;
    box-shadow: none;
    color: var(--fresh-text);

    &::placeholder {
      color: rgba(24, 37, 31, 0.32);
    }

    &:focus {
      box-shadow: 0 0 0 2px rgba(7, 193, 96, 0.12);
      background: rgba(255, 255, 255, 0.85);
    }
  }

  :deep(.el-textarea__count) {
    right: 12px;
    bottom: 8px;
    color: var(--fresh-text-muted);
    font-size: 12px;
  }
}

// ── 上传区九宫格 ──
.composer-upload-section {
  margin-bottom: 14px;
}

.composer-media-preview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  &.grid-empty {
    grid-template-columns: repeat(9, 32px);
    gap: 5px;
  }
}

.media-preview-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(236, 245, 241, 0.9);
  border: 1px solid rgba(24, 37, 31, 0.06);
}

.preview-image {
  width: 100%;
  height: 100%;
}

.preview-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
}

// 添加按钮格
.media-add-cell {
  background: rgba(244, 250, 247, 0.85);
  border: 1px dashed rgba(24, 37, 31, 0.1);
}

.composer-upload-inline {
  width: 100%;
  height: 100%;

  :deep(.el-upload) {
    width: 100%;
    height: 100%;
  }
}

.upload-trigger-inline {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fresh-text-muted);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: var(--fresh-green);
    background: rgba(7, 193, 96, 0.06);
  }
}

// 空占位九宫格
.upload-placeholder-cell {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(24, 37, 31, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(24, 37, 31, 0.12);
}

.upload-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--fresh-text-muted);
}

// ── 选项区 ──
.composer-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

.composer-option-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.option-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--fresh-text);
  white-space: nowrap;
  min-width: 72px;

  .el-icon {
    font-size: 16px;
    color: var(--fresh-text-muted);
  }
}

.location-input {
  flex: 1;

  :deep(.el-input__inner) {
    border-radius: 10px;
    height: 36px;
  }
}

// ── 底部操作区 ──
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid rgba(24, 37, 31, 0.06);
}

.composer-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  color: var(--fresh-text-muted);
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(7, 193, 96, 0.08);
    color: var(--fresh-green);
  }
}

.tool-emoji {
  font-size: 18px;
  line-height: 1;
}

.tool-hash {
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
}

.tool-at {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cancel-btn {
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid rgba(24, 37, 31, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.65);
  color: var(--fresh-text-muted);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(24, 37, 31, 0.05);
    color: var(--fresh-text);
  }
}

.publish-btn {
  min-height: 36px;
  padding: 0 20px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--fresh-green), var(--fresh-mint));
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.15s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(7, 193, 96, 0.22);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// ── 移动端适配 ──
@media (max-width: 768px) {
  .composer-author {
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .composer-textarea :deep(.el-textarea__inner) {
    min-height: 100px;
    font-size: 16px;
  }

  .composer-media-preview {
    gap: 6px;

    &.grid-empty {
      grid-template-columns: repeat(9, 28px);
      gap: 4px;
    }
  }

  .upload-placeholder-cell {
    width: 28px;
    height: 28px;
  }

  .composer-footer {
    padding-top: 10px;
  }

  .publish-btn {
    padding: 0 24px;
  }
}

@media (max-width: 390px) {
  .moments-composer {
    padding: 0;
  }
}
</style>
