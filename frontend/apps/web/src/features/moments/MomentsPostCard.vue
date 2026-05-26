<template>
  <div class="moments-post-card">
    <div class="post-layout">
      <img
        class="post-avatar"
        :src="post.userAvatar"
        :alt="avatarText"
        @click="handleAvatarClick"
      />
      <div class="post-main">
        <!-- Nickname -->
        <div class="post-nickname">
          {{ post.userNickname || '未知用户' }}
        </div>

        <!-- Content: text -->
        <div v-if="post.post.content" class="post-content" :class="{ 'is-truncated': !isExpanded && shouldTruncate }">
          {{ post.post.content }}
        </div>
        <div
          v-if="shouldTruncate && !isExpanded"
          class="post-expand"
          @click="handleExpand"
        >
          全文
        </div>

        <!-- Media: image grid or video -->
        <div v-if="post.media.length > 0" class="post-media">
          <div v-if="isSingleVideo" class="media-video">
            <video :src="post.media[0].url" controls class="video-player" />
          </div>
          <div v-else class="media-grid" :class="gridClass">
            <div
              v-for="(media, index) in post.media"
              :key="media.id"
              class="media-item"
              @click="openImageViewer(index)"
            >
              <el-image :src="media.url" fit="cover" class="media-image" lazy>
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
        <div v-if="post.post.linkUrl" class="post-link" @click="openLink">
          <div v-if="post.post.linkCover" class="link-cover">
            <el-image :src="post.post.linkCover" fit="cover" class="link-cover-image" />
          </div>
          <div class="link-info">
            <div class="link-title">{{ post.post.linkTitle || post.post.linkUrl }}</div>
            <div class="link-url">{{ post.post.linkUrl }}</div>
          </div>
          <el-icon class="link-arrow"><ArrowRight /></el-icon>
        </div>

        <!-- Location -->
        <div v-if="post.post.location" class="post-location">
          <el-icon><Location /></el-icon>
          <span>{{ post.post.location }}</span>
        </div>

        <!-- Time + Actions row -->
        <div class="post-meta">
          <span class="post-time">{{ formattedTime }}</span>
          <div class="post-actions">
            <button
              class="action-btn"
              :class="{ 'is-liked': post.isLiked }"
              @click="handleToggleLike"
            >
              <el-icon><StarFilled v-if="post.isLiked" /><Star v-else /></el-icon>
              <span v-if="post.likeCount > 0" class="action-count">{{ post.likeCount }}</span>
            </button>
            <button class="action-btn" @click="handleToggleComments">
              <el-icon><ChatDotRound /></el-icon>
              <span v-if="post.commentCount > 0" class="action-count">{{ post.commentCount }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Like bar + Comments (social area) -->
    <div v-if="post.likeCount > 0 || showComments" class="post-social">
      <MomentsLikeBar
        v-if="post.likeCount > 0"
        :post-id="post.post.id"
      />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Star,
  StarFilled,
  ChatDotRound,
  Location,
  ArrowRight,
} from '@element-plus/icons-vue'
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

const shouldTruncate = computed(() => {
  const content = props.post.post.content
  if (!content) return false
  return content.length > 200
})
const isExpanded = ref(false)

function handleExpand() {
  isExpanded.value = true
}

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

function handleAvatarClick() {
  // Navigate to user profile (placeholder for future routing)
}

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
</script>

<style scoped lang="scss">
.moments-post-card {
  background: var(--moments-bg);
}

.post-layout {
  display: flex;
  gap: 12px;
  padding: 0 20px;
}

.post-avatar {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  flex-shrink: 0;
  object-fit: cover;
  cursor: pointer;
  border: 2px solid #FFFFFF;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.post-main {
  flex: 1;
  min-width: 0;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid #F0F0F0;
}

// --- Nickname ---
.post-nickname {
  font-size: 15px;
  font-weight: 600;
  color: #576B95;
  line-height: 1.4;
  margin-bottom: 4px;
  cursor: pointer;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  &:hover {
    opacity: 0.7;
  }
}

// --- Content ---
.post-content {
  font-size: 15px;
  line-height: 1.6;
  color: #111111;
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-break: break-word;

  &.is-truncated {
    display: -webkit-box;
    -webkit-line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.post-expand {
  color: #576B95;
  font-size: 15px;
  cursor: pointer;
  margin-bottom: 8px;
  display: inline-block;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  &:hover {
    opacity: 0.7;
  }
}

// --- Media ---
.post-media {
  margin-bottom: 8px;
}

.media-video {
  border-radius: 4px;
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
  border-radius: 4px;
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
  transition: filter 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  &:hover {
    filter: brightness(0.95);
  }
}

.media-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-sunken);
  color: var(--text-tertiary);
  font-size: 13px;
}

// --- Link ---
.post-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface-secondary);
  border-radius: 4px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  &:hover {
    background: var(--surface-sunken);
  }
}

.link-cover {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 4px;
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
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-url {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-arrow {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

// --- Location ---
.post-location {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  .el-icon {
    font-size: 14px;
  }
}

// --- Time + Actions ---
.post-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.post-time {
  font-size: 12px;
  color: #B0B0B0;
}

.post-actions {
  display: flex;
  gap: 20px;

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: #B0B0B0;
    font-size: 14px;
    border: none;
    background: none;
    cursor: pointer;
    padding: 4px 0;
    transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    &:hover {
      opacity: 0.7;
    }
    &.is-liked {
      color: #576B95;
    }
  }
  .action-count {
    font-size: 13px;
  }
}

// --- Social area (like bar + comments) ---
.post-social {
  margin-top: -12px;
  margin-bottom: 20px;
  margin-left: 52px;
  background: #F7F7F7;
  border-radius: 4px;
  padding: 6px 10px;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 12px;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid #F7F7F7;
  }
}

// --- Mobile ---
@media (max-width: 768px) {
  .post-layout {
    padding: 0 12px;
  }
  .post-avatar {
    width: 36px;
    height: 36px;
    border-width: 1.5px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }
  .post-main {
    padding-bottom: 16px;
    margin-bottom: 16px;
  }
  .post-nickname {
    font-size: 14px;
  }
  .post-content {
    font-size: 15px;
  }
  .post-social {
    margin-left: 48px;
  }
  .media-grid.grid-2,
  .media-grid.grid-3 {
    max-width: 280px;
  }
  .media-grid.grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
