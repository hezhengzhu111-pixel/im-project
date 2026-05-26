<template>
  <div class="moments-user-profile">
    <!-- 顶栏：sticky, 返回箭头 + 昵称 -->
    <div ref="topbarRef" class="profile-topbar">
      <el-icon class="topbar-back" @click="handleBack">
        <ArrowLeft />
      </el-icon>
      <span class="topbar-nickname">{{ userNickname || '用户详情' }}</span>
    </div>

    <!-- 统一滚动区 -->
    <div ref="scrollRef" class="profile-scroll" @scroll="handleScroll">
      <MomentsCover
        :cover-photo="coverPhoto"
        :avatar="userAvatar"
        :nickname="userNickname"
      >
        <template #actions>
          <el-button
            v-if="!isSelf && !isFriend"
            type="primary"
            size="small"
            class="add-friend-btn"
            @click="handleAddFriend"
          >
            添加好友
          </el-button>
        </template>
      </MomentsCover>

      <!-- Post list -->
      <div class="profile-posts">
        <div v-if="loading && posts.length === 0" class="posts-loading">
          <el-skeleton :rows="5" animated />
        </div>

        <div v-else-if="!loading && posts.length === 0" class="posts-empty">
          <el-empty description="暂无动态" />
        </div>

        <template v-else>
          <MomentsPostCard
            v-for="item in posts"
            :key="item.post.id"
            :post="item"
          />

          <div v-if="loading" class="posts-loading-more">
            <el-icon class="is-loading"><Loading /></el-icon>
            加载中...
          </div>

          <div v-else-if="!hasMore" class="posts-no-more">
            没有更多了
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Loading } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useContactStore } from '@/stores/contact'
import { momentsService } from '@/services/moments'
import MomentsCover from './MomentsCover.vue'
import MomentsPostCard from './MomentsPostCard.vue'
import type { PostWithDetails } from '@/types/moments'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const contactStore = useContactStore()

const posts = ref<PostWithDetails[]>([])
const loading = ref(false)
const hasMore = ref(true)
const scrollRef = ref<HTMLElement>()
const topbarRef = ref<HTMLElement>()

const userId = computed(() => route.params.userId as string)

const isSelf = computed(() => userStore.currentUser?.id === userId.value)

const firstPost = computed(() => posts.value[0])
const userNickname = computed(() => firstPost.value?.userNickname || '')
const userAvatar = computed(() => firstPost.value?.userAvatar || '')

const coverPhoto = computed(() => {
  return (firstPost.value as any)?.coverPhoto ?? ''
})

const isFriend = computed(() => {
  return contactStore.friends.some((f) => f.friendId === userId.value)
})

let threshold = 232
let ticking = false

function computeThreshold() {
  const coverHeight = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--moments-cover-height').trim()
  ) || 280
  threshold = coverHeight - 48
}

function updateTopbar(scrollTop: number) {
  if (!topbarRef.value) return
  const progress = Math.min(scrollTop / threshold, 1)
  topbarRef.value.style.setProperty('--topbar-bg-opacity', String(progress * 0.95))
  topbarRef.value.style.setProperty('--topbar-border-opacity', String(progress))
  topbarRef.value.style.setProperty('--topbar-blur', `${progress * 10}px`)
  if (progress > 0.5) {
    topbarRef.value.classList.add('is-solid')
  } else {
    topbarRef.value.classList.remove('is-solid')
  }
}

function handleScroll() {
  if (!ticking) {
    requestAnimationFrame(() => {
      if (scrollRef.value) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.value
        updateTopbar(scrollTop)
        if (scrollHeight - scrollTop - clientHeight < 100) {
          loadPosts()
        }
      }
      ticking = false
    })
    ticking = true
  }
}

async function loadPosts(refresh = false) {
  if (loading.value) return
  if (!refresh && !hasMore.value) return

  loading.value = true
  try {
    const cursor = refresh
      ? undefined
      : posts.value[posts.value.length - 1]?.post.id
    const newPosts = await momentsService.getUserPosts(userId.value, {
      cursor,
      limit: 20,
    })

    if (refresh) {
      posts.value = newPosts
    } else {
      posts.value.push(...newPosts)
    }

    hasMore.value = newPosts.length === 20
  } catch {
    // Error handled silently
  } finally {
    loading.value = false
  }
}

function handleBack() {
  router.back()
}

function handleAddFriend() {
  router.push({
    name: 'Contacts',
    query: { addUserId: userId.value },
  })
}

onMounted(() => {
  computeThreshold()
  window.addEventListener('resize', computeThreshold)
  contactStore.loadFriends()
  loadPosts(true)
})

onUnmounted(() => {
  window.removeEventListener('resize', computeThreshold)
})

watch(userId, () => {
  posts.value = []
  hasMore.value = true
  if (scrollRef.value) {
    scrollRef.value.scrollTop = 0
  }
  loadPosts(true)
})
</script>

<style scoped lang="scss">
.moments-user-profile {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--moments-bg);
}

.profile-topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky, 200);
  height: var(--moments-topbar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background: rgba(255, 255, 255, var(--topbar-bg-opacity, 0));
  border-bottom: 1px solid rgba(236, 236, 236, var(--topbar-border-opacity, 0));
  backdrop-filter: blur(var(--topbar-blur, 0px));
  -webkit-backdrop-filter: blur(var(--topbar-blur, 0px));
  transition: background 0.15s ease, border-color 0.15s ease;
}

.topbar-back {
  position: absolute;
  left: 16px;
  font-size: 22px;
  color: var(--text-inverse);
  cursor: pointer;
  padding: 4px;
  transition: color 0.15s ease;
}

.topbar-nickname {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-inverse);
  opacity: 0;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
  transition: opacity 0.15s ease, color 0.15s ease, text-shadow 0.15s ease;
}

.profile-topbar.is-solid {
  .topbar-back {
    color: var(--text-primary);
  }
  .topbar-nickname {
    color: var(--text-primary);
    opacity: 1;
    text-shadow: none;
  }
}

.profile-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.add-friend-btn {
  flex-shrink: 0;
}

.profile-posts {
  padding: 0 20px;
  background: var(--moments-bg);
}

.posts-loading,
.posts-empty {
  padding: 40px 0;
}

.posts-loading-more,
.posts-no-more {
  text-align: center;
  padding: 20px 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
