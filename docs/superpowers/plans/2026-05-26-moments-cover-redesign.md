# 朋友圈封面与滚动布局重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将朋友圈主页重构为微信风格沉浸式封面 + 统一滚动布局

**Architecture:** 新建 MomentsCover.vue 作为纯表现层组件（Props: coverPhoto/avatar/nickname + #actions 插槽），将滚动控制权从 MomentsFeed/MomentsUserProfile 上浮到父容器，通过 sticky 顶栏 + rAF 驱动的 CSS 变量渐变实现滚动时顶栏透明→毛玻璃的过渡

**Tech Stack:** Vue 3 + SCSS + Pinia + Element Plus

**Spec:** `docs/superpowers/specs/2026-05-26-moments-cover-redesign.md`

---

### Task 1: 新增 CSS 变量

**Files:**
- Modify: `frontend/apps/web/src/styles/tokens.scss` (在 `--bg-gradient` 之后插入)

- [ ] **Step 1: 在 tokens.scss 的 `:root` 块中新增 Moments 相关 CSS 变量**

找到 `// --- Background（微信：纯平，无渐变）---` 区域，在 `--bg-gradient: none;` 之后、`}` 之前插入：

```scss
  // --- Moments 朋友圈 ---
  --moments-bg: #FFFFFF;
  --moments-cover-height: 280px;
  --moments-cover-placeholder: #4A5568;
  --moments-avatar-size: 68px;
  --moments-avatar-radius: 8px;
  --moments-topbar-height: 48px;
```

- [ ] **Step 2: 在文件末尾添加移动端媒体查询覆盖**

在 `:root` 闭合 `}` 之后追加：

```scss
@media (max-width: 768px) {
  :root {
    --moments-cover-height: 240px;
    --moments-avatar-size: 60px;
  }
}
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/styles/tokens.scss
git commit -m "feat(moments): add CSS variables for Moments cover layout"
```

---

### Task 2: 新建 MomentsCover.vue 组件

**Files:**
- Create: `frontend/apps/web/src/features/moments/MomentsCover.vue`

- [ ] **Step 1: 创建组件文件，包含 template、script setup、scoped SCSS**

```vue
<template>
  <div class="moments-cover">
    <div
      class="cover-bg"
      :style="coverBgStyle"
    />
    <div class="cover-body">
      <span class="cover-nickname">{{ nickname }}</span>
      <slot name="actions" />
      <img
        class="cover-avatar"
        :src="avatar"
        alt=""
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  coverPhoto: string
  avatar: string
  nickname: string
}>(), {
  coverPhoto: '',
  avatar: '',
  nickname: '',
})

const coverBgStyle = computed(() => {
  if (props.coverPhoto) {
    return {
      backgroundImage: `url(${props.coverPhoto})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return {
    backgroundColor: 'var(--moments-cover-placeholder)',
  }
})
</script>

<style scoped lang="scss">
.moments-cover {
  position: relative;
  height: var(--moments-cover-height);
  overflow: hidden;
  flex-shrink: 0;
}

.cover-bg {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
}

.cover-body {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 16px;
  gap: 12px;
}

.cover-nickname {
  flex: 1;
  text-align: right;
  color: var(--text-inverse);
  font-size: 18px;
  font-weight: 600;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cover-avatar {
  width: var(--moments-avatar-size);
  height: var(--moments-avatar-size);
  border-radius: var(--moments-avatar-radius);
  border: 2px solid #FFFFFF;
  transform: translateY(50%);
  flex-shrink: 0;
  object-fit: cover;
  background: var(--surface-sunken);
}
</style>
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx vue-tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsCover.vue
git commit -m "feat(moments): add reusable MomentsCover component"
```

---

### Task 3: 简化 MomentsFeed.vue — 移除滚动逻辑

**Files:**
- Modify: `frontend/apps/web/src/features/moments/MomentsFeed.vue`

- [ ] **Step 1: 简化 template — 移除 ref 和 scroll 事件**

将第 2 行：
```html
  <div class="moments-feed" ref="feedRef" @scroll="handleScroll">
```
改为：
```html
  <div class="moments-feed">
```

- [ ] **Step 2: 简化 script — 移除 feedRef 和 handleScroll**

移除第 40 行的 `feedRef`：
```ts
const feedRef = ref<HTMLElement>()  // 删除此行
```

移除第 46-53 行的 `handleScroll` 函数（整块删除）。

从 `import` 中移除 `ref`（如果没有其他地方使用的话——检查：`loading` 和 `hasMore` 是从 storeToRefs 来的，`ref` 只用于 `feedRef`，所以可以移除 `ref`）。

将：
```ts
import { ref, onMounted } from 'vue'
```
改为：
```ts
import { onMounted } from 'vue'
```

- [ ] **Step 3: 简化样式 — 移除自身滚动和 padding**

将：
```scss
.moments-feed {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
```
改为：
```scss
.moments-feed {
  flex: 1;
  background: var(--moments-bg);
  padding: 0 20px;
}
```

移动端媒体查询中的 padding 覆盖保留不变。

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npx vue-tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsFeed.vue
git commit -m "refactor(moments): strip scroll logic from MomentsFeed, delegate to parent"
```

---

### Task 4: 重构 MomentsContainer.vue — 统一滚动 + 沉浸式顶栏

**Files:**
- Modify: `frontend/apps/web/src/features/moments/MomentsContainer.vue`

- [ ] **Step 1: 重写 template**

```vue
<template>
  <div class="moments-container">
    <!-- 顶栏：sticky, 透明→实色 -->
    <div ref="topbarRef" class="moments-topbar">
      <span class="topbar-title">朋友圈</span>
      <el-icon class="topbar-camera" @click="showComposer = true">
        <Camera />
      </el-icon>
    </div>

    <!-- 统一滚动区 -->
    <div ref="scrollRef" class="moments-scroll" @scroll="handleScroll">
      <MomentsCover
        :cover-photo="coverPhoto"
        :avatar="avatar"
        :nickname="nickname"
      />
      <MomentsFeed />
    </div>

    <!-- 发布动态抽屉 -->
    <el-drawer v-model="showComposer" title="发布动态" :size="drawerSize" direction="btt">
      <MomentsComposer @close="showComposer = false" />
    </el-drawer>
  </div>
</template>
```

- [ ] **Step 2: 重写 script setup**

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Camera } from '@element-plus/icons-vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { useUserStore } from '@/stores/user'
import { useMomentsStore } from '@/stores/moments'
import MomentsFeed from './MomentsFeed.vue'
import MomentsCover from './MomentsCover.vue'
import MomentsComposer from './MomentsComposer.vue'

const showComposer = ref(false)
const { isMobile } = useIsMobile()
const drawerSize = computed(() => (isMobile.value ? '100vw' : 'min(400px, 100vw)'))

const userStore = useUserStore()
const momentsStore = useMomentsStore()

const avatar = computed(() => userStore.avatar)
const nickname = computed(() => userStore.nickname)
const coverPhoto = computed(() => (userStore.currentUser as any)?.coverPhoto ?? '')

const scrollRef = ref<HTMLElement>()
const topbarRef = ref<HTMLElement>()

let threshold = 232 // 默认 desktop: 280 - 48
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
}

function handleScroll() {
  if (!ticking) {
    requestAnimationFrame(() => {
      if (scrollRef.value) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.value
        updateTopbar(scrollTop)
        if (scrollHeight - scrollTop - clientHeight < 100) {
          momentsStore.loadFeed()
        }
      }
      ticking = false
    })
    ticking = true
  }
}

onMounted(() => {
  computeThreshold()
  window.addEventListener('resize', computeThreshold)
})

onUnmounted(() => {
  window.removeEventListener('resize', computeThreshold)
})
</script>
```

- [ ] **Step 3: 重写 scoped SCSS**

```scss
<style scoped lang="scss">
.moments-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--moments-bg);
}

.moments-topbar {
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

.topbar-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-inverse);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
  transition: color 0.15s ease, text-shadow 0.15s ease;

  // 当顶栏不透明时切换为深色文字
  .moments-topbar[style*="--topbar-bg-opacity: 0.95"] & {
    color: var(--text-primary);
    text-shadow: none;
  }
}

.topbar-camera {
  position: absolute;
  right: 16px;
  font-size: 22px;
  color: var(--text-inverse);
  cursor: pointer;
  padding: 4px;
  transition: color 0.15s ease;
}

// 顶栏文字颜色过渡 — 用 JS 控制的 CSS 变量驱动
// 通过 CSS 变量—topbar-text-lightness 来混合颜色
// fallback: 靠 JS 在 progress > 0.5 时切换 class

.moments-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px) {
  .topbar-title {
    font-size: 16px;
  }
}
</style>
```

**注意**：顶栏文字颜色从白到黑的切换，用纯 CSS 变量不太好做。最可靠的方式是在 `updateTopbar` 中追加一个 data attribute：

```ts
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
```

对应 SCSS：

```scss
.topbar-title {
  color: var(--text-inverse);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
  transition: color 0.15s ease, text-shadow 0.15s ease;
}

.topbar-camera {
  color: var(--text-inverse);
  transition: color 0.15s ease;
}

.moments-topbar.is-solid {
  .topbar-title {
    color: var(--text-primary);
    text-shadow: none;
  }
  .topbar-camera {
    color: var(--text-primary);
  }
}
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npx vue-tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsContainer.vue
git commit -m "refactor(moments): unified scroll container with immersive sticky topbar"
```

---

### Task 5: 重构 MomentsUserProfile.vue — 引入 MomentsCover + 统一滚动

**Files:**
- Modify: `frontend/apps/web/src/features/moments/MomentsUserProfile.vue`

- [ ] **Step 1: 重写 template**

```vue
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
```

- [ ] **Step 2: 重写 script setup**

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Loading } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useContactStore } from '@/stores/contact'
import { momentsService } from '@/services/moments'
import { getAvatarText } from '@/utils/common'
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
```

- [ ] **Step 3: 重写 scoped SCSS**

```scss
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
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npx vue-tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsUserProfile.vue
git commit -m "refactor(moments): integrate MomentsCover into user profile with unified scroll"
```

---

## Plan Self-Review

**Spec coverage:** 5 个 spec 要求全部覆盖 — CSS 变量 (Task 1)、MomentsCover 组件 (Task 2)、MomentsFeed 简化 (Task 3)、MomentsContainer 重构 (Task 4)、MomentsUserProfile 重构 (Task 5)

**Placeholder scan:** 无 TBD/TODO，所有代码块完整

**Type consistency:** `MomentsCoverProps` 三属性名在 Task 2/4/5 中一致；CSS 变量名在 Task 1/4/5 中一致
