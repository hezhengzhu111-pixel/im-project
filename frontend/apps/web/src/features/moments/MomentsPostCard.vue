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
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 8px 24px rgba(31, 41, 55, 0.06);
  backdrop-filter: blur(16px) saturate(1.25);
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 32px rgba(31, 41, 55, 0.08);
  }
}

.post-layout {
  padding: 0;
}

.post-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
}

.post-main {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
  max-width: var(--web-readable-max);
}

.post-nickname {
  color: var(--fresh-text);
  font-weight: 700;
}

.post-content {
  color: var(--fresh-text);
}

.media-grid {
  gap: 6px;
  border-radius: 14px;
}

.media-grid.grid-1 {
  max-width: 520px;
}

.media-item,
.media-image {
  border-radius: 12px;
}

.post-social {
  margin-top: 12px;
  margin-bottom: 0;
  margin-left: 56px;
  background: rgba(255, 255, 255, 0.58);
  border-radius: 14px;

  &::before {
    border-bottom-color: rgba(255, 255, 255, 0.58);
  }
}

// --- Mobile: restore WeChat style at <=768px ---
@media (max-width: 768px) {
  .moments-post-card {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    box-shadow: none;
    backdrop-filter: none;

    &:hover {
      transform: none;
      box-shadow: none;
    }
  }

  .post-layout {
    padding: 0 12px;
  }

  .post-avatar {
    width: 36px;
    height: 36px;
    border-radius: 4px;
  }

  .post-main {
    padding-bottom: 16px;
    margin-bottom: 16px;
    border-bottom: 1px solid #F0F0F0;
  }

  .post-social {
    margin-left: 48px;
    margin-top: -12px;
    margin-bottom: 20px;
    background: #F7F7F7;
    border-radius: 4px;

    &::before {
      border-bottom-color: #F7F7F7;
    }
  }
}
</style>
