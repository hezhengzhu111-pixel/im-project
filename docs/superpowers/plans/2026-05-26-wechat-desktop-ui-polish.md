# 微信桌面端聊天 UI 精修 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复已知 UI bug，对齐微信 PC 桌面端视觉，加入克制的毛玻璃/液体光斑效果

**Architecture:** 保留现有 3 栏布局和所有业务逻辑，分 4 层修改 7 个文件：P0 bug 修复 → 布局对齐 → 特效 → 清理

**Tech Stack:** Vue 3 + TypeScript + SCSS + Element Plus

---

## 文件结构

| 文件 | 职责 | 修改类型 |
|------|------|---------|
| `frontend/apps/web/src/features/chat/ChatSidebarPanel.vue` | 会话列表面板 — P0 bug 修复 + 布局微调 | 模板 + 样式 |
| `frontend/apps/web/src/features/chat/ChatContainer.vue` | 聊天容器 — 宽度/层级/布局/特效/清理 | 模板 + 脚本 + 样式 |
| `frontend/apps/web/src/components/layout/SideNavBar.vue` | 左侧导航栏 — emoji→图标 + 背景变量 | 模板 + 脚本 + 样式 |
| `frontend/apps/web/src/features/chat/ChatComposer.vue` | 输入区 — 图片按钮/表情/高度 | 模板 |
| `frontend/apps/web/src/features/chat/ChatMessageList.vue` | 消息列表 — 宽度限制 + flex 布局 | 样式 |
| `frontend/apps/web/src/features/chat/ChatMessageItem.vue` | 消息气泡 — 间距微调 | 样式 |
| `frontend/apps/web/src/styles/chat-theme.scss` | 效果变量 — --fx-* 变量定义 | 新增变量 |

---

### Task 1: ChatSidebarPanel — 修复选中态 prop 名

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatSidebarPanel.vue:8`

- [ ] **Step 1: 修正 activeSessionId → currentSessionId**

将模板第 8 行：
```html
:class="{ 'session-item--active': session.id === activeSessionId }"
```
改为：
```html
:class="{ 'session-item--active': session.id === currentSessionId }"
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatSidebarPanel.vue
git commit -m "fix(moments): use correct prop name currentSessionId instead of activeSessionId

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: ChatSidebarPanel — 修复搜索过滤使搜索框生效

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatSidebarPanel.vue:1-50`

- [ ] **Step 1: 重写 chat tab 模板使用 filteredSessionItems**

将模板第 3-23 行：
```html
<div v-if="activeTab === 'chat'" class="session-list" v-loading="!!loading">
    <div
      v-for="session in sessions"
      :key="session.id"
      class="session-item"
      :class="{ 'session-item--active': session.id === currentSessionId }"
      @click="handleSelectSession(session)"
    >
      <el-badge :hidden="!session.unreadCount" is-dot>
        <el-avatar :src="session.avatar" :size="40" />
      </el-badge>
      <div class="session-info">
        <div class="session-top">
          <span class="session-name">{{ session.name }}</span>
          <span class="session-time">{{ formatTime(session.lastMessageTime) }}</span>
        </div>
        <div class="session-preview">
          <span class="session-last-msg">{{ session.lastMessage?.content || '' }}</span>
        </div>
      </div>
    </div>
    <div v-if="sessions.length === 0 && !loading" class="session-empty">
      <p>暂无会话</p>
    </div>
  </div>
```

改为：

```html
<div v-if="activeTab === 'chat'" class="session-list" v-loading="!!loading">
    <div
      v-for="item in filteredSessionItems"
      :key="item.session.id"
      class="session-item"
      :class="{ 'session-item--active': item.session.id === currentSessionId }"
      @click="handleSelectSession(item.session)"
    >
      <el-badge :hidden="!item.session.unreadCount" is-dot>
        <el-avatar :src="item.session.avatar" :size="40" />
      </el-badge>
      <div class="session-info">
        <div class="session-top">
          <span class="session-name">{{ item.session.name }}</span>
          <span class="session-time">{{ formatTime(item.session.lastMessageTime) }}</span>
        </div>
        <div class="session-preview">
          <span class="session-last-msg">{{ item.preview }}</span>
        </div>
      </div>
    </div>
    <div v-if="filteredSessionItems.length === 0 && !loading" class="session-empty">
      <p>暂无会话</p>
    </div>
  </div>
```

- [ ] **Step 2: 重写 contacts tab 模板使用 groupedContacts（带字母分组）**

将模板第 30-49 行：
```html
<div v-else-if="activeTab === 'contacts'" class="contact-list">
    <div class="contact-section">
      <div
        v-for="friend in friends"
        :key="friend.friendId"
        class="contact-item"
        @click="handleStartPrivateChat(friend)"
      >
        <el-avatar :src="friend.avatar" :size="40" />
        <div class="contact-info">
          <span class="contact-name">{{ friend.nickname || friend.username }}</span>
          <span class="contact-status" :class="{ online: friend.isOnline }">
            {{ friend.isOnline ? '在线' : '离线' }}
          </span>
        </div>
      </div>
      <div v-if="friends.length === 0" class="session-empty">
        <p>暂无联系人</p>
      </div>
    </div>
  </div>
```

改为：

```html
<div v-else-if="activeTab === 'contacts'" class="contact-list">
    <template v-if="normalizedSearchKeyword">
      <div
        v-for="contact in filteredContacts"
        :key="contact.friendId"
        class="contact-item"
        @click="handleStartPrivateChat(contact)"
      >
        <el-avatar :src="contact.avatar" :size="40" />
        <div class="contact-info">
          <span class="contact-name">{{ contact.nickname || contact.username }}</span>
          <span class="contact-status" :class="{ online: contact.isOnline }">
            {{ contact.isOnline ? '在线' : '离线' }}
          </span>
        </div>
      </div>
    </template>
    <template v-else>
      <div v-for="group in groupedContacts" :key="group.key" class="contact-group">
        <div class="contact-group-title">{{ group.key }}</div>
        <div
          v-for="contact in group.contacts"
          :key="contact.friendId"
          class="contact-item"
          @click="handleStartPrivateChat(contact)"
        >
          <el-avatar :src="contact.avatar" :size="40" />
          <div class="contact-info">
            <span class="contact-name">{{ contact.nickname || contact.username }}</span>
          </div>
        </div>
      </div>
    </template>
    <div v-if="filteredContacts.length === 0" class="session-empty">
      <p>暂无联系人</p>
    </div>
  </div>
```

- [ ] **Step 3: 在 script 中将 normalizedSearchKeyword 暴露给模板**

`normalizedSearchKeyword` 当前只在 `<script setup>` 中定义，模板可以直接使用（Vue 3 `<script setup>` 中所有顶层绑定自动暴露给模板），无需额外改动。

- [ ] **Step 4: 在样式中添加联系人字母分组样式**

在 `</style>` 前添加：

```scss
.contact-group {
  margin-bottom: var(--space-1, 4px);
}

.contact-group-title {
  padding: var(--space-1, 4px) var(--space-4, 16px);
  font-size: var(--font-size-xs, 11px);
  font-weight: 600;
  color: var(--text-tertiary, #B0B0B0);
  background: var(--surface-secondary, #F7F7F7);
  position: sticky;
  top: 0;
  z-index: 1;
}
```

- [ ] **Step 5: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatSidebarPanel.vue
git commit -m "fix(chat): wire up search filtering in ChatSidebarPanel — use filteredSessionItems and groupedContacts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: ChatContainer — 修复侧栏宽度 CSS/JS 冲突

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatContainer.vue` — 模板第 11 行 + 脚本第 353-355 行 + CSS 第 604-609 行

- [ ] **Step 1: 模板改用 flexBasis**

将第 11 行：
```html
<aside class="chat-sidebar" :style="{ width: sidebarWidth + 'px' }">
```
改为：
```html
<aside class="chat-sidebar" :style="{ flexBasis: sidebarWidth + 'px' }">
```

- [ ] **Step 2: 脚本默认值和 MIN/MAX 常量调整**

将第 353-355 行：
```typescript
const sidebarWidth = ref(260);
const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 400;
```
改为：
```typescript
const sidebarWidth = ref(280);
const MIN_SIDEBAR = 240;
const MAX_SIDEBAR = 360;
```

- [ ] **Step 3: CSS 移除硬编码宽度**

将第 604-609 行：
```scss
.chat-sidebar {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--surface-secondary, #ffffff);
  border-right: 1px solid var(--border-light, #e5e7eb);
  overflow: hidden;
```
改为：
```scss
.chat-sidebar {
  flex: 0 0 auto;
  min-width: 240px;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  background: var(--surface-secondary, #ffffff);
  border-right: 1px solid var(--border-light, #e5e7eb);
  overflow: hidden;
```

- [ ] **Step 4: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatContainer.vue
git commit -m "fix(chat): resolve sidebar width CSS/JS conflict — use flexBasis with min/max constraints

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: ChatContainer — 修复详情面板层级和滑入动画

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatContainer.vue` — CSS 部分

- [ ] **Step 1: .wechat-layout 增加定位上下文**

将第 596-601 行：
```scss
.wechat-layout {
  display: flex;
  height: 100vh;
  background: var(--surface-tertiary, #f5f5f5);
  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
}
```
改为：
```scss
.wechat-layout {
  display: flex;
  height: 100dvh;
  height: 100vh; // fallback
  position: relative;
  overflow: hidden;
  background: var(--surface-tertiary, #f5f5f5);
  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
}
```

- [ ] **Step 2: .detail-overlay 层级修正**

将第 750-755 行：
```scss
.detail-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: var(--z-overlay, 300);
}
```
改为：
```scss
.detail-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: 50;
}
```

- [ ] **Step 3: .chat-detail-panel 层级修正 + 滑入动画**

将第 799-812 行：
```scss
.chat-detail-panel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 20;
  width: 320px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-light, #e5e7eb);
  background: var(--surface-secondary, #fff);
  box-shadow: var(--shadow-panel, 0 4px 12px rgba(0, 0, 0, 0.1));
  overflow: hidden;
}
```
改为：
```scss
.chat-detail-panel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 60;
  width: 320px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-light, #e5e7eb);
  background: var(--surface-secondary, #fff);
  box-shadow: var(--shadow-panel, 0 4px 12px rgba(0, 0, 0, 0.1));
  overflow: hidden;
  transition: transform 180ms ease-out;
}
```

- [ ] **Step 4: 内容层 z-index 提升（防止光斑压内容，为 Task 11 做准备）**

在样式末尾 `@media` 之前添加：

```scss
// 确保所有内容层在光斑之上
:deep(.side-nav) {
  position: relative;
  z-index: 1;
}

.chat-sidebar {
  position: relative;
  z-index: 1;
}

.chat-main {
  position: relative;
  z-index: 1;
}

.sidebar-resize-handle {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 5: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatContainer.vue
git commit -m "fix(chat): fix detail panel z-index stacking and add slide-in transition

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: SideNavBar — emoji 替换为 Element Plus 图标 + 背景变量

**Files:**
- Modify: `frontend/apps/web/src/components/layout/SideNavBar.vue`

- [ ] **Step 1: 更新 script — 导入 Element Plus 图标，tabs 改用图标组件**

将 `<script setup>` 部分改为：

```typescript
import { ChatDotRound, User, Compass, Setting } from '@element-plus/icons-vue'

defineProps<{
  activeTab: string
  avatar?: string
  unreadChat?: number
}>()

defineEmits<{ change: [key: 'chat' | 'contacts' | 'moments' | 'settings'] }>()

const tabs = [
  { key: 'chat', icon: ChatDotRound, label: '聊天', unread: 0 },
  { key: 'contacts', icon: User, label: '通讯录', unread: 0 },
  { key: 'moments', icon: Compass, label: '发现', unread: 0 },
] as const
```

- [ ] **Step 2: 更新模板 — 用 `<el-icon>` 渲染图标，保留下方设置按钮**

将模板整体改为：

```html
<template>
  <nav class="side-nav">
    <div class="nav-top">
      <el-avatar :src="avatar" :size="32" class="nav-avatar" />
    </div>
    <div class="nav-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="nav-btn"
        :class="{ 'nav-btn--active': activeTab === tab.key }"
        :title="tab.label"
        @click="$emit('change', tab.key)"
      >
        <el-badge :hidden="tab.unread === 0" is-dot>
          <el-icon class="nav-icon"><component :is="tab.icon" /></el-icon>
        </el-badge>
      </button>
    </div>
    <div class="nav-bottom">
      <button
        class="nav-btn"
        :class="{ 'nav-btn--active': activeTab === 'settings' }"
        title="设置"
        @click="$emit('change', 'settings')"
      >
        <el-icon class="nav-icon"><Setting /></el-icon>
      </button>
    </div>
  </nav>
</template>
```

- [ ] **Step 3: 更新样式 — 背景改用变量，图标颜色微调**

将 `.side-nav` 的背景：
```scss
.side-nav {
  width: 56px;
  min-width: 56px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #1E1E1E;
  padding: var(--space-2) 0;
  user-select: none;
}
```
改为：
```scss
.side-nav {
  width: 56px;
  min-width: 56px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--surface-nav);
  padding: var(--space-2) 0;
  user-select: none;
}
```

将 `.nav-icon` 的样式调整（图标字体大小适配 el-icon）：
```scss
.nav-icon {
  font-size: 20px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 4: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/components/layout/SideNavBar.vue
git commit -m "refactor(layout): replace emoji with Element Plus icons in SideNavBar, use CSS var for background

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: ChatContainer — 布局对齐（header 56px + background + sidebar 样式）

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatContainer.vue` — CSS 部分

- [ ] **Step 1: chat-header 高度 64px → 56px**

将 `.chat-header` 中的 `height: 64px;` 改为 `height: 56px;`：

```scss
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 var(--space-4, 16px);
  background: var(--surface-secondary, #ffffff);
  border-bottom: 1px solid var(--border-subtle, #ECECEC);
  flex-shrink: 0;
}
```

- [ ] **Step 2: chat-main 背景微调**

```scss
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--chat-bg, var(--surface-tertiary, #f5f5f5));
}
```

- [ ] **Step 3: .sidebar-header 高度从 64px 改为 56px**

```scss
.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  height: 56px;
  flex-shrink: 0;
}
```

- [ ] **Step 4: sidebar-search 搜索框高度 32px**

```scss
.sidebar-search {
  padding: 0 var(--space-3, 12px) var(--space-3, 12px);
  flex-shrink: 0;

  :deep(.el-input__wrapper) {
    height: 32px;
    background: var(--surface-sunken, #EDEDED);
    border: none;
    box-shadow: none;
    border-radius: var(--radius-sm, 4px);
  }
}
```

- [ ] **Step 5: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatContainer.vue
git commit -m "refactor(chat): align desktop layout — header 56px, subtle borders, search box 32px

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: ChatComposer — 补图片按钮 + 去表情 disabled + desktop min-height

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatComposer.vue`

- [ ] **Step 1: 模板工具栏增加图片按钮 + 表情去掉 disabled**

将第 3-8 行：
```html
<div class="composer-toolbar">
      <button class="toolbar-btn" title="表情" disabled>
        <el-icon><ChatDotRound /></el-icon>
      </button>
      <button
        class="toolbar-btn"
        title="文件"
        :disabled="disabled || uploading || isRecording"
        @click="selectFile"
      >
        <el-icon><Paperclip /></el-icon>
      </button>
```
改为：
```html
<div class="composer-toolbar">
      <button class="toolbar-btn" title="表情" @click="() => {}">
        <el-icon><ChatDotRound /></el-icon>
      </button>
      <button
        class="toolbar-btn"
        title="图片"
        :disabled="disabled || uploading || isRecording"
        @click="selectImage"
      >
        <el-icon><Picture /></el-icon>
      </button>
      <button
        class="toolbar-btn"
        title="文件"
        :disabled="disabled || uploading || isRecording"
        @click="selectFile"
      >
        <el-icon><Paperclip /></el-icon>
      </button>
```

- [ ] **Step 2: 样式 desktop min-height 132px**

在 `.wechat-composer` 样式中增加 `min-height`：
```scss
.wechat-composer {
  background: var(--chat-composer-bg, var(--chat-panel-bg));
  border-top: 1px solid var(--chat-composer-border, var(--chat-panel-border));
  padding: var(--space-2, 8px) var(--space-4, 16px) var(--space-3, 12px);
  min-height: 132px;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 3: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatComposer.vue
git commit -m "feat(chat): add image button to composer toolbar, un-disable emoji button, set desktop min-height 132px

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: ChatMessageList — 消息宽度限制 + flex 布局优化

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatMessageList.vue` — CSS 部分

- [ ] **Step 1: .message-list flex 布局**

将第 1038-1047 行：
```scss
.message-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0)),
    rgba(226, 232, 240, 0.42);
}
```
改为：
```scss
.message-list {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 16px;
  background: var(--chat-bg, var(--surface-tertiary, #f5f5f5));
}
```

- [ ] **Step 2: .message-scroller flex 占满**

```scss
.message-scroller {
  flex: 1;
  min-height: 0;
  scroll-behavior: smooth;
}
```

- [ ] **Step 3: .msg-item 宽度限制（在 ChatMessageItem 的样式不在此文件，需要在 ChatMessageList 中 :deep 覆盖或直接在 ChatMessageItem 中改）**

在 `.message-row` 后面添加 `:deep()` 覆盖 msg-item 宽度：
```scss
.message-row {
  min-width: 0;
}

:deep(.msg-item) {
  width: min(100%, var(--chat-timeline-max-width, 840px));
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
}
```

- [ ] **Step 4: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatMessageList.vue
git commit -m "refactor(chat): constrain message width to 840px, clean up message list flex layout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: ChatMessageItem — 气泡间距微调

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatMessageItem.vue` — CSS 部分

- [ ] **Step 1: 收紧 compact 消息间距 + 气泡极弱阴影**

在 `.msg-item` 样式中，将 compact 的 `padding-bottom` 收紧：
```scss
.msg-item {
  display: flex;
  align-items: flex-start;
  padding: 0 var(--space-4, 16px);
  padding-bottom: 20px;
  animation: msgFadeIn 0.25s var(--motion-out, ease-out) both;

  &--self { justify-content: flex-end; }
  &--compact { padding-bottom: 8px; }
  &--system { justify-content: center; padding-bottom: 20px; }
}
```

- [ ] **Step 2: 气泡增加极弱阴影**

在 `.msg-bubble` 中增加：
```scss
.msg-bubble {
  position: relative;
  display: inline-block;
  padding: 9px 13px;
  border-radius: var(--chat-bubble-radius, 12px);
  font-size: var(--font-size-base, 14px);
  line-height: var(--line-height-base, 1.5);
  word-break: break-word;
  background: var(--chat-bubble-other);
  color: var(--chat-bubble-other-text, var(--chat-text-primary));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  &.is-own {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  // ... 保留三角尾巴
}
```

- [ ] **Step 3: bubble-radius 使用变量保持 4px（而非默认的 12px fallback）**

将 `border-radius: var(--chat-bubble-radius, 12px);` 改为：
```scss
border-radius: var(--chat-bubble-radius, 4px);
```

同时 `.msg-bubble` 的 fallback 也要改。当前 `--chat-bubble-radius` 在 `chat-theme.scss` 中定义为 `var(--radius-sm)` 即 `4px`，但由于双层 var，fallback `12px` 不会生效。改为 `4px` 作为直接 fallback。

- [ ] **Step 4: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatMessageItem.vue
git commit -m "refactor(chat): tighten compact message spacing, add subtle bubble shadow, fix radius fallback

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: chat-theme.scss — 新增 --fx-* 效果变量（亮色 + 暗色）

**Files:**
- Modify: `frontend/apps/web/src/styles/chat-theme.scss`

- [ ] **Step 1: 在 `:root` 块中增加亮色效果变量**

在 `:root` 块的末尾（`}` 之前）添加：

```scss
  // ── 毛玻璃 / 液体光斑 / 光影效果 ──
  --fx-glass-bg: rgba(255, 255, 255, 0.64);
  --fx-glass-bg-strong: rgba(255, 255, 255, 0.78);
  --fx-glass-border: rgba(255, 255, 255, 0.35);
  --fx-glass-blur: blur(18px) saturate(1.35);
  --fx-liquid-green: rgba(7, 193, 96, 0.18);
  --fx-liquid-cyan: rgba(80, 200, 255, 0.12);
  --fx-liquid-purple: rgba(140, 120, 255, 0.10);
  --fx-soft-shadow: 0 18px 48px rgba(15, 23, 42, 0.10);
```

- [ ] **Step 2: 在 `.theme-dark` 块中增加暗色效果变量**

在 `.theme-dark` 块中（`}` 之前）添加：

```scss
  // ── 毛玻璃 / 液体光斑 / 光影效果（暗色版）──
  --fx-glass-bg: rgba(25, 25, 25, 0.68);
  --fx-glass-bg-strong: rgba(30, 30, 30, 0.82);
  --fx-glass-border: rgba(255, 255, 255, 0.08);
  --fx-glass-blur: blur(18px) saturate(1.35);
  --fx-liquid-green: rgba(7, 193, 96, 0.14);
  --fx-liquid-cyan: rgba(80, 200, 255, 0.08);
  --fx-liquid-purple: rgba(140, 120, 255, 0.08);
  --fx-soft-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
```

- [ ] **Step 3: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/styles/chat-theme.scss
git commit -m "feat(theme): add --fx-* CSS variables for glass, liquid blobs, and soft shadows (light + dark)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: ChatContainer — 液体光斑 + 毛玻璃效果

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatContainer.vue` — CSS 部分（scoped）

- [ ] **Step 1: 液体光斑 ::before + ::after 伪元素**

在 `.wechat-layout` 样式块之后添加：

```scss
// ── 液体光斑背景 ──
.wechat-layout::before,
.wechat-layout::after {
  content: '';
  position: absolute;
  pointer-events: none;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.40;
  z-index: 0;
}

.wechat-layout::before {
  width: 420px;
  height: 420px;
  background: radial-gradient(circle, var(--fx-liquid-green), transparent 70%);
  top: -120px;
  right: -100px;
  animation: liquidFloat1 18s ease-in-out infinite;
}

.wechat-layout::after {
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, var(--fx-liquid-cyan), transparent 70%);
  bottom: -80px;
  left: 180px;
  animation: liquidFloat2 22s ease-in-out infinite;
}

@keyframes liquidFloat1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(-40px, 30px) scale(1.1); }
  66% { transform: translate(20px, -20px) scale(0.9); }
}

@keyframes liquidFloat2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -25px) scale(1.08); }
  66% { transform: translate(-25px, 15px) scale(0.92); }
}

@media (prefers-reduced-motion: reduce) {
  .wechat-layout::before,
  .wechat-layout::after {
    animation: none;
  }
}
```

- [ ] **Step 2: 毛玻璃应用到 4 个区域**

在对应 CSS 选择器中添加 backdrop-filter 和半透明背景：

**`.chat-sidebar`** — 添加 glass：
```scss
.chat-sidebar {
  // ... 保留现有属性
  background: var(--fx-glass-bg, var(--surface-secondary, #f7f7f7));
  backdrop-filter: var(--fx-glass-blur);
  -webkit-backdrop-filter: var(--fx-glass-blur);
}
```

**`.chat-header`** — 添加 glass：
```scss
.chat-header {
  // ... 保留现有属性
  background: var(--fx-glass-bg, var(--surface-secondary, #ffffff));
  backdrop-filter: var(--fx-glass-blur);
  -webkit-backdrop-filter: var(--fx-glass-blur);
}
```

**`.chat-detail-panel`** — 添加 glass：
```scss
.chat-detail-panel {
  // ... 保留现有属性
  background: var(--fx-glass-bg-strong, var(--surface-secondary, #fff));
  backdrop-filter: var(--fx-glass-blur);
  -webkit-backdrop-filter: var(--fx-glass-blur);
}
```

- [ ] **Step 3: ChatComposer 毛玻璃**

在 ChatContainer 的 scoped 样式中通过 `:deep()` 覆盖 ChatComposer：

```scss
:deep(.wechat-composer) {
  background: var(--fx-glass-bg, var(--chat-composer-bg));
  backdrop-filter: var(--fx-glass-blur);
  -webkit-backdrop-filter: var(--fx-glass-blur);
}
```

- [ ] **Step 4: 空状态卡片和历史加载 pill 可选 glass**

```scss
:deep(.message-empty-card) {
  background: var(--fx-glass-bg, var(--chat-panel-bg));
  backdrop-filter: var(--fx-glass-blur);
  -webkit-backdrop-filter: var(--fx-glass-blur);
}

:deep(.history-indicator) {
  background: var(--fx-glass-bg, var(--chat-panel-bg));
  backdrop-filter: var(--fx-glass-blur);
  -webkit-backdrop-filter: var(--fx-glass-blur);
}
```

- [ ] **Step 5: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatContainer.vue
git commit -m "feat(chat): add liquid blob background and glass morphism effects to sidebar/header/composer/detail-panel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: ChatContainer — 删除未使用的 import

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatContainer.vue` — script 部分 import 区域

- [ ] **Step 1: 确认未使用的 import**

在 `ChatContainer.vue` 模板中确认以下组件和图标未被使用：
- 图标：`ArrowLeft`、`ChatDotRound`、`Moon`、`Setting`、`Sunny`
- 组件：`EncryptionBadge`、`SecurityPanel`、`ConnectionStatusBar`

- [ ] **Step 2: 修改 import 语句**

将第 249-281 行的 import 区域中的图标 import：
```typescript
import {
  ArrowLeft,
  ChatDotRound,
  Close,
  InfoFilled,
  Lock,
  MoreFilled,
  Moon,
  Search,
  Setting,
  Sunny,
} from "@element-plus/icons-vue";
```
改为：
```typescript
import {
  Close,
  InfoFilled,
  Lock,
  MoreFilled,
  Search,
} from "@element-plus/icons-vue";
```

删除未使用的组件 import：
```typescript
import EncryptionBadge from "@/components/security/EncryptionBadge.vue";
import SecurityPanel from "@/components/security/SecurityPanel.vue";
import ConnectionStatusBar from "@/components/status/ConnectionStatusBar.vue";
```
这三行删除。

- [ ] **Step 3: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatContainer.vue
git commit -m "chore(chat): remove unused icon and component imports from ChatContainer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: 最终验证 — typecheck + lint + build

**Files:** 无修改，仅验证

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd frontend && npm run typecheck
```
Expected: 零错误退出

- [ ] **Step 2: ESLint 检查**

```bash
cd frontend && npm run web:lint:check
```
Expected: 零错误退出（或仅有本次改动范围外的预先存在的 warning）

- [ ] **Step 3: Production 构建**

```bash
cd frontend && npm run web:build
```
Expected: 构建成功，零错误

- [ ] **Step 4: 如果任何一步失败**

根据错误信息修正对应文件。常见问题：
- TypeScript: prop 名不匹配（检查 `filteredSessionItems` 的 item 结构）
- ESLint: 未使用变量（检查删除的 import 是否确实未使用）
- Build: CSS 变量引用错误（检查 `var()` 语法）

- [ ] **Step 5: Commit（如果上一步有修正）**

```bash
git add -A
git commit -m "chore: fix typecheck/lint/build issues from wechat desktop UI polish"
```

---

## 执行顺序

```
Task 1  → Task 2  → Task 3  → Task 4    (P0 Bug 修复，可连续执行)
                              ↓
Task 5  → Task 6  → Task 7  → Task 8  → Task 9  (布局对齐)
                                            ↓
Task 10 → Task 11                            (特效)
                                            ↓
Task 12 → Task 13                            (清理 + 验证)
```
