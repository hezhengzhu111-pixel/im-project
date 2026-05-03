<template>
  <div class="moments-post-card">
    <!-- Header: avatar + nickname + time + more menu -->
    <div class="post-header">
      <el-avatar
        :size="40"
        :src="post.userAvatar"
        class="post-avatar"
      >
        {{ avatarText }}
      </el-avatar>

      <div class="post-user-info">
        <div class="post-nickname">{{ post.userNickname || '未知用户' }}</div>
        <div class="post-time">{{ formattedTime }}</div>
      </div>

      <el-dropdown
        v-if="isOwner"
        trigger="click"
        @command="handleMoreAction"
      >
        <el-icon class="post-more-btn"><MoreFilled /></el-icon>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="delete">
              <el-icon><Delete /></el-icon>
              删除
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- Content: text -->
    <div v-if="post.post.content" class="post-content">
      {{ post.post.content }}
    </div>

    <!-- Media: image grid or video -->
    <div v-if="post.media.length > 0" class="post-media">
      <!-- Single video -->
      <div
        v-if="isSingleVideo"
        class="media-video"
      >
        <video
          :src="post.media[0].url"
          controls
          class="video-player"
        />
      </div>

      <!-- Image grid -->
      <div
        v-else
        class="media-grid"
        :class="gridClass"
      >
        <div
          v-for="(media, index) in post.media"
          :key="media.id"
          class="media-item"
          @click="openImageViewer(index)"
        >
          <el-image
            :src="media.url"
            fit="cover"
            class="media-image"
            lazy
          >
            <template #placeholder>
              <div class="media-placeholder">加载中...</div>
            </template>
            <template #error>
              <div class="media-placeholder">加载失败</div>
            </template>
          </el-image>
        </div>
      </div>
    </div>

    <!-- Link: card preview -->
    <div
      v-if="post.post.linkUrl"
      class="post-link"
      @click="openLink"
    >
      <div v-if="post.post.linkCover" class="link-cover">
        <el-image
          :src="post.post.linkCover"
          fit="cover"
          class="link-cover-image"
        />
      </div>
      <div class="link-info">
        <div class="link-title">{{ post.post.linkTitle || post.post.linkUrl }}</div>
        <div class="link-url">{{ post.post.linkUrl }}</div>
      </div>
      <el-icon class="link-arrow"><ArrowRight /></el-icon>
    </div>

    <!-- Location: icon + text -->
    <div v-if="post.post.location" class="post-location">
      <el-icon><Location /></el-icon>
      <span>{{ post.post.location }}</span>
    </div>

    <!-- Actions: like button + comment button -->
    <div class="post-actions">
      <button
        class="action-btn"
        :class="{ 'is-liked': post.isLiked }"
        @click="handleToggleLike"
      >
        <el-icon>
          <StarFilled v-if="post.isLiked" />
          <Star v-else />
        </el-icon>
        <span v-if="post.likeCount > 0" class="action-count">{{ post.likeCount }}</span>
      </button>

      <button class="action-btn" @click="handleToggleComments">
        <el-icon><ChatDotRound /></el-icon>
        <span v-if="post.commentCount > 0" class="action-count">{{ post.commentCount }}</span>
      </button>
    </div>

    <!-- Like bar (will be implemented in Task 14) -->
    <MomentsLikeBar
      v-if="post.likeCount > 0"
      :post-id="post.post.id"
    />

    <!-- Comments section -->
    <MomentsComments
      v-if="showComments"
      :post-id="post.post.id"
    />
  </div>

  <!-- Image viewer dialog -->
  <MomentsImageViewer
    v-if="showImageViewer"
    v-model:visible="showImageViewer"
    :images="imageUrls"
    :initial-index="viewerInitialIndex"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  MoreFilled,
  Delete,
  Star,
  StarFilled,
  ChatDotRound,
  Location,
  ArrowRight,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useMomentsStore } from '@/stores/moments'
import { formatTime } from '@/utils/common'
import { getAvatarText } from '@/utils/common'
import MomentsLikeBar from './MomentsLikeBar.vue'
import MomentsComments from './MomentsComments.vue'
import MomentsImageViewer from './dialogs/MomentsImageViewer.vue'
import type { PostWithDetails } from '@/types/moments'

const props = defineProps<{
  post: PostWithDetails
}>()

const userStore = useUserStore()
const momentsStore = useMomentsStore()

const showComments = ref(false)
const showImageViewer = ref(false)
const viewerInitialIndex = ref(0)

// Computed
const isOwner = computed(() => {
  return userStore.currentUser?.id === props.post.post.userId
})

const avatarText = computed(() => {
  return getAvatarText(props.post.userNickname || '未知用户')
})

const formattedTime = computed(() => {
  return formatTime(props.post.post.createdAt)
})

const isSingleVideo = computed(() => {
  return props.post.media.length === 1 && props.post.media[0].type === 1
})

const imageUrls = computed(() => {
  return props.post.media
    .filter((m) => m.type === 0)
    .map((m) => m.url)
})

const gridClass = computed(() => {
  const count = props.post.media.filter((m) => m.type === 0).length
  return {
    'grid-1': count === 1,
    'grid-2': count === 2,
    'grid-3': count === 3,
    'grid-4': count === 4,
    'grid-6': count >= 5,
  }
})

// Methods
const handleToggleLike = async () => {
  try {
    await momentsStore.toggleLike(props.post.post.id)
  } catch {
    // Error handled by store
  }
}

const handleToggleComments = () => {
  showComments.value = !showComments.value
}

const openImageViewer = (index: number) => {
  viewerInitialIndex.value = index
  showImageViewer.value = true
}

const openLink = () => {
  if (props.post.post.linkUrl) {
    window.open(props.post.post.linkUrl, '_blank')
  }
}

const handleMoreAction = async (command: string) => {
  if (command === 'delete') {
    try {
      await ElMessageBox.confirm('确定要删除这条动态吗？', '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      momentsStore.removePost(props.post.post.id)
    } catch {
      // User cancelled
    }
  }
}
</script>

<style scoped lang="scss">
.moments-post-card {
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.post-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.post-avatar {
  flex-shrink: 0;
}

.post-user-info {
  flex: 1;
  min-width: 0;
}

.post-nickname {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
}

.post-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.post-more-btn {
  font-size: 18px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.post-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.post-media {
  margin-bottom: 12px;
}

.media-video {
  border-radius: 8px;
  overflow: hidden;
}

.video-player {
  display: block;
  width: 100%;
  max-height: 360px;
  background: #000;
}

.media-grid {
  display: grid;
  gap: 4px;
  border-radius: 8px;
  overflow: hidden;

  &.grid-1 {
    grid-template-columns: 1fr;
    max-width: 300px;
  }

  &.grid-2 {
    grid-template-columns: repeat(2, 1fr);
  }

  &.grid-3 {
    grid-template-columns: repeat(3, 1fr);
  }

  &.grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }

  &.grid-6 {
    grid-template-columns: repeat(3, 1fr);
  }
}

.media-item {
  aspect-ratio: 1;
  cursor: pointer;
  overflow: hidden;
}

.media-image {
  width: 100%;
  height: 100%;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.02);
  }
}

.media-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.post-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: var(--el-fill-color);
  }
}

.link-cover {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
}

.link-cover-image {
  width: 100%;
  height: 100%;
}

.link-info {
  flex: 1;
  min-width: 0;
}

.link-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-url {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-arrow {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.post-location {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;

  .el-icon {
    font-size: 14px;
  }
}

.post-actions {
  display: flex;
  align-items: center;
  gap: 24px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
  }

  &.is-liked {
    color: var(--el-color-primary);

    &:hover {
      background: var(--el-color-primary-light-9);
    }
  }

  .el-icon {
    font-size: 18px;
  }
}

.action-count {
  font-size: 13px;
  font-weight: 500;
}

@media (max-width: 768px) {
  .moments-post-card {
    padding: 12px;
  }

  .post-avatar {
    width: 36px;
    height: 36px;
  }

  .post-nickname {
    font-size: 14px;
  }

  .post-content {
    font-size: 14px;
  }

  .media-grid {
    gap: 4px;
  }

  .media-grid.grid-2,
  .media-grid.grid-3 {
    max-width: 280px;
  }

  .media-grid.grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }

  .action-btn {
    min-height: 44px;
    min-width: 44px;
  }
}
</style>
