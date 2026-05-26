# Fresh Glass 统一视觉升级 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立"小清新 + 毛玻璃 + 液体光影"统一 Web 设计语言，覆盖所有非聊天页面和聊天页背景

**Architecture:** 新建 `fresh-glass.scss` 作为样式基础设施（CSS 变量 + 通用 class），各页面引用这些变量替换现有的 `--chat-glass-blur: none` 和 `rgba(37,99,235,...)` 后台蓝。7 层顺序执行。

**Tech Stack:** Vue 3 + TypeScript + SCSS + Element Plus

---

## 文件结构

| 文件 | 职责 | 修改类型 |
|------|------|---------|
| `styles/fresh-glass.scss` | 设计语言基础设施 — --fresh-* 变量 + .fresh-page + .fresh-glass-card | **新建** |
| `styles/index.scss` | 样式入口 — 引入 fresh-glass | 添加 1 行 |
| `features/moments/MomentsContainer.vue` | 朋友圈容器 — grid 两栏 + 侧面板 + 玻璃 + 嵌入兼容 | 模板 + 样式 |
| `pages/Settings.vue` | 设置页 — 玻璃卡片 + 去蓝化 + segmented-control | 样式 |
| `pages/Profile.vue` | 个人资料页 — 玻璃卡片 + 头像光晕 + 绿色 focus | 样式 |
| `pages/AiSettings.vue` | AI 设置页 — 页面背景 + 复用设置页样式类名 | 样式 |
| `features/chat/ChatContainer.vue` | 聊天容器 — 背景渐变 + 玻璃增强 | 样式 |
| `features/chat/ChatMessageList.vue` | 消息列表 — 背景微调 | 样式 |
| `features/chat/ChatComposer.vue` | 输入区 — 玻璃增强 | 样式 |

---

### Task 1: 新建 fresh-glass.scss 样式基础设施

**Files:**
- Create: `frontend/apps/web/src/styles/fresh-glass.scss`

- [ ] **Step 1: 创建 fresh-glass.scss 文件，包含完整亮色/暗色变量和通用 class**

```scss
// ============================================
// Fresh Glass Design System
// 小清新 + 毛玻璃 + 液体光影 统一视觉语言
// ============================================

// ── 亮色主题 ──
:root {
  // 页面背景（多层径向渐变）
  --fresh-page-bg:
    radial-gradient(circle at 8% 8%, rgba(167, 243, 208, 0.38), transparent 28%),
    radial-gradient(circle at 88% 12%, rgba(186, 230, 253, 0.34), transparent 30%),
    radial-gradient(circle at 58% 92%, rgba(221, 214, 254, 0.26), transparent 34%),
    linear-gradient(135deg, #f7fbff 0%, #f4fff9 45%, #fffafc 100%);

  // 玻璃面板
  --fresh-glass-bg: rgba(255, 255, 255, 0.62);
  --fresh-glass-bg-strong: rgba(255, 255, 255, 0.78);
  --fresh-glass-border: rgba(255, 255, 255, 0.58);
  --fresh-glass-shadow: 0 18px 50px rgba(31, 41, 55, 0.10);
  --fresh-glass-shadow-soft: 0 8px 24px rgba(31, 41, 55, 0.07);
  --fresh-blur: blur(22px) saturate(1.45);

  // 色彩
  --fresh-green: #07c160;
  --fresh-mint: #a7f3d0;
  --fresh-sky: #bae6fd;
  --fresh-lavender: #ddd6fe;

  // 文字
  --fresh-text: #12201a;
  --fresh-text-muted: rgba(18, 32, 26, 0.58);
}

// ── 暗色主题 ──
.theme-dark {
  --fresh-page-bg:
    radial-gradient(circle at 10% 8%, rgba(7, 193, 96, 0.20), transparent 30%),
    radial-gradient(circle at 88% 10%, rgba(80, 200, 255, 0.14), transparent 32%),
    linear-gradient(135deg, #07110d 0%, #0b141f 54%, #101018 100%);

  --fresh-glass-bg: rgba(18, 24, 27, 0.58);
  --fresh-glass-bg-strong: rgba(24, 30, 34, 0.76);
  --fresh-glass-border: rgba(255, 255, 255, 0.10);
  --fresh-glass-shadow: 0 18px 60px rgba(0, 0, 0, 0.36);
  --fresh-glass-shadow-soft: 0 8px 28px rgba(0, 0, 0, 0.24);
  --fresh-text: #eefaf3;
  --fresh-text-muted: rgba(238, 250, 243, 0.58);
}

// ── 通用页面容器 ──
.fresh-page {
  min-height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--fresh-page-bg);

  &::before,
  &::after {
    content: "";
    position: fixed;
    pointer-events: none;
    border-radius: 999px;
    filter: blur(48px);
    opacity: 0.45;
    z-index: 0;
  }

  &::before {
    width: 420px;
    height: 420px;
    background: radial-gradient(circle, rgba(167, 243, 208, 0.28), transparent 65%);
    top: -80px;
    right: -60px;
  }

  &::after {
    width: 380px;
    height: 380px;
    background: radial-gradient(circle, rgba(186, 230, 253, 0.24), transparent 65%);
    bottom: -60px;
    left: 120px;
  }
}

// ── 通用玻璃卡片 ──
.fresh-glass-card {
  position: relative;
  z-index: 1;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  box-shadow: var(--fresh-glass-shadow-soft);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  border-radius: 20px;

  &.is-interactive {
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--fresh-glass-shadow);
    }
  }
}
```

- [ ] **Step 2: 在 index.scss 中引入 fresh-glass.scss**

在 `frontend/apps/web/src/styles/index.scss` 中，于 `@use 'chat-theme';` 之后添加一行：
```scss
@use 'fresh-glass';
```

- [ ] **Step 3: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: zero errors（纯 SCSS 新增，不涉及 TS 类型）

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/styles/fresh-glass.scss frontend/apps/web/src/styles/index.scss
git commit -m "feat(theme): add Fresh Glass design system — CSS variables, .fresh-page, .fresh-glass-card

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 朋友圈 Web 化 — MomentsContainer.vue

**Files:**
- Modify: `frontend/apps/web/src/features/moments/MomentsContainer.vue`

- [ ] **Step 1: 重写模板结构**

读取当前文件，将模板替换为两栏 grid 布局。右侧面板数据使用已有 computed（`avatar`, `nickname`, `coverPhoto`）：

```html
<template>
  <div class="moments-page-wrapper fresh-page">
    <div class="moments-container">
      <!-- 左侧主面板 -->
      <div class="moments-main-panel">
        <div ref="topbarRef" class="moments-topbar">
          <span class="topbar-title">朋友圈</span>
          <el-icon class="topbar-camera" @click="showComposer = true">
            <Camera />
          </el-icon>
        </div>

        <div ref="scrollRef" class="moments-scroll" @scroll="handleScroll">
          <MomentsCover
            :cover-photo="coverPhoto"
            :avatar="avatar"
            :nickname="nickname"
          />
          <MomentsFeed />
        </div>
      </div>

      <!-- 右侧面板（桌面端可见） -->
      <aside class="moments-side-panel">
        <div class="fresh-glass-card side-profile-card">
          <el-avatar :src="avatar" :size="64" class="side-avatar">
            {{ nickname?.[0] || 'U' }}
          </el-avatar>
          <div class="side-nickname">{{ nickname || '用户' }}</div>
          <button class="side-post-btn" @click="showComposer = true">
            <el-icon><Camera /></el-icon>
            <span>发布动态</span>
          </button>
        </div>
        <div class="fresh-glass-card side-tip-card">
          <p>分享你的生活瞬间</p>
          <p class="tip-muted">照片、文字、视频都可以发布到朋友圈</p>
        </div>
      </aside>
    </div>

    <!-- 发布动态抽屉 -->
    <el-drawer v-model="showComposer" title="发布动态" :size="drawerSize" direction="btt">
      <MomentsComposer @close="showComposer = false" />
    </el-drawer>
  </div>
</template>
```

- [ ] **Step 2: 重写样式 — 桌面端 grid 布局**

替换 `<style scoped lang="scss">` 块为：

```scss
.moments-page-wrapper {
  width: 100%;
  min-height: 100vh;
  display: flex;
  justify-content: center;
}

.moments-container {
  width: min(1120px, 100%);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  grid-template-columns: minmax(0, 720px) 320px;
  gap: 20px;
  background: transparent;
}

// 左侧主面板 — 玻璃卡片
.moments-main-panel {
  display: flex;
  flex-direction: column;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  border-radius: 24px;
  overflow: hidden;
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  min-height: 0;
}

// 右侧面板 — 桌面端显示
.moments-side-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.side-profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 20px;
  text-align: center;
}

.side-avatar {
  border-radius: 16px;
}

.side-nickname {
  font-size: 16px;
  font-weight: 600;
  color: var(--fresh-text);
}

.side-post-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: none;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--fresh-green), var(--fresh-mint));
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(7, 193, 96, 0.22);
  }
}

.side-tip-card {
  padding: 18px 20px;

  p {
    margin: 0;
    font-size: 14px;
    color: var(--fresh-text);
    font-weight: 500;
  }

  .tip-muted {
    margin-top: 6px;
    font-size: 12px;
    color: var(--fresh-text-muted);
    font-weight: 400;
  }
}

// topbar（保留原有 sticky 逻辑）
.moments-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  height: var(--moments-topbar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background: rgba(255, 255, 255, var(--topbar-bg-opacity, 0));
  border-bottom: 1px solid rgba(236, 236, 236, var(--topbar-border-opacity, 0));
  backdrop-filter: blur(var(--topbar-blur, 0px));
  -webkit-backdrop-filter: blur(var(--topbar-blur, 0px));
}

.topbar-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-inverse);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.topbar-camera {
  position: absolute;
  right: 16px;
  font-size: 22px;
  color: var(--text-inverse);
  cursor: pointer;
  padding: 4px;
}

.moments-topbar.is-solid {
  .topbar-title {
    color: var(--fresh-text);
    text-shadow: none;
  }
  .topbar-camera {
    color: var(--fresh-text);
  }
}

.moments-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
}

// ── 移动端 ──
@media (max-width: 768px) {
  .moments-page-wrapper {
    background: var(--moments-bg);
  }

  .moments-container {
    max-width: 100%;
    padding: 0;
    grid-template-columns: 1fr;
    gap: 0;
  }

  .moments-main-panel {
    border-radius: 0;
    border: none;
    background: var(--moments-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .moments-side-panel {
    display: none;
  }

  .topbar-title {
    font-size: 16px;
  }
}
```

- [ ] **Step 3: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsContainer.vue
git commit -m "refactor(moments): redesign MomentsContainer to web grid layout with glass side panel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 设置页 Web 化 — Settings.vue

**Files:**
- Modify: `frontend/apps/web/src/pages/Settings.vue`

- [ ] **Step 1: 更新页面背景、卡片玻璃、kicker 颜色**

修改 `<style scoped lang="scss">` 中的关键块：

**页面背景和 hero/卡片：**

```scss
.settings-page {
  min-height: 100%;
  padding: 28px;
  overflow-y: auto;
  background: var(--fresh-page-bg);
}

.settings-hero,
.settings-card {
  border: 1px solid var(--fresh-glass-border);
  background: var(--fresh-glass-bg);
  box-shadow: var(--fresh-glass-shadow-soft);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
}

.settings-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  max-width: 1120px;
  margin: 0 auto 18px;
  padding: 18px;
  border-radius: 22px;
}

.settings-content {
  max-width: 1120px;
  // ... 其余不变
}

.settings-card {
  // ... 保持现有属性
  border-radius: 22px;
}

.settings-kicker {
  color: var(--fresh-green);
  // ... 其余不变
}
```

**segmented-control（语言/主题切换）：**

```scss
.segmented-control {
  flex-shrink: 0;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.42);
}

.segmented-control button {
  min-width: 72px;
  min-height: 32px;
  padding: 0 10px;
  background: transparent;
  color: var(--fresh-text-muted);
  font-weight: 700;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.segmented-control button.active {
  background: linear-gradient(135deg, rgba(167, 243, 208, 0.9), rgba(186, 230, 253, 0.8));
  color: var(--fresh-text);
  box-shadow: 0 4px 14px rgba(7, 193, 96, 0.12);
}
```

**可交互卡片 hover：**

```scss
.account-card {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--fresh-glass-shadow);
  }
}

.ai-card {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--fresh-glass-shadow);
  }
}
```

**移除旧卡片 hover 蓝色 border：**

删除或修改：
```scss
// 删除这行
.settings-card:hover {
  border-color: rgba(37, 99, 235, 0.28);
}
```

**按钮去蓝化：**

```scss
.logout-button:hover,
.flat-button:hover,
.icon-button:hover {
  transform: translateY(-1px);
  color: var(--fresh-green);
  background: rgba(7, 193, 96, 0.10);
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/pages/Settings.vue
git commit -m "refactor(settings): apply Fresh Glass — glass cards, green accent, gradient segmented-control

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 个人资料页 Web 化 — Profile.vue

**Files:**
- Modify: `frontend/apps/web/src/pages/Profile.vue`

- [ ] **Step 1: 更新页面背景和玻璃卡片**

修改 CSS 关键块：

**页面背景：**

```scss
.profile-page {
  min-height: 100%;
  overflow-y: auto;
  padding: 28px;
  background: var(--fresh-page-bg);
}
```

**玻璃卡片替换：**

```scss
.glass-card {
  border: 1px solid var(--fresh-glass-border);
  border-radius: 22px;
  background: var(--fresh-glass-bg);
  box-shadow: var(--fresh-glass-shadow-soft);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
}
```

**头像光晕：**

```scss
.profile-avatar {
  border: 1px solid var(--fresh-glass-border);
  border-radius: 16px;
  background: var(--surface-primary);
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.45),
    0 18px 36px rgba(7, 193, 96, 0.16);
}
```

**按钮 primary 绿色渐变：**

```scss
.avatar-button,
.primary-button {
  min-height: 36px;
  padding: 0 14px;
  background: linear-gradient(135deg, var(--fresh-green), var(--fresh-mint));
  color: #fff;
  box-shadow: 0 8px 22px rgba(7, 193, 96, 0.18);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.avatar-button:hover,
.primary-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(7, 193, 96, 0.24);
}
```

**按钮 secondary 和 hover 去蓝化：**

```scss
.secondary-button:hover,
.mini-button:hover,
.icon-button:hover {
  transform: translateY(-1px);
  color: var(--fresh-green);
  background: rgba(7, 193, 96, 0.10);
}
```

**表单 focus 绿色 glow：**

```scss
.profile-form :deep(.el-input__wrapper.is-focus),
.profile-form :deep(.el-textarea__inner:focus) {
  box-shadow:
    0 0 0 1px rgba(7, 193, 96, 0.48) inset,
    0 0 0 3px rgba(7, 193, 96, 0.12);
}
```

**表单输入框背景：**

```scss
.profile-form :deep(.el-input__wrapper),
.profile-form :deep(.el-textarea__inner) {
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 0 0 1px var(--fresh-glass-border) inset;
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/pages/Profile.vue
git commit -m "refactor(profile): apply Fresh Glass — avatar glow, green focus, gradient primary button

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: AiSettings.vue — 页面背景统一

**Files:**
- Modify: `frontend/apps/web/src/pages/AiSettings.vue`

- [ ] **Step 1: 更新页面背景和卡片样式**

修改 `<style lang="scss" scoped>` 中的关键块：

**页面背景：**

```scss
.ai-settings-page {
  min-height: 100vh;
  padding: 28px;
  max-width: 1120px;
  margin: 0 auto;
  background: var(--fresh-page-bg);
}
```

**卡片玻璃化：**

```scss
.settings-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  border-radius: 22px;
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

**kicker 颜色：**

```scss
.settings-copy .settings-kicker {
  color: var(--fresh-green);
  // ... 其余不变
}
```

**flat-button hover 去蓝化：**

```scss
.flat-button {
  // ... 现有属性

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--fresh-green), var(--fresh-mint));
    color: #fff;
  }
}
```

**返回按钮玻璃化：**

```scss
.icon-button {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  color: var(--fresh-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;

  &:hover {
    background: var(--fresh-glass-bg-strong);
  }
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/pages/AiSettings.vue
git commit -m "refactor(ai-settings): apply Fresh Glass — page background, glass cards, green accent

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 聊天页微调 — ChatContainer / ChatMessageList / ChatComposer

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatContainer.vue`
- Modify: `frontend/apps/web/src/features/chat/ChatMessageList.vue`
- Modify: `frontend/apps/web/src/features/chat/ChatComposer.vue`

- [ ] **Step 1: ChatContainer.vue — 背景渐变 + 玻璃增强**

修改 `.wechat-layout` 背景：
```scss
.wechat-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  position: relative;
  overflow: hidden;
  background: var(--fresh-page-bg);
  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
}
```

修改 `.chat-sidebar` 使用 fresh 变量：
```scss
.chat-sidebar {
  // ... 保留现有 flex/min/max/position/z-index
  background: var(--fresh-glass-bg-strong);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  // ... 其余不变
}
```

修改 `.chat-header` 使用 fresh 变量：
```scss
.chat-header {
  // ... 保留现有属性
  background: var(--fresh-glass-bg-strong);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  // ... 其余不变
}
```

修改 `.chat-main` 背景加淡渐变：
```scss
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.18)),
    radial-gradient(circle at 82% 12%, rgba(167, 243, 208, 0.22), transparent 30%),
    var(--chat-bg);
}
```

修改 `.chat-detail-panel` 使用 fresh 变量：
```scss
.chat-detail-panel {
  // ... 保留现有属性
  background: var(--fresh-glass-bg-strong);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  // ... 其余不变
}
```

修改 `:deep(.wechat-composer)` 使用 fresh 变量：
```scss
:deep(.wechat-composer) {
  background: var(--fresh-glass-bg-strong);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  border-top: 1px solid var(--fresh-glass-border);
}
```

- [ ] **Step 2: ChatMessageList.vue — 消息列表背景微调**

```scss
.message-list {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0.08) 60%),
    var(--chat-bg, var(--surface-tertiary, #f5f5f5));
}
```

- [ ] **Step 3: ChatComposer.vue — 玻璃增强**

```scss
.wechat-composer {
  background: var(--fresh-glass-bg-strong);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  border-top: 1px solid var(--fresh-glass-border);
  // ... 保留其余现有属性
}
```

- [ ] **Step 4: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/features/chat/ChatContainer.vue frontend/apps/web/src/features/chat/ChatMessageList.vue frontend/apps/web/src/features/chat/ChatComposer.vue
git commit -m "refactor(chat): apply Fresh Glass — gradient backgrounds, enhanced glass on sidebar/header/composer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 颜色去蓝化保守清理

**Files:**
- Modify: `frontend/apps/web/src/pages/Settings.vue`（已在 Task 3 处理）
- Modify: `frontend/apps/web/src/pages/Profile.vue`（已在 Task 4 处理）
- Modify: `frontend/apps/web/src/pages/AiSettings.vue`（已在 Task 5 处理）

- [ ] **Step 1: 全局搜索确认无遗漏蓝色**

```bash
cd frontend/apps/web/src && grep -rn "rgba(37, 99, 235" pages/ features/chat/ChatContainer.vue features/chat/ChatMessageList.vue features/chat/ChatComposer.vue styles/ 2>/dev/null
```

Expected: 无匹配或仅在注释中

- [ ] **Step 2: 如果 Task 3-6 中已有遗漏，补替换**

Task 3-6 已覆盖去蓝化。此步骤确认无遗漏。如有遗漏，按映射表替换：

| 旧值 | 新值 |
|------|------|
| `rgba(37, 99, 235, 0.28)` | `rgba(7, 193, 96, 0.22)` |
| `rgba(37, 99, 235, 0.14)` | `rgba(7, 193, 96, 0.14)` |
| `rgba(37, 99, 235, 0.12)` | `rgba(167, 243, 208, 0.12)` |
| `rgba(37, 99, 235, 0.1)` | `rgba(7, 193, 96, 0.10)` |
| `rgba(16, 185, 129, 0.1)` | `rgba(7, 193, 96, 0.10)` |
| `rgba(16, 185, 129, 0.12)` | `rgba(7, 193, 96, 0.12)` |

- [ ] **Step 3: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit（如有修改）**

```bash
git add -A && git commit -m "chore: cleanup remaining Tailwind blue references"
```

---

### Task 8: 最终验证

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
Task 1 (fresh-glass.scss) → Task 2 (朋友圈 Web 化) → Task 3 (设置页)
                                                         ↓
                                              Task 4 (资料页) → Task 5 (AI 设置)
                                                                      ↓
                                                              Task 6 (聊天页微调)
                                                                      ↓
                                                              Task 7 (去蓝化确认)
                                                                      ↓
                                                              Task 8 (最终验证)
```
