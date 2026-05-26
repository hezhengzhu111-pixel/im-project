# Web 信息架构 + 密度优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决桌面端信息密度低、留白过大、分栏关系不清晰的问题，把设置/AI/朋友圈改成真正 Web 布局

**Architecture:** 6 层顺序推进：密度变量收敛 → Settings 模板重组 → AiSettings 双栏 → Moments Web 化 → Profile 微调 → Chat 暗色修复

**Tech Stack:** Vue 3 + TypeScript + SCSS + Element Plus

**总原则：本轮视觉目标不是"更炫"，而是"更像桌面 Web 产品"——信息更紧凑、分组更清楚、空白更少、玻璃更克制。**

---

## 文件结构

| 文件 | 职责 | 修改类型 |
|------|------|---------|
| `styles/fresh-glass.scss` | 密度变量 + .fresh-glass-card 收敛 | 新增变量 + 修改 class |
| `pages/Settings.vue` | 左侧导航 + 右侧分组 section/row | **模板重组** + 样式重写 |
| `pages/AiSettings.vue` | BEM 类 + grid 双栏 + wrapper | 模板（加类/包装） + 样式 |
| `features/moments/MomentsContainer.vue` | 宽度/列宽/align-start/sticky | 样式 |
| `features/moments/MomentsCover.vue` | 桌面端高度 220px | 样式 |
| `features/moments/MomentsFeed.vue` | transparent bg + flex gap | 样式 |
| `features/moments/MomentsPostCard.vue` | 玻璃卡片 Web 化 + 移动端保留 | 样式 |
| `pages/Profile.vue` | max-width/sticky/间距 | 样式 |
| `features/chat/ChatMessageList.vue` | 暗色背景微调 | 样式 |

---

### Task 1: Fresh Glass 密度变量收敛

**Files:**
- Modify: `frontend/apps/web/src/styles/fresh-glass.scss`

- [ ] **Step 1: 新增密度变量**

在 `:root` 块末尾（`}` 之前）添加：
```scss
  // 密度与半径
  --fresh-radius-page: 20px;
  --fresh-radius-card: 16px;
  --fresh-radius-control: 10px;
  --fresh-section-gap: 14px;
  --fresh-row-height: 58px;
```

- [ ] **Step 2: 收敛 .fresh-glass-card — 默认无 hover，仅 .is-interactive 有**

修改 `.fresh-glass-card` 和 `&.is-interactive`：
```scss
.fresh-glass-card {
  position: relative;
  z-index: 1;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  box-shadow: var(--fresh-glass-shadow-soft);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  border-radius: var(--fresh-radius-page);

  &.is-interactive {
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: var(--fresh-glass-shadow);
    }
  }
}
```

关键变化：`border-radius: 20px` 改为 `var(--fresh-radius-page)`；hover `-2px` 改为 `-1px`。

- [ ] **Step 3: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/styles/fresh-glass.scss
git commit -m "refactor(theme): add density variables, converge fresh-glass-card hover to is-interactive only

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Settings 页模板重组 — 左侧导航 + 右侧分组

**Files:**
- Modify: `frontend/apps/web/src/pages/Settings.vue`

**CRITICAL: 只允许重排 template 和 style，不允许重写 `<script setup>`。不改任何 store、watch、onMounted、update 函数、事件处理、data 绑定。**

- [ ] **Step 1: 读取当前文件，确认 script 不动**

先读取 Settings.vue，确认 `<script setup>` 的内容。本次只改 template 和 style。

- [ ] **Step 2: 替换 template**

将整个 `<template>` 块替换为以下结构（**所有事件绑定、v-model、v-for、函数引用保持原样，只改 HTML 结构和 class**）：

```html
<template>
  <div class="settings-page fresh-page">
    <div class="settings-shell">
      <!-- 左侧导航面板 -->
      <aside class="settings-nav-panel">
        <div class="nav-user">
          <el-avatar :size="40" :src="userStore.avatar">
            {{ avatarText }}
          </el-avatar>
          <span class="nav-username">{{ userDisplayName }}</span>
        </div>
        <nav class="nav-items">
          <button type="button" class="nav-item">账号</button>
          <button type="button" class="nav-item">外观</button>
          <button type="button" class="nav-item">通知</button>
          <button type="button" class="nav-item">隐私</button>
          <button type="button" class="nav-item">存储</button>
          <button type="button" class="nav-item" @click="router.push('/settings/ai')">AI</button>
        </nav>
        <button type="button" class="logout-button nav-logout" :disabled="loggingOut" @click="logout">
          <el-icon><SwitchButton /></el-icon>
          <span>{{ t("settings.logout") }}</span>
        </button>
      </aside>

      <!-- 右侧主区域 -->
      <main class="settings-main">
        <!-- Hero -->
        <header class="settings-hero">
          <button type="button" class="icon-button" :aria-label="t('settings.back')" @click="router.back()">
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <div class="hero-copy">
            <h1>{{ t("settings.title") }}</h1>
            <p>{{ t("settings.subtitle") }}</p>
          </div>
        </header>

        <!-- 账号 section -->
        <section class="setting-section account-section" @click="router.push('/profile')">
          <div class="account-row">
            <el-avatar :size="44" :src="userStore.avatar">{{ avatarText }}</el-avatar>
            <div class="account-info">
              <div class="account-name">{{ userDisplayName }}</div>
              <div class="account-desc">查看和编辑个人资料</div>
            </div>
            <el-icon class="account-arrow"><ArrowRight /></el-icon>
          </div>
        </section>

        <!-- 偏好 section -- 语言 + 主题 -->
        <section class="setting-section">
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-title">语言</div>
              <div class="setting-desc">{{ localeName }}</div>
            </div>
            <div class="segmented-control">
              <button v-for="option in localeOptions" :key="option.value" type="button" :class="{ active: locale === option.value }" @click="setLocale(option.value)">
                {{ option.label }}
              </button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-title">{{ t("settings.theme") }}</div>
              <div class="setting-desc">{{ t("settings.themeDesc") }}</div>
            </div>
            <div class="segmented-control">
              <button v-for="option in themeOptions" :key="option.value" type="button" :class="{ active: theme === option.value }" @click="theme = option.value">
                {{ option.label }}
              </button>
            </div>
          </div>
        </section>

        <!-- 通知 section -->
        <section class="setting-section">
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-title">{{ t("settings.notifications") }}</div>
            </div>
            <el-switch v-model="notificationEnabled" size="large" @change="updateMessageSetting('enableNotification', Boolean($event))" />
          </div>
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-title">{{ t("settings.sound") }}</div>
            </div>
            <el-switch v-model="soundEnabled" size="large" @change="updateMessageSetting('enableSound', Boolean($event))" />
          </div>
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-title">{{ t("settings.insecureVoice") }}</div>
              <div class="setting-desc">{{ t("settings.insecureVoiceDesc") }}</div>
            </div>
            <el-switch v-model="allowInsecureVoiceRecording" size="large" @change="updateInsecureVoiceSetting(Boolean($event))" />
          </div>
        </section>

        <!-- 隐私 section -->
        <section class="setting-section">
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-title">{{ t("settings.readReceipt") }}</div>
              <div class="setting-desc">{{ t("settings.readReceiptDesc") }}</div>
            </div>
            <el-switch v-model="readReceiptEnabled" size="large" @change="updatePrivacySetting('messageReadReceipt', Boolean($event))" />
          </div>
        </section>

        <!-- 存储 + AI 双卡片 -->
        <div class="setting-grid-2">
          <section class="setting-section">
            <div class="setting-row" style="border-bottom:none">
              <div class="setting-label">
                <div class="setting-title">{{ t("settings.clearCache") }}</div>
                <div class="setting-desc">{{ t("settings.clearCacheDesc") }}</div>
              </div>
              <button type="button" class="flat-button" @click="clearCache">{{ t("settings.clearCache") }}</button>
            </div>
          </section>
          <section class="setting-section is-interactive" @click="router.push('/settings/ai')">
            <div class="setting-row" style="border-bottom:none">
              <div class="setting-label">
                <div class="setting-title">{{ t("settings.aiAssistant") }}</div>
                <div class="setting-desc">{{ t("settings.aiAssistantDesc") }}</div>
              </div>
              <el-icon class="account-arrow"><ArrowRight /></el-icon>
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 添加 ArrowRight 图标到 import**

在 `<script setup>` 的 import 中添加 `ArrowRight`（如果尚未导入）：
```typescript
import { ArrowLeft, ArrowRight, SwitchButton } from "@element-plus/icons-vue";
```

- [ ] **Step 4: 完全替换 style**

将 `<style scoped lang="scss">` 块整体替换为：

```scss
.settings-page {
  min-height: 100%;
  padding: 28px;
  overflow-y: auto;
}

.settings-shell {
  width: min(1180px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

// ── 左侧导航面板 ──
.settings-nav-panel {
  position: sticky;
  top: 28px;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  border-radius: var(--fresh-radius-page);
  padding: 20px 16px;
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  box-shadow: var(--fresh-glass-shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-username {
  font-size: 15px;
  font-weight: 600;
  color: var(--fresh-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-radius: var(--fresh-radius-control);
  background: transparent;
  color: var(--fresh-text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: default;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.40);
    color: var(--fresh-text);
  }
}

.nav-logout {
  margin-top: auto;
  width: 100%;
  justify-content: center;
}

// ── 右侧主区域 ──
.settings-main {
  min-width: 0;
}

.settings-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 72px;
  padding: 0 4px;
  margin-bottom: 14px;
}

.hero-copy h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--fresh-text);
}

.hero-copy p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--fresh-text-muted);
}

// ── Section 容器 ──
.setting-section {
  border-radius: var(--fresh-radius-page);
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  box-shadow: var(--fresh-glass-shadow-soft);
  margin-bottom: var(--fresh-section-gap);
  overflow: hidden;

  &.is-interactive {
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: var(--fresh-glass-shadow);
    }
  }
}

.setting-row {
  min-height: var(--fresh-row-height);
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.38);

  &:last-child {
    border-bottom: none;
  }
}

.setting-label {
  min-width: 0;
  flex: 1;
  padding-right: 16px;
}

.setting-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fresh-text);
}

.setting-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--fresh-text-muted);
}

.setting-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--fresh-section-gap);
}

// ── 账号卡片 ──
.account-section {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--fresh-glass-shadow);
  }
}

.account-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
}

.account-info {
  flex: 1;
  min-width: 0;
}

.account-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--fresh-text);
}

.account-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--fresh-text-muted);
}

.account-arrow {
  flex-shrink: 0;
  color: var(--fresh-text-muted);
  font-size: 18px;
}

// ── Segmented control ──
.segmented-control {
  flex-shrink: 0;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--fresh-radius-control);
  background: rgba(255, 255, 255, 0.42);

  button {
    min-width: 64px;
    min-height: 30px;
    padding: 0 10px;
    background: transparent;
    color: var(--fresh-text-muted);
    font-weight: 600;
    font-size: 13px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  button.active {
    background: linear-gradient(135deg, rgba(167, 243, 208, 0.9), rgba(186, 230, 253, 0.8));
    color: var(--fresh-text);
    box-shadow: 0 4px 14px rgba(7, 193, 96, 0.10);
  }
}

// ── Buttons ──
.icon-button {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--fresh-glass-border);
  border-radius: var(--fresh-radius-control);
  background: var(--fresh-glass-bg);
  color: var(--fresh-text);
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    background: var(--fresh-glass-bg-strong);
  }
}

.logout-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--fresh-radius-control);
  background: rgba(255, 255, 255, 0.42);
  color: var(--fresh-text);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover:not(:disabled) {
    background: rgba(7, 193, 96, 0.12);
    color: var(--fresh-green);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.flat-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--fresh-radius-control);
  background: rgba(255, 255, 255, 0.42);
  color: var(--fresh-text);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    background: rgba(7, 193, 96, 0.10);
    color: var(--fresh-green);
  }
}

// ── 移动端 ──
@media (max-width: 860px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }

  .settings-nav-panel {
    display: none;
  }

  .setting-grid-2 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .settings-page {
    padding: 16px;
  }

  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}
```

- [ ] **Step 5: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: zero errors（所有 v-model、函数引用保持原样）

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/src/pages/Settings.vue
git commit -m "refactor(settings): restructure to Web Preferences — left nav 220px + right grouped sections with setting-row

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: AiSettings 双栏重构

**Files:**
- Modify: `frontend/apps/web/src/pages/AiSettings.vue`

- [ ] **Step 1: 给 section 加 BEM 修饰类 + 新增 wrapper div**

读取文件。在 template 中：

**给现有 `<section class="settings-card">` 加 class：**
- API Key 描述 section → 加 `ai-section ai-section--keys`
- 空状态 card → 加 `ai-section ai-section--keys`
- 每个 key card → 加 `ai-section ai-section--keys`
- 添加 Key section → 加 `ai-section ai-section--add-key`
- 自动回复 section → 加 `ai-section ai-section--auto-reply`
- Persona section → 加 `ai-section ai-section--auto-reply`

**用 wrapper 包裹 `<main class="settings-content">` 的内容：**

在 `<main class="settings-content">` 内部，用 `<div class="ai-main-column">` 包裹左侧内容、`<div class="ai-side-column">` 包裹右侧内容：

```html
<main class="settings-content">
  <div class="ai-main-column">
    <!-- Key 描述、空状态、key 列表、添加 Key 表单 -->
  </div>
  <div class="ai-side-column">
    <!-- 自动回复 + Persona -->
  </div>
</main>
```

- [ ] **Step 2: 修改 CSS**

替换/修改 `<style lang="scss" scoped>` 中的关键块：

```scss
.ai-settings-page {
  min-height: 100vh;
  padding: 28px;
  max-width: 1180px;
  margin: 0 auto;
  background: var(--fresh-page-bg);
}

.settings-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  height: 60px;
}

.settings-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 18px;
  align-items: start;
}

.ai-main-column,
.ai-side-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  border-radius: var(--fresh-radius-page);
  padding: 20px;
  flex-wrap: wrap;
  box-shadow: var(--fresh-glass-shadow-soft);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);

  &.key-card {
    padding-bottom: 12px;
  }
}
```

保持移动端媒体查询不变，添加：
```scss
@media (max-width: 860px) {
  .settings-content {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/pages/AiSettings.vue
git commit -m "refactor(ai-settings): two-column grid with BEM sections and wrapper columns

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Moments Web 优化 — Container + Cover + Feed + PostCard

**Files (4 files):**
- Modify: `frontend/apps/web/src/features/moments/MomentsContainer.vue` — 宽度/列宽/align-start/sticky/嵌入断点
- Modify: `frontend/apps/web/src/features/moments/MomentsCover.vue` — 桌面端高度 220px
- Modify: `frontend/apps/web/src/features/moments/MomentsFeed.vue` — transparent bg + flex gap
- Modify: `frontend/apps/web/src/features/moments/MomentsPostCard.vue` — 玻璃卡片 Web 化 + 移动端保留

- [ ] **Step 1: MomentsContainer.vue — 布局调整**

读取文件。修改 scoped style 中的关键值：

```scss
.moments-container {
  width: min(1040px, 100%);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding: 20px;
  display: grid;
  grid-template-columns: minmax(0, 680px) 280px;
  gap: 16px;
  background: transparent;
  align-items: start;
}

.moments-main-panel {
  // ... 保留现有
  border-radius: var(--fresh-radius-page);
}

.moments-side-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: start;
  position: sticky;
  top: 20px;
  // 不允许 min-height/height/flex:1
}
```

**嵌入聊天时（≤1180px）隐藏右侧：**
```scss
@media (max-width: 1180px) {
  .moments-container {
    grid-template-columns: minmax(0, 680px);
    justify-content: center;
  }

  .moments-side-panel {
    display: none;
  }
}
```

- [ ] **Step 2: MomentsCover.vue — 桌面端压缩高度**

在 `<style scoped lang="scss">` 中添加：
```scss
@media (min-width: 769px) {
  .moments-cover {
    height: 220px;
  }
}
```

- [ ] **Step 3: MomentsFeed.vue — transparent + flex gap**

修改 `.moments-feed`：
```scss
.moments-feed {
  flex: 1;
  background: transparent;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
```

- [ ] **Step 4: MomentsPostCard.vue — Web 卡片样式**

读取文件。修改 CSS（保留 template 和 script 不变）：

```scss
.moments-post-card {
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(31, 41, 55, 0.06);
  backdrop-filter: blur(16px) saturate(1.25);
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 32px rgba(31, 41, 55, 0.08);
  }
}

.post-layout {
  display: flex;
  gap: 12px;
  padding: 0;
}

.post-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex-shrink: 0;
  object-fit: cover;
  cursor: pointer;
  border: 2px solid #FFFFFF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.post-main {
  flex: 1;
  min-width: 0;
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: none;
}

.post-nickname {
  font-size: 15px;
  font-weight: 700;
  color: var(--fresh-text);
  line-height: 1.4;
  margin-bottom: 4px;
  cursor: pointer;
}

.post-content {
  font-size: 15px;
  line-height: 1.6;
  color: var(--fresh-text);
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.media-grid {
  gap: 6px;
  border-radius: 14px;
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
  padding: 8px 12px;

  &::before {
    border-bottom-color: rgba(255, 255, 255, 0.58);
  }
}

// 移动端恢复微信风格
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
```

- [ ] **Step 5: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsContainer.vue frontend/apps/web/src/features/moments/MomentsCover.vue frontend/apps/web/src/features/moments/MomentsFeed.vue frontend/apps/web/src/features/moments/MomentsPostCard.vue
git commit -m "refactor(moments): optimize web layout — tighter grid, shorter cover, glass post cards

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Profile 微调

**Files:**
- Modify: `frontend/apps/web/src/pages/Profile.vue`

- [ ] **Step 1: CSS 微调**

读取文件，修改以下 CSS 属性：

```scss
.profile-shell {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.profile-hero {
  // ... 保留现有
  padding: 14px 18px;
}

.side-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 28px;
}

// 收紧 form label 间距
.profile-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.profile-form :deep(.el-form-item__label) {
  margin-bottom: 2px;
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/pages/Profile.vue
git commit -m "refactor(profile): micro-tweaks — max-width 1180, sticky side stack, tighter spacing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Chat 暗色模式消息区修整

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatMessageList.vue`

- [ ] **Step 1: 暗色主题下消息区背景改为深蓝黑渐变**

在 `<style scoped lang="scss">` 中，于 `.theme-dark` 选择器下或在现有暗色处理中添加：

```scss
.theme-dark .message-list,
.theme-dark :deep(.message-list) {
  background:
    linear-gradient(180deg, rgba(18, 24, 27, 0.62), rgba(14, 20, 22, 0.42) 60%),
    #0d1418;
}
```

如果 `.theme-dark` 不在当前文件 scope 内，改用 `:global(.theme-dark) .message-list` 或添加全局选择器：

```scss
:global(.theme-dark) & {
  background:
    linear-gradient(180deg, rgba(18, 24, 27, 0.62), rgba(14, 20, 22, 0.42) 60%),
    #0d1418;
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatMessageList.vue
git commit -m "refactor(chat): dark mode message area — deep blue-black gradient instead of solid gray

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 最终验证

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 2: Production 构建**

```bash
cd frontend && npm run web:build
```

- [ ] **Step 3: 如有失败，修正并提交**

---

## 执行顺序

```
Task 1 (密度变量) → Task 2 (Settings 重组) → Task 3 (AI Settings 双栏)
                                                      ↓
                                            Task 4 (Moments Web 化)
                                                      ↓
                                            Task 5 (Profile 微调)
                                                      ↓
                                            Task 6 (Chat 暗色修复)
                                                      ↓
                                            Task 7 (最终验证)
```
