<template>
  <div class="moments-post-card">
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
        <div v-else class="media-grid nine-grid" :class="gridClass">
          <div
            v-for="(media, index) in post.media"
            :key="media.id"
            class="media-item grid-photo"
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
  return `grid-count-${Math.min(count, 9)}`
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
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(255, 255, 255, 0.68);
  box-shadow: 0 8px 22px rgba(31, 41, 55, 0.055);
  backdrop-filter: blur(16px) saturate(1.25);
  -webkit-backdrop-filter: blur(16px) saturate(1.25);
}

.post-avatar {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  border: 2px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 8px 20px rgba(22, 47, 37, 0.11);
  object-fit: cover;
  background: var(--surface-sunken);
  cursor: pointer;
  flex-shrink: 0;
}

.post-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.post-nickname {
  font-size: 16px;
  font-weight: 760;
  color: var(--fresh-text);
  line-height: 1.3;
}

.post-content {
  font-size: 15.5px;
  line-height: 1.68;
  color: rgba(24, 37, 31, 0.86);
  max-width: var(--web-readable-max);
  margin-top: 6px;
  word-break: break-word;
  white-space: pre-wrap;

  &.is-truncated {
    display: -webkit-box;
    -webkit-line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.post-expand {
  color: rgba(24, 37, 31, 0.5);
  font-size: 14px;
  cursor: pointer;
  margin-top: 2px;

  &:hover {
    color: var(--fresh-green);
  }
}

// ── 九宫格图片区域 ──
.post-media,
.media-grid.nine-grid {
  display: grid;
  gap: 8px;
  width: min(100%, 720px);
  margin: 10px 0 12px;
}

// 1 张图片
.media-grid.grid-count-1 {
  grid-template-columns: repeat(1, minmax(0, 240px));
}

// 2 张图片
.media-grid.grid-count-2 {
  grid-template-columns: repeat(2, minmax(0, 220px));
}

// 3 张图片
.media-grid.grid-count-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-width: 720px;
}

// 4 张图片
.media-grid.grid-count-4 {
  grid-template-columns: repeat(2, minmax(0, 220px));
}

// 5-9 张图片
.media-grid.grid-count-5,
.media-grid.grid-count-6,
.media-grid.grid-count-7,
.media-grid.grid-count-8,
.media-grid.grid-count-9 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-width: 720px;
}

.media-item,
.grid-photo {
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(236, 245, 241, 0.9);
  cursor: pointer;
}

.media-image,
.grid-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.media-item:hover img,
.grid-photo:hover img {
  transform: scale(1.025);
  filter: brightness(0.96);
  transition: transform 0.2s ease, filter 0.2s ease;
}

.media-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--fresh-text-muted);
}

.media-video {
  margin: 10px 0 12px;
  max-width: 720px;

  .video-player {
    width: 100%;
    max-height: 480px;
    border-radius: 14px;
    background: #000;
  }
}

// ── 链接卡片 ──
.post-link {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(239, 248, 244, 0.78);
  border: 1px solid rgba(7, 193, 96, 0.06);
  cursor: pointer;
  max-width: 520px;

  .link-cover {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .link-cover-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .link-info {
    flex: 1;
    min-width: 0;
  }

  .link-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--fresh-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-url {
    font-size: 12px;
    color: var(--fresh-text-muted);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-arrow {
    flex-shrink: 0;
    color: var(--fresh-text-muted);
    font-size: 18px;
  }
}

// ── 位置 ──
.post-location {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--fresh-text-muted);
}

// ── 时间与操作按钮 ──
.post-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  gap: 12px;
}

.post-time {
  font-size: 13px;
  color: rgba(24, 37, 31, 0.45);
  flex-shrink: 0;
}

.post-actions {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.action-btn {
  min-width: 40px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(24, 37, 31, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.65);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: rgba(24, 37, 31, 0.68);
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  .el-icon {
    font-size: 18px;
  }

  &:hover {
    background: rgba(7, 193, 96, 0.08);
    color: var(--fresh-green);
  }

  &.is-liked {
    color: var(--fresh-green);
    background: rgba(7, 193, 96, 0.09);
    border-color: rgba(7, 193, 96, 0.15);
  }
}

.action-count {
  font-size: 14px;
  font-weight: 650;
}

// ── 社交区（点赞栏 + 评论区） ──
.post-social {
  grid-column: 1 / -1;
  margin-top: 4px;
  padding: 11px 12px;
  border-radius: 14px;
  background: rgba(239, 248, 244, 0.78);
  border: 1px solid rgba(7, 193, 96, 0.06);
  font-size: 14px;
  color: rgba(24, 37, 31, 0.78);
}

// ── 移动端：恢复微信风格 ──
@media (max-width: 768px) {
  .moments-post-card {
    display: block;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .post-avatar {
    width: 42px;
    height: 42px;
    border-radius: 6px;
    border: none;
    box-shadow: none;
    float: left;
    margin-right: 10px;
  }

  .post-main {
    padding: 0 12px 16px;
    margin-bottom: 16px;
    border-bottom: 1px solid #f0f0f0;
  }

  .post-nickname {
    font-size: 15px;
    font-weight: 700;
    color: #576b95;
  }

  .post-content {
    font-size: 15px;
    line-height: 1.5;
    color: #1a1a1a;
    max-width: none;
  }

  .post-media,
  .media-grid.nine-grid {
    gap: 4px;
    width: 100%;
    margin: 8px 0;
  }

  .media-grid.grid-count-1 {
    grid-template-columns: repeat(1, minmax(0, 280px));
  }

  .media-grid.grid-count-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .media-grid.grid-count-3,
  .media-grid.grid-count-4,
  .media-grid.grid-count-5,
  .media-grid.grid-count-6,
  .media-grid.grid-count-7,
  .media-grid.grid-count-8,
  .media-grid.grid-count-9 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-width: 100%;
  }

  .media-item,
  .grid-photo {
    border-radius: 4px;
  }

  .media-item:hover img,
  .grid-photo:hover img {
    transform: none;
    filter: none;
  }

  .post-meta {
    margin-top: 6px;
  }

  .post-time {
    font-size: 12px;
    color: #b0b0b0;
  }

  .action-btn {
    min-width: 32px;
    height: 30px;
    padding: 0 8px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 13px;
    color: #8c8c8c;

    .el-icon {
      font-size: 16px;
    }

    &.is-liked {
      color: var(--fresh-green);
      background: transparent;
    }
  }

  .action-count {
    font-size: 12px;
  }

  .post-social {
    margin: -12px 0 20px 52px;
    padding: 8px 10px;
    background: #f7f7f7;
    border: none;
    border-radius: 4px;
    font-size: 13px;
  }

  .post-link {
    max-width: 100%;
  }
}
</style>
