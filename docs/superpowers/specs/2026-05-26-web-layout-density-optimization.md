# Web 信息架构 + 密度优化 — 设计规格

## 概述

在保留 Fresh Glass 设计语言的前提下，解决桌面端信息密度低、留白过大、分栏关系不清晰的问题。本轮**不堆毛玻璃特效**，重点改 Web 信息架构、排版、密度、空白管理。

**执行顺序：fresh-glass 密度变量 → Settings 模板重组 → AiSettings 双栏 → Moments Feed/PostCard Web 化 → Profile 微调 → Chat 暗色/亮色小修**

**硬约束：不改业务逻辑、store、WebSocket、E2EE、接口调用。不破坏移动端。不新增 UI 库。不新增调试边框。不扩大圆角。**

**本轮原则：收紧密度、减少空白、建立清晰桌面分栏。不要新增大面积渐变、红框、调试边框。**

**本轮视觉目标不是"更炫"，而是"更像桌面 Web 产品"：信息更紧凑、分组更清楚、空白更少、玻璃更克制。**

---

## 第 1 层：Fresh Glass 密度变量收敛

### 文件

- 修改：`frontend/apps/web/src/styles/fresh-glass.scss`

### 新增变量

```scss
:root {
  // ... 保留现有 --fresh-* 变量
  --fresh-radius-page: 20px;
  --fresh-radius-card: 16px;
  --fresh-radius-control: 10px;
  --fresh-section-gap: 14px;
  --fresh-row-height: 58px;
}
```

### .fresh-glass-card 行为收敛

- 默认**不**加 hover 上浮
- 只有 `.is-interactive` 才有 hover 效果
- hover 幅度不超过 `translateY(-1px)`

---

## 第 2 层：设置页模板重组 — 左侧导航 + 右侧分组

### 文件

- 修改：`frontend/apps/web/src/pages/Settings.vue`

### 允许改动范围

- **模板：可以重排结构**，把每个 section 从独立大卡片改为分组 section + setting-row
- **脚本：不允许重写** `<script setup>` 里的 store、watch、onMounted、update 函数、事件处理、data 绑定。只允许重排 template 和重写 style。
- **样式：全面重写**

### 桌面端布局（≥860px）

```
.settings-shell (max-width: 1180px, grid: 220px + 1fr, gap: 18px)
  ├── .settings-nav-panel (sticky top: 28px)
  │     ├── 用户小头像 + 用户名
  │     └── 6 个导航项（button，视觉分组提示）
  │          账号 / 外观 / 通知 / 隐私 / 存储 / AI
  └── .settings-main
        ├── hero (压缩到 ~72px)
        ├── account-section (1 card: 头像+用户名+编辑入口)
        ├── preference-section (1 card: 语言 row + 主题 row)
        ├── notification-section (1 card: 通知/提示音/公网语音 3 rows)
        ├── privacy-section (1 card: 已读回执等)
        └── storage-ai-section (2 小卡片并排)
```

### 左侧导航

- 导航项为 `<button type="button">`，只做视觉分组提示
- 除 AI 项外，全部使用普通 button，**不加** `router.push`，**不加** active 状态
- AI 项点击 `router.push('/settings/ai')`（唯一有交互的导航项）
- 其他项先不做滚动定位（后续迭代）
- **不要**加 active 状态管理、滚动监听、复杂 JS。避免"点了没反应"的伪交互问题。

### 行样式

```scss
.setting-section {
  border-radius: var(--fresh-radius-page); // 20px
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  box-shadow: var(--fresh-glass-shadow-soft);
  margin-bottom: var(--fresh-section-gap);
  overflow: hidden;
}

.setting-row {
  min-height: var(--fresh-row-height); // 58px
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.38);
}

.setting-row:last-child {
  border-bottom: none;
}
```

### 卡片圆角

- 页面主卡片：18px-20px（`var(--fresh-radius-page)`）
- 小卡片：16px（`var(--fresh-radius-card)`）
- 按钮/控件：10px-12px（`var(--fresh-radius-control)`）
- 不要全部 22px 大圆角

### 移动端（<860px）

- 左侧导航 `display: none`
- 回到单列布局
- 保留现有功能不变

---

## 第 3 层：AI 设置页双栏

### 文件

- 修改：`frontend/apps/web/src/pages/AiSettings.vue`

### 改动

- 给现有 `<section class="settings-card">` 加 BEM 修饰类：
  - API Key 区域 → `ai-section ai-section--keys`
  - 添加 Key 区域 → `ai-section ai-section--add-key`
  - 自动回复区域 → `ai-section ai-section--auto-reply`
- 如果仅靠 section class 难以实现稳定双栏，**允许新增** `.ai-settings-shell`、`.ai-main-column`、`.ai-side-column` 包裹层。不改业务数据绑定。
- CSS grid：
  ```scss
  .settings-content {
    max-width: 1180px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 18px;
    align-items: start;
  }
  ```
- 左栏：`.ai-section--keys`、`.ai-section--add-key`、空状态卡片
- 右栏：`.ai-section--auto-reply`、Persona 区域
- CSS 用 `grid-column` 或 `order` 控制左右归属
- 空状态卡片不要撑满页面

---

## 第 4 层：朋友圈减少留白 + 动态卡片 Web 化

### 文件

- 修改：`frontend/apps/web/src/features/moments/MomentsContainer.vue`
- 修改：`frontend/apps/web/src/features/moments/MomentsFeed.vue`
- 修改：`frontend/apps/web/src/features/moments/MomentsPostCard.vue`
- 修改：`frontend/apps/web/src/features/moments/MomentsCover.vue`（仅桌面端高度覆盖）

### MomentsContainer 布局调整

```scss
.moments-container {
  width: min(1040px, 100%);
  padding: 20px;
  grid-template-columns: minmax(0, 680px) 280px;
  gap: 16px;
  align-items: start;
}
```

- 右侧面板：
  - `align-self: start; position: sticky; top: 20px;`
  - **不允许**设置 `min-height`、`height`、`flex: 1`；只按内容自然高度排列，彻底避免空盒子
  - 保留 2-3 个小卡片
  - 删除任何调试红色边框

- 嵌入聊天时（≤1180px）隐藏右侧：
  ```scss
  @media (max-width: 1180px) {
    .moments-container {
      grid-template-columns: minmax(0, 680px);
      justify-content: center;
    }
    .moments-side-panel { display: none; }
  }
  ```

### MomentsCover 桌面压缩

- 桌面端 `--moments-cover-height: 220px;`（通过 CSS 变量覆盖或媒体查询）
- 移动端保持 240px

### MomentsFeed 布局

```scss
.moments-feed {
  background: transparent;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
```

### MomentsPostCard Web 化

```scss
.moments-post-card {
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(31, 41, 55, 0.06);
  backdrop-filter: blur(16px) saturate(1.25);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 32px rgba(31, 41, 55, 0.08);
  }
}
```

- `.post-layout`: `padding: 0;`
- `.post-main`: `border-bottom: none; margin-bottom: 0; padding-bottom: 0;`
- `.post-avatar`: `width: 44px; height: 44px; border-radius: 12px;`
- `.post-nickname`: `color: var(--fresh-text); font-weight: 700;`（不用 `#576B95`）
- `.post-content`: `color: var(--fresh-text);`
- `.media-grid`: `gap: 6px; border-radius: 14px;`
- `.media-item, .media-image`: `border-radius: 12px;`
- `.post-social`: `margin-left: 56px; background: rgba(255,255,255,.58); border-radius: 14px;`

### 移动端保持微信风格

- `@media (max-width: 768px)` 下：
  - 卡片背景 `transparent`、无大圆角
  - padding 缩小
  - 保持微信朋友圈视觉

---

## 第 5 层：个人资料页微调

### 文件

- 修改：`frontend/apps/web/src/pages/Profile.vue`

### 改动

- `.profile-shell` max-width → `1180px`
- hero 高度略压缩
- `.side-stack` 桌面端 `position: sticky; top: 28px;`
- `.form-card` 减少大面积空白
- 表单 label/输入间距微收紧

---

## 第 6 层：聊天页极少改动

### 文件

- 可能修改：`frontend/apps/web/src/features/chat/ChatMessageList.vue`

### 改动

- 亮色：消息区增加极淡背景层次（保持微信感）
- 暗色：消息区灰色改深蓝黑渐变，不要大面积纯灰
- 不改三栏结构

---

## 修改文件清单

| 文件 | 操作 | 关键改动 |
|------|------|---------|
| `styles/fresh-glass.scss` | 修改 | 新增密度变量 + .fresh-glass-card 收敛 |
| `pages/Settings.vue` | **重组** | 左侧导航 + 右侧分组 section/row 排版 |
| `pages/AiSettings.vue` | 修改 | section 加修饰类 + grid 双栏 |
| `features/moments/MomentsContainer.vue` | 修改 | 宽度/列宽/align-start/sticky/嵌入隐藏 |
| `features/moments/MomentsFeed.vue` | 修改 | transparent bg + flex gap |
| `features/moments/MomentsPostCard.vue` | 修改 | 玻璃卡片 Web 化 + 移动端保留 |
| `features/moments/MomentsCover.vue` | 修改 | 桌面端高度 220px |
| `pages/Profile.vue` | 修改 | max-width/sticky/间距微调 |
| `features/chat/ChatMessageList.vue` | 可能修改 | 暗色背景微调 |

## 不在本次范围

- 业务逻辑、store、WebSocket、E2EE、API 调用
- 移动端布局逻辑（仅保留现有行为）
- 左侧导航锚点滚动（后续迭代）
- 新增 UI 库
- 大面积渐变、红框、调试边框（明确禁止）
- 继续扩大圆角（明确禁止）
