# 朋友圈封面与滚动布局重构

**日期**: 2026-05-26
**状态**: 已确认
**目标**: 将朋友圈主页重构为微信风格的沉浸式封面 + 统一滚动布局

## 概述

重构 `MomentsContainer`、`MomentsFeed`、`MomentsUserProfile` 三个组件的滚动模型和视觉样式，新建可复用的 `MomentsCover.vue` 组件，实现微信朋友圈级别的 UI 体验。

## 设计原则

- **单一滚动模型**：所有 Moments 页面统一使用"容器级滚动 + Sticky 顶栏"，废除子组件内部的独立 `overflow-y: auto`
- **Props 驱动 + 插槽扩展**：`MomentsCover` 是纯表现层组件，通过 Props 接收数据，通过 `#actions` 插槽允许父组件注入操作按钮
- **CSS 变量架构**：所有颜色和尺寸变量定义在 `tokens.scss` 的 `:root` 中，JS 通过修改 CSS 自定义属性驱动动画

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/features/moments/MomentsCover.vue` | **新建** | 可复用封面组件 |
| `src/features/moments/MomentsContainer.vue` | 重构 | 统一滚动容器 + sticky 顶栏 + 滚动渐变逻辑 |
| `src/features/moments/MomentsFeed.vue` | 简化 | 纯列表组件，移除自身滚动和 padding |
| `src/features/moments/MomentsUserProfile.vue` | 重构 | 引入 MomentsCover，统一滚动模型 |
| `src/styles/tokens.scss` | 扩展 | 新增 `--moments-*` 变量 |
| `src/types/user.ts` | 扩展 | `User` 类型新增 `coverPhoto` 字段（来自 `@im/shared-types`） |

## 组件树

```
MomentsContainer (/moments)
├── 顶栏 (sticky, 透明 → 实色 + 毛玻璃)
│   ├── "朋友圈" 标题
│   └── 相机/发布按钮
├── MomentsCover (当前用户, 来自 userStore)
│   ├── 封面背景图
│   ├── 用户昵称 (白色 + text-shadow)
│   └── 用户头像 (右下角悬浮, 2px 白边, 凸出 50%)
├── MomentsFeed (纯列表)
│   └── MomentsPostCard × N
└── MomentsComposer (底部弹出 drawer, 保持不变)

MomentsUserProfile (/moments/user/:userId)
├── 顶栏 (sticky, 返回箭头 + 用户昵称)
├── MomentsCover (目标用户, 来自 API + store)
│   └── #actions 插槽: 加好友按钮
└── 帖子列表 (作为页面流)
```

## MomentsCover.vue 规格

### Props

```ts
interface MomentsCoverProps {
  coverPhoto: string   // 封面图 URL，空字符串时显示占位深灰色背景
  avatar: string       // 用户头像 URL
  nickname: string     // 用户昵称
}
```

### 插槽

```html
<slot name="actions" />  <!-- 封面右下角，头像左侧，用于注入操作按钮 -->
```

### 布局尺寸

| 属性 | Desktop | Mobile (≤768px) |
|------|---------|-----------------|
| 封面高度 | 280px | 240px |
| 头像尺寸 | 68×68px | 60×60px |
| 头像圆角 | 8px | 8px |
| 头像边框 | 2px solid #FFF | 2px solid #FFF |
| 头像定位 | `position: absolute; bottom: 0; right: 16px; transform: translateY(50%)` | 同左, right: 12px |

### 昵称样式

- 颜色: `var(--text-inverse)` (#FFFFFF)
- 字号: 18px, 字重: 600
- `text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4)`
- `padding-left: 16px`
- `max-width: calc(100% - 68px - 12px - 16px - 16px)`（预留头像 + 间距 + 右 padding）
- 单行截断（`text-ellipsis` mixin）
- 定位: `position: absolute; bottom: 26px; left: 0`

### 封面背景

- `width: 100%`, `height: 100%`
- `object-fit: cover`
- 无封面图时: `background-color: var(--moments-cover-placeholder)` (#4A5568)

### Skeleton 加载态

当 `coverPhoto` 和 `avatar` 尚未加载时（空字符串），封面区域显示深灰色占位背景，头像位置显示一个同尺寸的浅灰色骨架块（`--surface-sunken`），通过 CSS `animation: pulse` 实现呼吸效果。

## 滚动驱动的顶栏过渡

### 实现位置

`MomentsContainer.vue` 和 `MomentsUserProfile.vue` 各自的 `handleScroll` 方法。

### 核心变量

| 变量 | 值 |
|------|-----|
| 阈值 (threshold) | 封面高度 - 顶栏高度 = `280px - 48px = 232px` (desktop), `240px - 48px = 192px` (mobile) |
| 进度 (progress) | `Math.min(scrollTop / threshold, 1)`，范围 [0, 1] |

### 过渡映射

| 属性 | scrollTop=0 | scrollTop≥threshold |
|------|-------------|---------------------|
| `--topbar-bg-opacity` | 0 | 0.95 |
| `--topbar-border-opacity` | 0 | 1 |
| `--topbar-blur` | 0px | 10px |
| 标题/图标颜色 | 白色 | `var(--text-primary)` |

### 性能策略

```ts
let ticking = false
function handleScroll(e: Event) {
  if (!ticking) {
    requestAnimationFrame(() => {
      const scrollTop = (e.target as HTMLElement).scrollTop
      const progress = Math.min(scrollTop / threshold, 1)
      topbarRef.value?.style.setProperty('--topbar-bg-opacity', String(progress * 0.95))
      topbarRef.value?.style.setProperty('--topbar-border-opacity', String(progress))
      topbarRef.value?.style.setProperty('--topbar-blur', `${progress * 10}px`)
      ticking = false
    })
    ticking = true
  }
}
```

### 顶栏 CSS

```scss
.moments-topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(255, 255, 255, var(--topbar-bg-opacity, 0));
  border-bottom: 1px solid rgba(236, 236, 236, var(--topbar-border-opacity, 0));
  backdrop-filter: blur(var(--topbar-blur, 0px));
  -webkit-backdrop-filter: blur(var(--topbar-blur, 0px));
  transition: background 0.15s ease, border-color 0.15s ease;
}
```

### 移动端适配

- 阈值使用 `--moments-cover-height` CSS 变量，JS 中通过 `getComputedStyle` 动态读取
- 顶栏高度固定 48px（含 safe-area-inset-top 处理）

## MomentsContainer.vue 重构

### 结构变化

**之前**: 外层 flex column 容器 → 固定标题栏 + MomentsFeed（自滚动）
**之后**: 外层 flex column 容器 → sticky 顶栏 + 统一滚动区（封面 + 列表）

### 新增逻辑

- `feedRef` 滚动监听从 `MomentsFeed` 提升到 `MomentsContainer`
- 顶栏透明度由 `handleScroll` 通过 rAF + CSS 变量驱动
- 点击相机按钮触发 `showComposer = true`（已有逻辑不变）
- 封面数据从 `useUserStore()` 的 `currentUser` 获取（avatar, nickname, coverPhoto）

### 加载更多判断

```ts
// 从 MomentsFeed 提升到 MomentsContainer 的 handleScroll 中
const { scrollTop, scrollHeight, clientHeight } = feedRef.value
if (scrollHeight - scrollTop - clientHeight < 100) {
  store.loadFeed()
}
```

## MomentsFeed.vue 简化

- **移除** `overflow-y: auto`、自身 `padding: 16px 20px`、`@scroll="handleScroll"`、`ref="feedRef"`
- **移除** `handleScroll` 方法和 `feedRef` 声明
- 保留 `onMounted(() => store.loadFeed(true))` 初始化加载
- 列表容器 `background: var(--moments-bg)` (#FFFFFF)
- 其他 TS 逻辑（`feed`, `loading`, `hasMore`）保持不变

## MomentsUserProfile.vue 重构

### 结构变化

**之前**: `profile-header`（头像+昵称+加好友按钮）+ `profile-posts`（独立 overflow-y: auto）
**之后**: sticky 顶栏 + `MomentsCover` + 帖子列表（统一滚动）

### 数据来源

- `coverPhoto`, `avatar`, `nickname` 从已加载的帖子数据中提取（从第一个帖子的 `userAvatar`, `userNickname`），或从独立的用户信息 API 获取
- 加载顺序：
  1. `onMounted` 中触发 `loadUserProfile(userId)` 获取用户基本信息（avatar, nickname, coverPhoto）
  2. 同时触发 `loadPosts(true)` 获取帖子列表
  3. 封面区域在数据加载中显示 Skeleton 状态

### 顶栏设计

- 左侧：返回箭头（`<el-icon><ArrowLeft /></el-icon>`），点击 `router.back()`
- 中间：用户昵称（滚动后显示，初始透明）
- 右侧：更多操作按钮（可选）

### 路由切换清理

```ts
// 在 watch(userId) 中，切换用户时先清理旧数据
watch(userId, () => {
  posts.value = []
  hasMore.value = true
  // 重置滚动位置和顶栏状态
  if (scrollRef.value) {
    scrollRef.value.scrollTop = 0
  }
  loadPosts(true)
})
```

### 加好友按钮

通过 `MomentsCover` 的 `#actions` 插槽注入：

```html
<MomentsCover :cover-photo="coverPhoto" :avatar="avatar" :nickname="nickname">
  <template #actions>
    <el-button v-if="!isSelf && !isFriend" type="primary" size="small" @click="handleAddFriend">
      添加好友
    </el-button>
  </template>
</MomentsCover>
```

## 新增 CSS 变量 (tokens.scss)

```scss
:root {
  // --- Moments 朋友圈 ---
  --moments-bg: #FFFFFF;
  --moments-cover-height: 280px;
  --moments-cover-placeholder: #4A5568;
  --moments-avatar-size: 68px;
  --moments-avatar-radius: 8px;
  --moments-topbar-height: 48px;
}
```

移动端覆盖在 `global.scss` 或组件的 `@media (max-width: 768px)` 中：

```scss
@media (max-width: 768px) {
  :root {
    --moments-cover-height: 240px;
    --moments-avatar-size: 60px;
  }
}
```

## 不在范围内

- **MomentsPostCard 九宫格图片布局**：已有实现（`grid-1` ~ `grid-6`），本次不修改
- **后端 API 变更**：`coverPhoto` 字段需要后端支持，本次只做前端 UI 和类型定义
- **E2E 测试**：本次不涉及
- **MomentsComposer / MomentsComments / MomentsLikeBar**：本次不修改

## 验收标准

1. 朋友圈主页顶部显示封面图（或占位背景），用户头像悬浮在封面右下角，向下凸出一半
2. 用户昵称在头像左侧，白色文字带阴影，长昵称自动截断
3. 顶栏初始透明，向下滚动时逐渐变为白色半透明毛玻璃背景
4. 顶栏过渡流畅，无卡顿（rAF 节流）
5. Feed 列表背景纯白，无边距和生硬边框
6. MomentsUserProfile 与 MomentsFeed 共享同一套 MomentsCover 组件
7. 移动端（≤768px）封面高度和头像尺寸自动适配
8. 已有数据加载、滚动分页等 TS 逻辑不受影响
9. CSS 变量完整定义在 `tokens.scss` 中，无硬编码颜色值
