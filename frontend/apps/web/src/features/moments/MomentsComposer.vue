<template>
  <div class="moments-composer">
    <!-- Content textarea -->
    <el-input
      v-model="content"
      type="textarea"
      :rows="4"
      :maxlength="1000"
      show-word-limit
      placeholder="分享新鲜事..."
      class="composer-textarea"
    />

    <!-- Media preview area -->
    <div v-if="fileList.length > 0" class="composer-media-preview">
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
    </div>

    <!-- Upload area -->
    <el-upload
      v-if="fileList.length < 9"
      :auto-upload="false"
      :show-file-list="false"
      accept="image/*,video/*"
      multiple
      :on-change="handleFileChange"
      class="composer-upload"
    >
      <div class="upload-trigger">
        <el-icon><Plus /></el-icon>
        <span>添加图片/视频</span>
      </div>
    </el-upload>

    <!-- Visibility picker -->
    <div class="composer-section">
      <label class="section-label">谁可以看</label>
      <MomentsVisibilityPicker v-model="visibility" />
    </div>

    <!-- Location input -->
    <div class="composer-section">
      <label class="section-label">
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

    <!-- Publish button -->
    <el-button
      type="primary"
      :loading="loading"
      :disabled="!canPublish"
      class="publish-btn"
      @click="handlePublish"
    >
      发布
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Close, Location } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { useMomentsComposer } from './composables/useMomentsComposer'
import MomentsVisibilityPicker from './dialogs/MomentsVisibilityPicker.vue'

const emit = defineEmits<{
  close: []
}>()

const { loading, publish } = useMomentsComposer()

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

// File handling
function handleFileChange(uploadFile: UploadFile) {
  if (!uploadFile.raw) return

  // Limit total files to 9
  if (fileList.value.length >= 9) {
    ElMessage.warning('最多上传9个文件')
    return
  }

  // Validate file type
  const file = uploadFile.raw
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')

  if (!isImage && !isVideo) {
    ElMessage.warning('只支持图片和视频文件')
    return
  }

  // Validate file size
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
      // Clean up object URLs
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
  gap: 16px;
  padding: 0 4px;
}

.composer-textarea {
  :deep(.el-textarea__inner) {
    border: none;
    padding: 0;
    resize: none;
    font-size: 15px;
    line-height: 1.6;
    box-shadow: none;

    &:focus {
      box-shadow: none;
    }
  }
}

.composer-media-preview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.media-preview-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
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

.composer-upload {
  :deep(.el-upload) {
    width: 100%;
  }
}

.upload-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .el-icon {
    font-size: 20px;
  }
}

.composer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);

  .el-icon {
    font-size: 16px;
  }
}

.location-input {
  :deep(.el-input__inner) {
    border-radius: 8px;
  }
}

.publish-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  border-radius: 8px;
  margin-top: 8px;
}

@media (max-width: 768px) {
  .composer-media-preview {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 6px;
  }

  .composer-textarea :deep(.el-textarea__inner) {
    font-size: 16px;
  }

  .publish-btn {
    width: 100%;
  }
}

@media (max-width: 390px) {
  .moments-composer {
    padding: 12px;
  }
}
</style>
