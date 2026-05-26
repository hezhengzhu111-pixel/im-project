# MomentsPostCard 微信风格布局 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 MomentsPostCard.vue 从卡片式布局重构为微信经典"左侧头像 + 右侧内容"扁平布局

**Architecture:** 单文件重构（MomentsPostCard.vue），分两步：先改 Template + Script（移除"更多"按钮、新增"全文"展开逻辑、调整 DOM 结构），再重写 SCSS（取消圆角阴影、Flex 横排布局、蓝色昵称、6行截断、淡灰分割线、浅灰点赞评论背景）

**Tech Stack:** Vue 3 + TypeScript + SCSS + Element Plus

**Spec:** `docs/superpowers/specs/2026-05-26-moments-post-card-wechat-layout.md`

---

### Task 1: 重构 Template + Script

**Files:**
- Modify: `frontend/apps/web/src/features/moments/MomentsPostCard.vue`

将整个 `<template>` 和 `<script setup>` 替换为以下内容：

- [ ] **Step 1: 替换 template**

```vue
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
```

- [ ] **Step 2: 替换 script setup**

```vue
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

// Expand logic
const shouldTruncate = computed(() => {
  const content = props.post.post.content
  if (!content) return false
  return content.length > 200
})
const isExpanded = ref(false)

function handleExpand() {
  isExpanded.value = true
}

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
```

向后兼容保留 `isOwner`（后续详情页使用），但当前模板中不使用它。

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npm run typecheck 2>&1 | tail -5
```
预期：无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsPostCard.vue
git commit -m "refactor(moments): restructure PostCard template to WeChat-style layout"
```

---

### Task 2: 重写 SCSS

**Files:**
- Modify: `frontend/apps/web/src/features/moments/MomentsPostCard.vue` (仅 `<style>` 块)

- [ ] **Step 1: 替换全部 scoped SCSS**

```scss
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
  transition: opacity 0.15s ease;
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
  transition: opacity 0.15s ease;
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
  transition: background 0.2s ease;
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
    transition: opacity 0.15s ease;
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
  padding: 6px 8px;
}

// --- Mobile ---
@media (max-width: 768px) {
  .post-layout {
    padding: 0 12px;
  }
  .post-avatar {
    width: 36px;
    height: 36px;
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
```

注意：`--moments-bg` 和 `--surface-sunken`、`--surface-secondary`、`--text-primary`、`--text-tertiary` 已在 `tokens.scss` 中定义。`#576B95`、`#F0F0F0`、`#F7F7F7`、`#B0B0B0` 是微信朋友圈的硬编码品牌色，不适合抽象为通用变量。

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npm run typecheck 2>&1 | tail -5
```
预期：无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsPostCard.vue
git commit -m "style(moments): rewrite PostCard SCSS to WeChat flat layout"
```

---

### Task 3: 最终验证

- [ ] **Step 1: TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1
```
预期：无错误

- [ ] **Step 2: ESLint 检查**

```bash
cd frontend/apps/web && npx eslint src/features/moments/MomentsPostCard.vue 2>&1 | grep "error" | head -5
```
预期：仅预存的 Vue SFC 解析错误（与未修改文件一致），无新增错误

- [ ] **Step 3: Prettier 格式化**

```bash
cd frontend/apps/web && npx eslint --fix src/features/moments/MomentsPostCard.vue 2>&1
```

- [ ] **Step 4: 最终提交**

```bash
git add frontend/apps/web/src/features/moments/MomentsPostCard.vue
git commit -m "chore(moments): apply prettier to PostCard" --allow-empty
```

---

## Plan Self-Review

**Spec coverage:**
- ✅ 移除圆角/阴影 → Task 2 (SCSS: `.moments-post-card` 只有 background)
- ✅ Flex 左侧头像 + 右侧内容 → Task 1 (template: `.post-layout` + `.post-avatar` + `.post-main`)
- ✅ 昵称 #576B95 + hover → Task 2 (SCSS: `.post-nickname`)
- ✅ 正文 15px / line-height 1.6 / 6 行截断 → Task 2 (SCSS: `.post-content.is-truncated`)
- ✅ "全文"按钮 #576B95 → Task 1 (template + script: `handleExpand`) + Task 2 (SCSS: `.post-expand`)
- ✅ 时间 + 互动同行 space-between → Task 1 (template: `.post-meta`) + Task 2 (SCSS)
- ✅ 分割线 #F0F0F0 仅右侧 → Task 2 (SCSS: `.post-main { border-bottom }`)
- ✅ 点赞栏浅灰背景 → Task 2 (SCSS: `.post-social`)
- ✅ 移除"更多"按钮 → Task 1 (removed from template + imports)
- ✅ 移动端适配 → Task 2 (SCSS: `@media`)

**Placeholder scan:** 无 TBD/TODO/占位符

**Type consistency:** `shouldTruncate`、`isExpanded`、`handleExpand`、`handleAvatarClick` 在 Task 1 template + script 中一致
