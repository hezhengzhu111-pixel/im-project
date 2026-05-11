<template>
  <div class="moments-user-profile">
    <!-- Profile header -->
    <div class="profile-header">
      <el-avatar
        :size="64"
        :src="userAvatar"
        class="profile-avatar"
      >
        {{ avatarText }}
      </el-avatar>

      <div class="profile-info">
        <div class="profile-nickname">{{ userNickname || '未知用户' }}</div>
        <div v-if="isSelf" class="profile-badge">我自己</div>
        <div v-else-if="isFriend" class="profile-badge profile-badge--friend">好友</div>
      </div>

      <el-button
        v-if="!isSelf && !isFriend"
        type="primary"
        size="small"
        @click="handleAddFriend"
      >
        添加好友
      </el-button>
    </div>

    <!-- Post list -->
    <div class="profile-posts" ref="postsRef" @scroll="handleScroll">
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
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useContactStore } from '@/stores/contact'
import { momentsService } from '@/services/moments'
import { getAvatarText } from '@/utils/common'
import MomentsPostCard from './MomentsPostCard.vue'
import type { PostWithDetails } from '@/types/moments'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const contactStore = useContactStore()

const posts = ref<PostWithDetails[]>([])
const loading = ref(false)
const hasMore = ref(true)
const postsRef = ref<HTMLElement>()

const userId = computed(() => route.params.userId as string)

const isSelf = computed(() => {
  return userStore.currentUser?.id === userId.value
})

// Extract user info from first post
const firstPost = computed(() => posts.value[0])
const userNickname = computed(() => firstPost.value?.userNickname || '')
const userAvatar = computed(() => firstPost.value?.userAvatar || '')

const avatarText = computed(() => {
  return getAvatarText(userNickname.value || '未知用户')
})

const isFriend = computed(() => {
  return contactStore.friends.some((f) => f.friendId === userId.value)
})

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

function handleScroll() {
  if (!postsRef.value) return

  const { scrollTop, scrollHeight, clientHeight } = postsRef.value
  if (scrollHeight - scrollTop - clientHeight < 100) {
    loadPosts()
  }
}

function handleAddFriend() {
  router.push({
    name: 'Contacts',
    query: { addUserId: userId.value },
  })
}

// Load data on mount
onMounted(async () => {
  // Load friend list to check status
  contactStore.loadFriends()
  // Load user posts
  await loadPosts(true)
})

// Reload when userId changes
watch(userId, () => {
  posts.value = []
  hasMore.value = true
  loadPosts(true)
})
</script>

<style scoped lang="scss">
.moments-user-profile {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}

.profile-avatar {
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-nickname {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
}

.profile-badge {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);

  &--friend {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
}

.profile-posts {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
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
