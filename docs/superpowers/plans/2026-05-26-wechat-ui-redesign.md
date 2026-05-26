# 聊天核心页面微信风格 UI 重构 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将聊天核心页面替换为微信风格 UI：全局微信绿配色、桌面端 2 栏布局、微信风消息气泡、移动端 4 Tab

**Architecture:** 分 7 个任务逐层推进——先替换设计 Token（SCSS 变量），再逐个重写桌面布局/气泡/输入区/会话列表，最后重写移动端和清理废弃代码。每个任务独立可测

**Tech Stack:** Vue 3 + SCSS + Element Plus（保留框架但覆盖样式）

---

## 文件结构

| 操作 | 文件 | 任务 |
|------|------|------|
| 重写 | `styles/tokens.scss` | Task 1 |
| 重写 | `styles/theme.scss` | Task 1 |
| 重写 | `styles/chat-theme.scss` | Task 1 |
| 重写 | `styles/global.scss` | Task 1 |
| 删除 | `styles/glassmorphism.scss` | Task 1 |
| 重写 | `features/chat/ChatContainer.vue` | Task 2 |
| 重写 | `features/chat/ChatMessageItem.vue` | Task 3 |
| 重写 | `features/chat/ChatComposer.vue` | Task 4 |
| 重写 | `features/chat/ChatSidebarPanel.vue` | Task 5 |
| 删除 | `components/layout/SideNavBar.vue` | Task 6 |
| 重写 | `layouts/MobileChatLayout.vue` | Task 6 |
| 重写 | `components/mobile/MobileTabBar.vue` | Task 6 |
| 修改 | `router/index.ts` | Task 6 |
| 修改 | `App.vue` | Task 7 |

---

### Task 1: 设计 Token — SCSS 变量全面替换

**Files:**
- Rewrite: `frontend/apps/web/src/styles/tokens.scss`
- Rewrite: `frontend/apps/web/src/styles/theme.scss`
- Rewrite: `frontend/apps/web/src/styles/chat-theme.scss`
- Rewrite: `frontend/apps/web/src/styles/global.scss`
- Delete: `frontend/apps/web/src/styles/glassmorphism.scss`

- [ ] **Step 1: 重写 `tokens.scss` — 微信配色方案**

用以下内容完全替换 `tokens.scss`：

```scss
// ============================================
// Design Token System — WeChat-Style
// ============================================

:root {
  // --- Color: Primary (WeChat Green) ---
  --color-primary: #07C160;
  --color-primary-dark: #06AD56;
  --color-primary-light: #95EC69;
  --color-primary-soft: #B6F0A5;
  --color-primary-muted: #D4F5C4;
  --color-primary-subtle: #E8F9E3;

  // --- Color: Semantic ---
  --color-success: #07C160;
  --color-warning: #FA9D3B;
  --color-danger: #FA5151;
  --color-info: #576B95;

  // --- Color: Text ---
  --text-primary: #111111;
  --text-secondary: #576B95;
  --text-tertiary: #B0B0B0;
  --text-placeholder: #CCCCCC;
  --text-inverse: #FFFFFF;

  // --- Color: Surface ---
  --surface-primary: #FFFFFF;
  --surface-secondary: #F7F7F7;
  --surface-tertiary: #EDEDED;
  --surface-elevated: #FFFFFF;
  --surface-overlay: #FFFFFF;
  --surface-sunken: #EDEDED;

  // --- Color: Border ---
  --border-light: #E6E6E6;
  --border-default: #E6E6E6;
  --border-strong: #CCCCCC;
  --border-focus: var(--color-primary);

  // --- Radius (WeChat: tight corners) ---
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  // --- Shadow (WeChat: minimal) ---
  --shadow-xs: none;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.10);
  --shadow-xl: 0 8px 24px rgba(0, 0, 0, 0.12);

  // --- Spacing ---
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;

  // --- Typography ---
  --font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --font-mono: "SF Mono", "Menlo", "Monaco", monospace;
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-base: 15px;
  --font-size-lg: 17px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;
  --line-height-base: 1.5;
  --line-height-tight: 1.3;

  // --- Motion ---
  --motion-fast: 150ms;
  --motion-base: 250ms;
  --motion-slow: 350ms;
  --motion-ease: ease;

  // --- Z-Index ---
  --z-base: 1;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;

  // --- Sizing ---
  --sidebar-width: 280px;
  --chat-header-height: 56px;
  --composer-min-height: 140px;
  --mobile-nav-height: 48px;
  --mobile-tab-height: 56px;

  // --- Background gradient (removed, flat only) ---
  --bg-gradient: none;
}
```

- [ ] **Step 2: 重写 `theme.scss` — 暗黑模式 Token**

```scss
// ============================================
// Dark Theme Overrides (WeChat-Style)
// ============================================

.theme-dark {
  --color-primary: #07C160;
  --color-primary-dark: #06AD56;
  --color-primary-light: #05A351;
  --color-primary-soft: #048A44;
  --color-primary-muted: #037037;
  --color-primary-subtle: #02562A;

  --text-primary: #E5E5E5;
  --text-secondary: #7B8FA0;
  --text-tertiary: #666666;
  --text-placeholder: #444444;
  --text-inverse: #111111;

  --surface-primary: #191919;
  --surface-secondary: #222222;
  --surface-tertiary: #111111;
  --surface-elevated: #262626;
  --surface-overlay: #2C2C2C;
  --surface-sunken: #0D0D0D;

  --border-light: #333333;
  --border-default: #444444;
  --border-strong: #555555;

  --shadow-sm: none;
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.30);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.40);
  --shadow-xl: 0 8px 24px rgba(0, 0, 0, 0.50);

  --bg-gradient: none;
}
```

- [ ] **Step 3: 重写 `chat-theme.scss` — 聊天 CSS 变量**

```scss
// ============================================
// Chat-Specific CSS Custom Properties
// ============================================

:root {
  // Shell & panel backgrounds
  --chat-shell-bg: var(--surface-secondary);
  --chat-panel-bg: var(--surface-primary);
  --chat-card-hover: #F0F0F0;
  --chat-card-active: #E5E5E5;

  // Message bubbles (WeChat style)
  --chat-bubble-own: #95EC69;
  --chat-bubble-own-text: #111111;
  --chat-bubble-other: #FFFFFF;
  --chat-bubble-other-text: #111111;
  --chat-bubble-system: transparent;
  --chat-bubble-system-text: #B0B0B0;

  // Message area background
  --chat-message-area-bg: #EDEDED;

  // Avatar
  --chat-avatar-size: 36px;
  --chat-avatar-radius: var(--radius-sm);

  // Bubble
  --chat-bubble-radius: var(--radius-sm);
  --chat-bubble-padding-y: 10px;
  --chat-bubble-padding-x: 14px;
  --chat-bubble-max-width: 60%;

  // Composer
  --chat-composer-bg: var(--surface-secondary);
  --chat-composer-border: var(--border-light);
  --chat-composer-toolbar-size: 36px;

  // Message shadow (WeChat: none)
  --chat-message-shadow: none;

  // Badge (unread dot)
  --chat-badge-bg: #FA5151;
  --chat-badge-text: #FFFFFF;

  // Accent delegates
  --chat-accent-color: var(--color-primary);
  --chat-accent-hover: var(--color-primary-dark);

  // Glass — removed, delegate to flat
  --chat-glass-bg: var(--surface-elevated);
  --chat-glass-blur: none;

  // Chat timeline max-width
  --chat-timeline-max-width: 800px;
}

.theme-dark {
  --chat-shell-bg: var(--surface-tertiary);
  --chat-panel-bg: var(--surface-primary);
  --chat-card-hover: #262626;
  --chat-card-active: #333333;
  --chat-bubble-own: #05A351;
  --chat-bubble-own-text: #E5E5E5;
  --chat-bubble-other: #262626;
  --chat-bubble-other-text: #E5E5E5;
  --chat-message-area-bg: #111111;
  --chat-composer-bg: var(--surface-primary);
  --chat-composer-border: var(--border-light);
}

// Utility classes (simplified)
.chat-soft-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;

  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }
  &::-webkit-scrollbar-track { background: transparent; }
}
```

- [ ] **Step 4: 重写 `global.scss` — 简化的全局样式和 Element Plus 覆盖**

用以下核心覆盖替换 `global.scss` 内容（保留文件顶部原有的 reset 部分不变，仅替换 Element Plus 覆盖和实用类）：

```scss
// ============================================
// Element Plus overrides — WeChat flat style
// ============================================

// Buttons: flat, tight corners
.el-button {
  --el-button-border-radius: var(--radius-sm);
  --el-button-font-size: var(--font-size-sm);
  font-weight: 400;
  box-shadow: none !important;

  &--primary {
    --el-button-bg-color: var(--color-primary);
    --el-button-border-color: var(--color-primary);
    --el-button-hover-bg-color: var(--color-primary-dark);
    --el-button-hover-border-color: var(--color-primary-dark);
  }
}

// Inputs: thinner border, smaller radius
.el-input {
  --el-input-border-radius: var(--radius-sm);
  --el-input-border-color: var(--border-light);
  --el-input-hover-border-color: var(--border-default);
  --el-input-focus-border-color: var(--color-primary);
  --el-input-bg-color: var(--surface-primary);

  .el-input__wrapper {
    box-shadow: none !important;
    border: 1px solid var(--border-light);
    transition: border-color var(--motion-fast) var(--motion-ease);

    &:hover { border-color: var(--border-default); }
    &.is-focus { border-color: var(--color-primary); }
  }
}

// Cards: flat, no shadow
.el-card {
  --el-card-border-radius: var(--radius-sm);
  box-shadow: none;
  border: 1px solid var(--border-light);
}

// Dialogs: flat, tight corners
.el-dialog {
  --el-dialog-border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);

  .el-dialog__header { padding: var(--space-4); border-bottom: 1px solid var(--border-light); }
  .el-dialog__body { padding: var(--space-4); }
  .el-dialog__footer { padding: var(--space-3) var(--space-4); }
}

// Messages / Notifications: flat
.el-message, .el-notification {
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
}

// Badge
.el-badge__content {
  background: var(--chat-badge-bg);
  border: none;
}

// Dropdown
.el-dropdown-menu {
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border-light);
}

// Menu
.el-menu {
  border-right: none;
}

// Avatar
.el-avatar {
  --el-avatar-border-radius: var(--radius-sm);
}

// Skeleton
.el-skeleton { --el-skeleton-border-radius: var(--radius-sm); }

// ============================================
// Custom scrollbar (WeChat style: thin)
// ============================================
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }
::-webkit-scrollbar-track { background: transparent; }

// ============================================
// Global reset & utilities
// ============================================
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  color: var(--text-primary);
  background: var(--surface-tertiary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

// Status dots
.status-dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
  &--online { background: var(--color-success); }
  &--offline { background: var(--text-tertiary); }
}

// Flex utilities
.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-between { display: flex; align-items: center; justify-content: space-between; }
```

- [ ] **Step 5: 删除 `glassmorphism.scss`**

从 `styles/index.scss` 中移除 `@import './glassmorphism.scss';`（如果存在），并删除文件。

- [ ] **Step 6: 验证编译**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零类型错误（SCSS 变更不影响 TypeScript）。

- [ ] **Step 7: 提交**

```bash
git add frontend/apps/web/src/styles/
git commit -m "refactor(ui): replace design tokens with WeChat color system

Replace indigo/glassmorphism palette with WeChat green (#07C160),
tight border radius (2-6px), and flat surfaces. Remove glassmorphism.
Add dark mode tokens.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 桌面端 2 栏布局 — ChatContainer 重写

**Files:**
- Rewrite: `frontend/apps/web/src/features/chat/ChatContainer.vue`

- [ ] **Step 1: 重写 ChatContainer 为 2 栏 WeChat 布局**

新的 ChatContainer 结构：

```vue
<template>
  <div class="wechat-layout" :class="{ 'theme-dark': isDark }">
    <!-- 左侧：会话列表 (280px) -->
    <aside class="chat-sidebar" :style="{ width: sidebarWidth + 'px' }">
      <!-- 当前用户区域 -->
      <div class="sidebar-header">
        <el-avatar :src="currentUser.avatar" :size="36" />
        <span class="sidebar-username">{{ currentUser.nickname || currentUser.username }}</span>
      </div>
      <!-- 搜索框 -->
      <div class="sidebar-search">
        <el-input v-model="searchQuery" placeholder="搜索" :prefix-icon="Search" size="small" clearable />
      </div>
      <!-- 会话列表 -->
      <ChatSidebarPanel
        :search-query="searchQuery"
        :active-session-id="activeSessionId"
        @select="handleSessionSelect"
      />
    </aside>

    <!-- 右侧：聊天区 -->
    <main class="chat-main">
      <template v-if="activeSession">
        <!-- Header -->
        <header class="chat-header">
          <div class="chat-header-left">
            <el-avatar :src="activeSession.avatar" :size="32" />
            <span class="chat-header-name">{{ activeSession.name }}</span>
            <span class="status-dot" :class="activeSession.online ? 'status-dot--online' : 'status-dot--offline'" />
          </div>
          <div class="chat-header-right">
            <!-- 加密锁图标（仅加密时显示） -->
            <el-icon v-if="e2eeStatus === 'encrypted'" class="encryption-icon" title="端到端加密">
              <Lock />
            </el-icon>
            <el-dropdown trigger="click" @command="handleChatAction">
              <button class="more-btn"><el-icon><MoreFilled /></el-icon></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="search">搜索消息</el-dropdown-item>
                  <el-dropdown-item command="encryption" v-if="sessionType === 'private'">
                    {{ e2eeStatus === 'encrypted' ? '加密设置' : '开启加密' }}
                  </el-dropdown-item>
                  <el-dropdown-item command="clear">清空聊天</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </header>

        <!-- 消息列表 -->
        <ChatMessageList
          :session-id="activeSessionId"
          :messages="messages"
          :loading-history="loadingHistory"
          @load-history="loadMoreHistory"
        />

        <!-- 输入区 -->
        <ChatComposer
          :session-id="activeSessionId"
          :e2ee-status="e2eeStatus"
          @send="handleSendMessage"
        />
      </template>
      <div v-else class="chat-placeholder">
        <div class="placeholder-logo">💬</div>
        <p>选择一个会话开始聊天</p>
      </div>
    </main>

    <!-- 对话框 -->
    <ChatEncryptionDialog v-model:visible="showEncryptionDialog" :session-id="activeSessionId" :peer-id="peerId" />
    <ChatE2eeNegotiationDialog v-if="pendingNegotiation" v-bind="pendingNegotiation" @accepted="onNegotiationAccepted" @rejected="onNegotiationRejected" />
  </div>
</template>
```

对应的 `<style lang="scss" scoped>`：

```scss
.wechat-layout {
  display: flex;
  height: 100vh;
  background: var(--surface-tertiary);
  font-family: var(--font-sans);
}

// ── 左侧侧边栏 ──
.chat-sidebar {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--surface-secondary);
  border-right: 1px solid var(--border-light);
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  height: 64px;
}

.sidebar-username {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-search {
  padding: 0 var(--space-3) var(--space-3);
}

// ── 右侧聊天区 ──
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--chat-header-height);
  padding: 0 var(--space-4);
  background: var(--surface-secondary);
  border-bottom: 1px solid var(--border-light);
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-header-name {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
}

.chat-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.encryption-icon {
  color: var(--color-primary);
  font-size: 16px;
}

.more-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; border-radius: var(--radius-sm);
  cursor: pointer; color: var(--text-secondary);

  &:hover { background: var(--chat-card-hover); }
}

.chat-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  gap: var(--space-3);

  .placeholder-logo { font-size: 64px; opacity: 0.3; }
  p { font-size: var(--font-size-sm); }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 如果引用了尚不存在的 props，暂时忽略；主要检查 SCSS 编译无误。

- [ ] **Step 3: 提交**

```bash
git add frontend/apps/web/src/features/chat/ChatContainer.vue
git commit -m "refactor(ui): rewrite ChatContainer for WeChat 2-panel desktop layout

Replace 3-panel glassmorphism layout with WeChat-style 2-panel:
280px sidebar (user + search + conversation list) + flex-1 chat area.
Remove SideNavBar import, global search, detail panel.
Simplify header to avatar + name + online dot + encryption lock + more menu.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 微信气泡 — ChatMessageItem 重写

**Files:**
- Rewrite: `frontend/apps/web/src/features/chat/ChatMessageItem.vue`

- [ ] **Step 1: 重写消息气泡为微信风格**

新的气泡结构（单条消息）：

```vue
<template>
  <div
    class="msg-item"
    :class="{
      'msg-item--self': isSelf,
      'msg-item--compact': compact,
      'msg-item--system': message.messageType === 'SYSTEM',
    }"
  >
    <!-- 日期分隔线 -->
    <div v-if="showDateSep" class="msg-date-sep">
      <span>{{ dateLabel }}</span>
    </div>

    <!-- 系统消息 -->
    <div v-if="message.messageType === 'SYSTEM'" class="msg-system">
      {{ message.content }}
    </div>

    <!-- 普通消息 -->
    <template v-else>
      <!-- 对方消息：头像在左 -->
      <el-avatar
        v-if="!isSelf && !compact"
        :src="senderAvatar"
        :size="36"
        class="msg-avatar msg-avatar--left"
      />

      <div class="msg-body" :class="{ 'msg-body--self': isSelf }">
        <!-- 昵称（群聊且非自己且非紧凑模式） -->
        <div v-if="showSenderName && !isSelf && !compact" class="msg-sender">
          {{ message.senderName }}
        </div>

        <!-- 气泡 -->
        <div class="msg-bubble" :class="bubbleClass" @contextmenu.prevent="$emit('contextmenu', $event, message)">
          <!-- 文件消息 -->
          <template v-if="message.messageType === 'FILE'">
            <div class="msg-file">
              <el-icon><Document /></el-icon>
              <span class="msg-file-name">{{ message.extra?.fileName || '文件' }}</span>
              <span class="msg-file-size">{{ formatSize(message.extra?.fileSize) }}</span>
            </div>
          </template>
          <!-- 图片消息 -->
          <el-image
            v-else-if="message.messageType === 'IMAGE'"
            :src="message.mediaUrl"
            :preview-src-list="[message.mediaUrl]"
            fit="cover"
            class="msg-image"
          />
          <!-- 语音消息 -->
          <div v-else-if="message.messageType === 'VOICE'" class="msg-voice" @click="handlePlayVoice">
            <el-icon><Microphone /></el-icon>
            <span>{{ message.extra?.duration || 0 }}"</span>
          </div>
          <!-- 文本消息 -->
          <div v-else class="msg-text">
            <span v-if="message.encrypted && !message.content && !isSelf" class="msg-encrypted">
              加密消息暂无法解密
            </span>
            <span v-else>{{ message.content }}</span>
          </div>
        </div>

        <!-- 时间 + 状态（非紧凑模式） -->
        <div v-if="!compact" class="msg-meta" :class="{ 'msg-meta--self': isSelf }">
          {{ formatTime(message.sendTime) }}
          <span v-if="isSelf" class="msg-status">
            <template v-if="message.status === 'SENDING'">⌛</template>
            <template v-else-if="message.status === 'SENT'">✓</template>
            <template v-else-if="message.status === 'READ'">✓✓</template>
            <template v-else-if="message.status === 'FAILED'">!</template>
          </span>
        </div>
      </div>

      <!-- 自己消息：头像在右 -->
      <el-avatar
        v-if="isSelf && !compact"
        :src="senderAvatar"
        :size="36"
        class="msg-avatar msg-avatar--right"
      />
    </template>
  </div>
</template>
```

对应的 `<style lang="scss" scoped>`：

```scss
.msg-item {
  display: flex;
  align-items: flex-start;
  padding: 0 var(--space-4);
  margin-bottom: var(--space-2);

  &--self { flex-direction: row-reverse; }
  &--compact { margin-bottom: 2px; }
  &--system { justify-content: center; }
}

// ── 日期分隔 ──
.msg-date-sep {
  text-align: center;
  padding: var(--space-2) 0;

  span {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    background: var(--chat-message-area-bg);
    padding: 2px 8px;
    border-radius: 2px;
  }
}

// ── 头像 ──
.msg-avatar {
  flex-shrink: 0;
  margin-top: 0;

  &--left { margin-right: var(--space-2); }
  &--right { margin-left: var(--space-2); }
}

// ── 消息主体 ──
.msg-body {
  max-width: var(--chat-bubble-max-width);
  min-width: 0;
}

// ── 发送者名称 ──
.msg-sender {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-bottom: 2px;
  margin-left: 2px;
}

// ── 气泡 ──
.msg-bubble {
  display: inline-block;
  padding: var(--chat-bubble-padding-y) var(--chat-bubble-padding-x);
  border-radius: var(--chat-bubble-radius);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  word-break: break-word;
  position: relative;

  // 对方气泡：白底
  background: var(--chat-bubble-other);
  color: var(--chat-bubble-other-text);
  border: 0.5px solid var(--border-light);

  .msg-body--self & {
    // 自己气泡：绿底
    background: var(--chat-bubble-own);
    color: var(--chat-bubble-own-text);
    border: none;
  }
}

// ── 图片消息 ──
.msg-image {
  max-width: 240px;
  border-radius: var(--radius-xs);
  display: block;
}

// ── 文件消息 ──
.msg-file {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);

  &-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &-size { color: var(--text-tertiary); font-size: var(--font-size-xs); }
}

// ── 语音消息 ──
.msg-voice {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  cursor: pointer;
  min-width: 60px;
}

// ── 文本 ──
.msg-text { white-space: pre-wrap; }

// ── 加密消息 ──
.msg-encrypted {
  color: var(--text-tertiary);
  font-style: italic;
  font-size: var(--font-size-sm);
}

// ── 元数据（时间 + 状态） ──
.msg-meta {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-top: 2px;

  &--self { text-align: right; }
}

.msg-status {
  margin-left: 2px;
  font-size: 10px;

  .msg-body--self & { color: var(--text-tertiary); }
}

// ── 系统消息 ──
.msg-system {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  padding: var(--space-1) var(--space-4);
}
```

- [ ] **Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

- [ ] **Step 3: 提交**

```bash
git add frontend/apps/web/src/features/chat/ChatMessageItem.vue
git commit -m "refactor(ui): rewrite message bubbles in WeChat style

White bubbles for received, green (#95EC69) for sent, 4px radius,
36px avatars, minimal shadow. Support TEXT/IMAGE/FILE/VOICE/VIDEO/SYSTEM.
Compact mode with hidden avatars for consecutive messages.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 微信风输入区 — ChatComposer 重写

**Files:**
- Rewrite: `frontend/apps/web/src/features/chat/ChatComposer.vue`

- [ ] **Step 1: 简化为微信风格输入区**

新的 Composer 结构（工具栏 + 输入框 + 发送按钮）：

```vue
<template>
  <div class="wechat-composer">
    <!-- 工具栏 -->
    <div class="composer-toolbar">
      <button class="toolbar-btn" title="表情" @click="handleEmoji">
        <el-icon><Smile /></el-icon>
      </button>
      <button class="toolbar-btn" title="发送文件" @click="handleFile">
        <el-icon><Folder /></el-icon>
      </button>
      <button class="toolbar-btn" title="语音" @click="handleVoiceToggle">
        <el-icon><Microphone /></el-icon>
      </button>
    </div>

    <!-- 输入区 -->
    <div class="composer-input-row">
      <textarea
        ref="textareaRef"
        v-model="text"
        class="composer-textarea"
        :placeholder="placeholder"
        rows="1"
        @keydown.enter.exact.prevent="handleSend"
        @input="handleInput"
      />
      <button
        class="send-btn"
        :class="{ 'send-btn--active': text.trim() }"
        :disabled="!text.trim()"
        @click="handleSend"
      >
        发送
      </button>
    </div>
  </div>
</template>
```

对应的 `<style lang="scss" scoped>`：

```scss
.wechat-composer {
  background: var(--chat-composer-bg);
  border-top: 1px solid var(--chat-composer-border);
  padding: var(--space-2) var(--space-4) var(--space-3);
}

// ── 工具栏 ──
.composer-toolbar {
  display: flex;
  gap: 4px;
  margin-bottom: var(--space-2);
}

.toolbar-btn {
  width: var(--chat-composer-toolbar-size);
  height: var(--chat-composer-toolbar-size);
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  transition: background var(--motion-fast);

  &:hover { background: var(--chat-card-hover); }
}

// ── 输入行 ──
.composer-input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.composer-textarea {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  color: var(--text-primary);
  background: var(--surface-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  resize: none;
  outline: none;
  transition: border-color var(--motion-fast);

  &:focus { border-color: var(--color-primary); }

  &::placeholder { color: var(--text-placeholder); }
}

// ── 发送按钮 ──
.send-btn {
  width: 68px;
  height: 40px;
  flex-shrink: 0;
  background: var(--surface-tertiary);
  color: var(--text-tertiary);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--motion-fast);

  &--active {
    background: var(--color-primary);
    color: var(--text-inverse);
  }

  &:hover:not(:disabled) { background: var(--color-primary-dark); }
  &:disabled { cursor: not-allowed; }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

- [ ] **Step 3: 提交**

```bash
git add frontend/apps/web/src/features/chat/ChatComposer.vue
git commit -m "refactor(ui): rewrite composer in WeChat style

Simplified toolbar (emoji/file/voice, all functional), borderless
textarea with focus highlight, green send button. Removed disabled
buttons and excess visual decoration.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 简化会话列表 — ChatSidebarPanel 重写

**Files:**
- Rewrite: `frontend/apps/web/src/features/chat/ChatSidebarPanel.vue`

- [ ] **Step 1: 简化为微信风会话列表**

移除 pin/mute/AI/online 标签，简化为头像 + 昵称 + 预览 + 时间 + 红点：

```vue
<template>
  <div class="session-list" v-loading="loading">
    <div
      v-for="session in sessions"
      :key="session.id"
      class="session-item"
      :class="{ 'session-item--active': session.id === activeSessionId, 'session-item--unread': session.unreadCount > 0 }"
      @click="$emit('select', session.id)"
    >
      <el-badge :hidden="session.unreadCount === 0" is-dot>
        <el-avatar :src="session.avatar" :size="40" />
      </el-badge>
      <div class="session-info">
        <div class="session-top">
          <span class="session-name">{{ session.name }}</span>
          <span class="session-time">{{ formatTime(session.lastMsgTime) }}</span>
        </div>
        <div class="session-preview">
          <span class="session-last-msg">{{ session.lastMsg }}</span>
        </div>
      </div>
    </div>
    <div v-if="sessions.length === 0 && !loading" class="session-empty">
      <p>暂无会话</p>
    </div>
  </div>
</template>
```

对应的 `<style lang="scss" scoped>`：

```scss
.session-list {
  flex: 1;
  overflow-y: auto;
  @extend .chat-soft-scrollbar;
}

.session-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  transition: background var(--motion-fast);
  height: 64px;

  &:hover { background: var(--chat-card-hover); }

  &--active { background: var(--chat-card-active); }
}

.session-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.session-name {
  font-size: var(--font-size-base);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.session-time {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  flex-shrink: 0;
  margin-left: var(--space-2);
}

.session-last-msg {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-empty {
  display: flex;
  justify-content: center;
  padding: var(--space-8);
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

- [ ] **Step 3: 提交**

```bash
git add frontend/apps/web/src/features/chat/ChatSidebarPanel.vue
git commit -m "refactor(ui): simplify conversation list to WeChat style

Remove pin/mute/AI/online tags. Each item shows avatar (40px) +
name + last message preview + time + unread dot only.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 移动端 4 Tab 布局 + 路由调整

**Files:**
- Delete: `frontend/apps/web/src/components/layout/SideNavBar.vue`
- Rewrite: `frontend/apps/web/src/layouts/MobileChatLayout.vue`
- Rewrite: `frontend/apps/web/src/components/mobile/MobileTabBar.vue`
- Modify: `frontend/apps/web/src/router/index.ts`

- [ ] **Step 1: 重写 MobileTabBar 为 4 Tab**

```vue
<template>
  <nav class="mobile-tabbar">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tabbar-item"
      :class="{ 'tabbar-item--active': activeTab === tab.key }"
      @click="$emit('change', tab.key)"
    >
      <span class="tabbar-icon">{{ tab.icon }}</span>
      <span class="tabbar-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style lang="scss" scoped>
.mobile-tabbar {
  display: flex;
  height: var(--mobile-tab-height);
  background: var(--surface-secondary);
  border-top: 1px solid var(--border-light);
  padding-bottom: env(safe-area-inset-bottom);
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
  cursor: pointer;

  &--active { color: var(--color-primary); }
}

.tabbar-icon { font-size: 22px; }
.tabbar-label { font-size: 10px; }
</style>
```

Tabs 数据（在组件内定义）：
```typescript
const tabs = [
  { key: 'chat', icon: '💬', label: '微信' },
  { key: 'contacts', icon: '👤', label: '通讯录' },
  { key: 'moments', icon: '🔍', label: '发现' },
  { key: 'me', icon: '👤', label: '我' },
];
```

- [ ] **Step 2: 重写 MobileChatLayout 适配新 4 Tab**

简化 MobileChatLayout，使用新 MobileTabBar，确保路由 `/chat`, `/contacts`, `/moments`, `/profile` 分别对应 4 个 Tab。

- [ ] **Step 3: 路由调整**

在 `router/index.ts` 中：
- 移除 `/groups` 路由（功能并入 `/contacts`）
- 确保 `/chat`, `/contacts`, `/moments`, `/profile` 4 个路由正常工作

- [ ] **Step 4: 删除 SideNavBar**

```bash
rm frontend/apps/web/src/components/layout/SideNavBar.vue
```

同时清理所有对 `SideNavBar` 的导入。

- [ ] **Step 5: 类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

- [ ] **Step 6: 提交**

```bash
git add frontend/apps/web/src/components/mobile/MobileTabBar.vue \
        frontend/apps/web/src/layouts/MobileChatLayout.vue \
        frontend/apps/web/src/router/index.ts
git rm frontend/apps/web/src/components/layout/SideNavBar.vue
git commit -m "refactor(ui): replace 5-tab mobile nav with WeChat 4-Tab layout

Chat/Contacts/Moments/Me tabs. Remove SideNavBar (desktop now uses
inline sidebar). Merge Groups into Contacts tab.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 集成 + 构建验证

**Files:**
- Modify: `frontend/apps/web/src/App.vue`

- [ ] **Step 1: 清理 App.vue**

移除 `body-mobile` class 的 toggle（移动端检测逻辑保留，但样式类简化）。
移除 `glassmorphism.scss` 的导入引用。

- [ ] **Step 2: 清理 `styles/index.scss` 中的 glassmorphism 导入（如未在 Task 1 处理）**

- [ ] **Step 3: 完整类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零错误。

- [ ] **Step 4: 生产构建验证**

```bash
cd frontend && npm run web:build
```

Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(ui): final integration cleanup for WeChat UI

Remove glassmorphism references, clean up App.vue, final wiring.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
