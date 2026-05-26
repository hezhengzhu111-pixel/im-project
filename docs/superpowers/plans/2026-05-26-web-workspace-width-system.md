# Web 工作区真实尺寸系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉所有 1040/1180 窄居中容器，建立 --web-* 尺寸变量，让页面在 1440-1920px 宽屏上合理展开

**Architecture:** fresh-glass.scss 新增尺寸变量 → 各页面替换硬编码宽度为统一公式 → Settings 三栏化 → Moments 自适应填满

**Tech Stack:** Vue 3 + TypeScript + SCSS + Element Plus

**本轮判断标准：在 1440/1600/1920 三种宽度下，页面主体必须明显利用横向空间。**

---

## 文件结构

| 文件 | 职责 | 修改类型 |
|------|------|---------|
| `styles/fresh-glass.scss` | --web-* 尺寸变量 | 新增变量 |
| `pages/Settings.vue` | 三栏工作区 + 统一宽度 | 模板 + 样式 |
| `pages/AiSettings.vue` | 统一宽度 + 宽双栏 | 样式 |
| `pages/Profile.vue` | 统一宽度 + 收紧 | 样式 |
| `features/moments/MomentsContainer.vue` | 去掉窄容器，自适应 1fr+300 | 样式 |
| `features/moments/MomentsFeed.vue` | 收紧 padding/gap | 样式 |
| `features/moments/MomentsPostCard.vue` | 内部可读宽度限制 | 样式 |
| `features/moments/MomentsCover.vue` | clamp 高度 | 样式 |

---

### Task 1: fresh-glass.scss — 新增 --web-* 尺寸变量

**Files:**
- Modify: `frontend/apps/web/src/styles/fresh-glass.scss`

- [ ] **Step 1: 在 `:root` 块末尾添加尺寸变量**

读取文件，在 `:root` 块中现有密度变量之后添加：

```scss
  // Web 工作区尺寸系统
  --web-page-padding-x: clamp(20px, 3vw, 48px);
  --web-page-padding-y: 24px;
  --web-content-max: 1480px;
  --web-readable-max: 980px;
  --web-aside-width: 320px;
  --web-gap: 18px;
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/styles/fresh-glass.scss
git commit -m "refactor(theme): add --web-* workspace sizing variables — 1480px max, clamp padding

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Settings — 三栏工作区

**Files:**
- Modify: `frontend/apps/web/src/pages/Settings.vue`

**CRITICAL: 不改 `<script setup>`。只改 template 结构（分 primary/secondary 列）和 style。**

- [ ] **Step 1: 读取文件，确认 script 不动**

- [ ] **Step 2: 更新 CSS — 替换宽度系统 + 三栏 + 密度收紧**

在 `<style scoped lang="scss">` 中替换关键块：

**页面容器：**
```scss
.settings-page {
  min-height: 100%;
  padding: var(--web-page-padding-y) var(--web-page-padding-x);
  overflow-y: auto;
  overflow-x: hidden;
}
```

**Shell 宽度：**
```scss
.settings-shell {
  width: min(var(--web-content-max), calc(100vw - var(--web-page-padding-x) * 2));
  margin: 0 auto;
  display: grid;
  grid-template-columns: 216px minmax(0, 1fr);
  gap: var(--web-gap);
  align-items: start;
}
```

**主区域拆两列：**
```scss
.settings-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--web-gap);
  align-items: start;
}
```

**密度收紧：**
```scss
.settings-hero { height: 60px; margin-bottom: 12px; }

.setting-section { margin-bottom: 12px; }

.setting-row {
  min-height: 52px;
  padding: 12px 16px;
}

.setting-title { font-size: 14px; }
.setting-desc { font-size: 12px; }

.setting-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--web-gap);
}
```

**左侧 nav：**
```scss
.settings-nav-panel {
  position: sticky;
  top: 24px;
  // ... 保留现有玻璃样式
}

.nav-logout {
  // 不要 margin-top: auto（不撑开高度，保持自然流）
}
```

**响应式：**
```scss
@media (max-width: 1200px) {
  .settings-main { grid-template-columns: 1fr; }
}

@media (max-width: 860px) {
  .settings-shell { grid-template-columns: 1fr; }
  .settings-nav-panel { display: none; }
  .setting-grid-2 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: 更新 template — 把 settings-main 内容拆成 primary + secondary 两列**

在模板中，把 `.settings-main` 内的内容用两个 div 包裹：

```html
<main class="settings-main">
  <div class="settings-primary">
    <!-- hero + account-section + preference-section + notification-section + privacy-section -->
  </div>
  <div class="settings-secondary">
    <!-- storage-card + AI-card + logout -->
  </div>
</main>
```

将退出按钮从左侧 nav 底部移动到右侧 secondary 列中（作为 settings-secondary 内的一个玻璃卡片）。

- [ ] **Step 4: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/src/pages/Settings.vue
git commit -m "refactor(settings): three-column workspace — nav(216) + primary(1fr) + secondary(340), --web-* sizing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: AI Settings — 统一宽度 + 宽双栏

**Files:**
- Modify: `frontend/apps/web/src/pages/AiSettings.vue`

- [ ] **Step 1: 更新 CSS**

替换关键块：

```scss
.ai-settings-page {
  min-height: 100vh;
  padding: var(--web-page-padding-y) var(--web-page-padding-x);
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--fresh-page-bg);
}

.ai-settings-shell {
  width: min(var(--web-content-max), calc(100vw - var(--web-page-padding-x) * 2));
  margin: 0 auto;
}

.settings-content {
  display: grid;
  grid-template-columns: minmax(520px, 1fr) 360px;
  gap: var(--web-gap);
  align-items: start;
}
```

如果模板中没有 `.ai-settings-shell` wrapper，在 template 中 `<div class="ai-settings-page">` 内部新增一层 `<div class="ai-settings-shell">` 包裹 hero + settings-content。

**响应式：**
```scss
@media (max-width: 860px) {
  .settings-content { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/pages/AiSettings.vue
git commit -m "refactor(ai-settings): unify to --web-* width system, wider two-column layout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Profile — 统一宽度 + 收紧

**Files:**
- Modify: `frontend/apps/web/src/pages/Profile.vue`

- [ ] **Step 1: 更新 CSS**

替换关键块：

```scss
.profile-page {
  min-height: 100%;
  padding: var(--web-page-padding-y) var(--web-page-padding-x);
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--fresh-page-bg);
}

.profile-shell {
  width: min(var(--web-content-max), calc(100vw - var(--web-page-padding-x) * 2));
  margin: 0 auto;
}

.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--web-gap);
}

.profile-hero { padding: 16px 18px; margin-bottom: 12px; }
.form-card, .side-card { padding: 14px 16px; }
.form-grid { gap: 10px 12px; }
.side-stack { position: sticky; top: 24px; }
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/src/pages/Profile.vue
git commit -m "refactor(profile): unify to --web-* width system, tighten form spacing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Moments — 自适应填满聊天区

**Files (4 files, CSS only):**
- Modify: `frontend/apps/web/src/features/moments/MomentsContainer.vue`
- Modify: `frontend/apps/web/src/features/moments/MomentsCover.vue`
- Modify: `frontend/apps/web/src/features/moments/MomentsFeed.vue`
- Modify: `frontend/apps/web/src/features/moments/MomentsPostCard.vue`

**No template/script changes.**

- [ ] **Step 1: MomentsContainer.vue — 去掉窄容器**

```scss
.moments-container {
  width: 100%;
  max-width: none;                            // ← 曾为 min(1040px, 100%)
  height: 100%;
  min-height: 0;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;  // ← 曾为 680px 280px
  gap: 16px;
  align-items: start;
}

.moments-main-panel {
  width: 100%;
  min-width: 0;
}

.moments-side-panel {
  width: 300px;
  align-self: start;
  position: sticky;
  top: 16px;
}
```

**断点改为 1100px：**
```scss
@media (max-width: 1100px) {
  .moments-container { grid-template-columns: 1fr; padding: 12px; }
  .moments-side-panel { display: none; }
}
```

- [ ] **Step 2: MomentsCover.vue — clamp 高度**

```scss
.moments-cover {
  height: clamp(180px, 20vh, 240px);
}
```

- [ ] **Step 3: MomentsFeed.vue — 收紧**

```scss
.moments-feed {
  background: transparent;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
```

- [ ] **Step 4: MomentsPostCard.vue — 内部限制可读宽度**

关键变更：
```scss
.moments-post-card {
  padding: 14px;         // 收紧
  border-radius: 16px;   // 收紧
  // 保留玻璃背景、边框、阴影
}

.post-main {
  max-width: var(--web-readable-max);  // 980px — 限制内容宽度，不限制页面宽度
}

.media-grid.grid-1 {
  max-width: 520px;
}
```

hover 保持 `translateY(-1px)`，不加强。

- [ ] **Step 5: 验证 typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/src/features/moments/MomentsContainer.vue frontend/apps/web/src/features/moments/MomentsCover.vue frontend/apps/web/src/features/moments/MomentsFeed.vue frontend/apps/web/src/features/moments/MomentsPostCard.vue
git commit -m "refactor(moments): adaptive full-width layout — remove centered narrow container, fill chat area

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 最终验证

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
Task 1 (尺寸变量) → Task 2 (Settings 三栏) → Task 3 (AI Settings)
                                                     ↓
                                            Task 4 (Profile)
                                                     ↓
                                            Task 5 (Moments 4文件)
                                                     ↓
                                            Task 6 (最终验证)
```
