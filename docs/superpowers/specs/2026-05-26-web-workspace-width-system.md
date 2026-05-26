# Web 工作区真实尺寸系统 — 设计规格

## 概述

去掉所有 `min(1040px/1180px, 100%)` 窄居中容器，建立统一的 `--web-*` 尺寸变量系统。让页面在 1440-1920px 宽屏上合理展开，消除"居中窄卡片 + 两侧大块空白"的问题。

**本轮判断标准：在 1440、1600、1920 三种宽度下，页面主体必须明显利用横向空间；不能再出现主体窄居中、两侧大块空白。**

**硬约束：不改业务逻辑、store、WebSocket、E2EE。不破坏移动端。不新增 UI 库。不新增光斑/大圆角/大面积渐变/强 hover/调试边框。Chat 主布局本轮不动。**

---

## 第 1 层：建立 Web 工作区尺寸系统

### 文件

- 修改：`frontend/apps/web/src/styles/fresh-glass.scss`

### 新增变量

```scss
:root {
  // ... 保留现有 --fresh-* 和密度变量
  --web-page-padding-x: clamp(20px, 3vw, 48px);
  --web-page-padding-y: 24px;
  --web-content-max: 1480px;
  --web-readable-max: 980px;
  --web-aside-width: 320px;
  --web-gap: 18px;
}
```

### 统一页面宽度公式

所有 Settings / Profile / AI 页面使用：
```scss
width: min(var(--web-content-max), calc(100vw - var(--web-page-padding-x) * 2));
margin: 0 auto;
```

### 不同屏幕下的实际宽度

| 屏幕宽度 | 页边距 | 内容宽度 | 说明 |
|---------|--------|---------|------|
| 1440px | ~43px | ~1354px | 接近 1480，留白显著减少 |
| 1600px | 48px | 1480px | 触及 max |
| 1920px | 48px | 1480px | 触及 max，封顶 |
| 2560px | 48px | 1480px | 触及 max |

### 全局不要机械替换

- 页面外层容器 → 用 `--web-content-max`
- 正文阅读区（如 PostCard 内容）→ 用 `--web-readable-max`
- 表单内部、图片预览 → 保留局部合理 max-width
- 不全局 sed 替换所有宽度

---

## 第 2 层：Settings → 三栏工作区

### 文件

- 修改：`frontend/apps/web/src/pages/Settings.vue`

### 改动（模板 + 样式，不改 script）

**页面 padding：**
```scss
.settings-page {
  min-height: 100%;
  padding: var(--web-page-padding-y) var(--web-page-padding-x);
  overflow-y: auto;
  overflow-x: hidden;  // 确保 .fresh-page 的 overflow:hidden 不导致滚动异常
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

**模板结构：**
```
.settings-main
  .settings-primary      ← 左列：hero + account + preference + notification + privacy
  .settings-secondary    ← 右列：storage + AI + logout
```

**行/卡片密度收紧：**
```scss
.settings-hero { height: 60px; margin-bottom: 12px; }
.setting-section { margin-bottom: 12px; }
.setting-row { min-height: 52px; padding: 12px 16px; }
.setting-title { font-size: 14px; }
.setting-desc { font-size: 12px; }
```

**左侧 nav：**
- 宽度 216px，sticky
- logout 不放底部（自然流）

**响应式：**
```scss
@media (max-width: 1200px) { .settings-main { grid-template-columns: 1fr; } }
@media (max-width: 860px) { .settings-shell { grid-template-columns: 1fr; } .settings-nav-panel { display: none; } }
```

---

## 第 3 层：AI Settings → 宽双栏工作区

### 文件

- 修改：`frontend/apps/web/src/pages/AiSettings.vue`

### 改动

**页面背景和 padding：**
```scss
.ai-settings-page {
  min-height: 100vh;
  padding: var(--web-page-padding-y) var(--web-page-padding-x);
  overflow-y: auto;
  overflow-x: hidden;
}
```

**Shell：**
```scss
.ai-settings-shell {
  width: min(var(--web-content-max), calc(100vw - var(--web-page-padding-x) * 2));
  margin: 0 auto;
}
```

**双栏：**
```scss
.settings-content {
  display: grid;
  grid-template-columns: minmax(520px, 1fr) 360px;
  gap: var(--web-gap);
  align-items: start;
}
```

- 左栏 520px min → Key 表单不会太窄
- 右栏 360px → 自动回复 + Persona
- 如果现有模板没有 wrapper，允许加 `.ai-settings-shell` / `.ai-main-column` / `.ai-side-column`

---

## 第 4 层：Profile → 统一尺寸

### 文件

- 修改：`frontend/apps/web/src/pages/Profile.vue`

### 改动

```scss
.profile-page {
  padding: var(--web-page-padding-y) var(--web-page-padding-x);
  overflow-y: auto;
  overflow-x: hidden;
}

.profile-shell {
  width: min(var(--web-content-max), calc(100vw - var(--web-page-padding-x) * 2));
  margin: 0 auto;
}

.profile-grid {
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--web-gap);
}

.profile-hero { padding: 16px 18px; margin-bottom: 12px; }
.form-card, .side-card { padding: 14px 16px; }
.form-grid { gap: 10px 12px; }
.side-stack { position: sticky; top: 24px; }
```

---

## 第 5 层：Moments → 自适应填满聊天区

### 文件

- 修改：`frontend/apps/web/src/features/moments/MomentsContainer.vue`
- 修改：`frontend/apps/web/src/features/moments/MomentsFeed.vue`
- 修改：`frontend/apps/web/src/features/moments/MomentsPostCard.vue`
- 修改：`frontend/apps/web/src/features/moments/MomentsCover.vue`

### MomentsContainer

**关键：去掉固定窄容器，改为自适应填满：**

```scss
.moments-page-wrapper {
  width: 100%;
  min-height: 100%;
  display: block;
}

.moments-container {
  width: 100%;
  max-width: none;           // ← 去掉 min(1040px, 100%)
  height: 100%;
  min-height: 0;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;  // ← 去掉 680px 固定
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

**断点（1100px 隐藏右侧）：**
```scss
@media (max-width: 1100px) {
  .moments-container { grid-template-columns: 1fr; padding: 12px; }
  .moments-side-panel { display: none; }
}
```

### MomentsCover

```scss
.moments-cover {
  height: clamp(180px, 20vh, 240px);
}
```

### MomentsFeed

```scss
.moments-feed {
  background: transparent;
  padding: 14px;
  gap: 12px;
}
```

### MomentsPostCard

**限制内部内容宽度，不限制页面宽度：**

```scss
.moments-post-card {
  padding: 14px;
  border-radius: 16px;
}

.post-main {
  max-width: var(--web-readable-max);  // 980px
}

.media-grid.grid-1 {
  max-width: 520px;
}
```

- hover 不明显浮动
- 移动端保持微信风格

---

## 第 6 层：视觉收敛

### 不新增
- 新的液体光斑
- 新的大圆角
- 新的大面积渐变
- 强 hover 动效（现有 `translateY(-1px)` 保留但不新增）
- 调试红框/outline

### 保留
- 轻玻璃背景（`--fresh-glass-bg`）
- 轻边框（`--fresh-glass-border`）
- 轻阴影（`--fresh-glass-shadow-soft`）
- 微信绿/薄荷绿主色

---

## 修改文件清单

| 文件 | 关键改动 |
|------|---------|
| `styles/fresh-glass.scss` | 新增 --web-* 尺寸变量 |
| `pages/Settings.vue` | 三栏工作区：nav(216) + primary(1fr) + secondary(340) |
| `pages/AiSettings.vue` | 宽双栏：minmax(520,1fr) + 360 |
| `pages/Profile.vue` | 统一 --web-* 宽度系统 |
| `features/moments/MomentsContainer.vue` | 去掉 1040/680 固定值，1fr+300 自适应 |
| `features/moments/MomentsFeed.vue` | 收紧 padding/gap |
| `features/moments/MomentsPostCard.vue` | post-main max-width 限制可读宽度 |
| `features/moments/MomentsCover.vue` | clamp(180px, 20vh, 240px) |

## 不在本次范围

- Chat 主布局（三栏骨架不动）
- 业务逻辑、store、WebSocket、E2EE、API 调用
- 移动端（仅保留现有行为）
- 新增 UI 库
- 光斑/大圆角/大面积渐变
