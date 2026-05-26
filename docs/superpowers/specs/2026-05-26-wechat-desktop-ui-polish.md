# 微信桌面端聊天 UI 精修

## 概述

在保留现有 3 栏布局和所有业务逻辑的前提下，修复已知 UI bug，对齐微信 PC 桌面端视觉，加入克制的毛玻璃/液体光斑/柔和光影效果。

**执行顺序（严格）：P0 bug 修复 → 布局对齐 → 特效 → 清理**

**硬约束：不改业务逻辑、store、WebSocket、E2EE、接口调用。不改移动端行为。不引入新 UI 库。**

---

## 第 1 层：P0 Bug 修复

### 1.1 ChatSidebarPanel.vue — 选中态 prop 名错误

- 模板第 8 行 `session.id === activeSessionId` → `session.id === currentSessionId`
- `activeSessionId` 在 props 中不存在，父组件传入的是 `currentSessionId`

### 1.2 ChatSidebarPanel.vue — 搜索框无效

- 模板 chat tab 当前直接 `v-for="session in sessions"` → 改为 `v-for="item in filteredSessionItems"`
- `filteredSessionItems` 内部每个 item 结构是 `{ session, online, preview, searchText, isAi }`，模板字段调整为 `item.session.xxx`
- contacts tab 当前直接 `v-for="friend in friends"` → 改为 `v-for="contact in filteredContacts"`（或 `groupedContacts` 带字母分组）
- 保留现有 `pinyin-pro` 懒加载逻辑不动

### 1.3 ChatContainer.vue — 侧栏宽度 CSS/JS 冲突

- JS：`sidebarWidth` 默认值 `260` → `280`，`MIN_SIDEBAR` `180` → `240`，`MAX_SIDEBAR` `400` → `360`
- 模板：`:style="{ width: sidebarWidth + 'px' }"` → `:style="{ flexBasis: sidebarWidth + 'px' }"`
- CSS `.chat-sidebar`：删除 `width: 280px; min-width: 280px;`，改为 `flex: 0 0 auto; min-width: 240px; max-width: 360px;`

### 1.4 ChatContainer.vue — 详情面板层级

- `.wechat-layout` 增加 `position: relative; overflow: hidden;`
- `.detail-overlay` z-index 从 `var(--z-overlay, 300)` 改为 `50`
- `.chat-detail-panel` z-index 从 `20` 改为 `60`
- 详情面板增加 `transition: transform 180ms ease-out;` 及对应的滑入动画

---

## 第 2 层：微信 PC 桌面布局

### 2.1 ChatContainer.vue — 整体布局

- `.wechat-layout`：`height: 100dvh`（fallback `100vh`），`display: flex`，`background` 改为微信浅灰底 + 非侵入式液体光斑（见第 3 层）
- 给 `SideNavBar` / `.chat-sidebar` / `.chat-main` / `.sidebar-resize-handle` / `.chat-detail-panel` 设置 `position: relative; z-index: 1;`（确保光斑在内容层下面）

### 2.2 SideNavBar.vue — 图标导航栏

- 宽度固定 56px
- 背景 `#1E1E1E` → `var(--surface-nav)`
- emoji 图标（💬👤🧭⚙）→ Element Plus 内联图标（`ChatDotRound` / `User` / `Compass` / `Setting`）
- 保留 `el-badge` 结构，unread 功能继续工作
- 图标状态：默认灰白 `rgba(255,255,255,0.5)`，hover 稍亮 `rgba(255,255,255,0.8)`，active 微信绿 `var(--color-primary)` + 左侧短竖线（保留现有 `::before` 实现）
- avatar 保持 32px，圆角 4px

### 2.3 ChatSidebarPanel.vue — 会话列表

- 背景 `var(--surface-secondary)`
- 搜索框高度 32px，浅灰底，无强边框
- 列表项高度 64px
- hover `var(--chat-card-hover)`，active `var(--chat-card-active)`（不用写死 `#C4C4C4`）
- 头像圆角 4px
- 会话名 14-15px，预览 12-13px，时间 11-12px

### 2.4 ChatContainer.vue — 聊天主区域

- `.chat-main` background 使用 `var(--chat-bg)` 或 `var(--surface-tertiary)`
- `.chat-header` 高度 64px → 56px，下边框极浅
- 消息区占满剩余空间
- 输入区桌面端 min-height 132px，贴近微信 PC

---

## 第 3 层：毛玻璃 + 液体光斑 + 光影

### 3.1 新增 CSS 变量（chat-theme.scss）

```scss
:root {
  --fx-glass-bg: rgba(255,255,255,0.64);
  --fx-glass-bg-strong: rgba(255,255,255,0.78);
  --fx-glass-border: rgba(255,255,255,0.35);
  --fx-glass-blur: blur(18px) saturate(1.35);
  --fx-liquid-green: rgba(7,193,96,0.18);
  --fx-liquid-cyan: rgba(80,200,255,0.12);
  --fx-liquid-purple: rgba(140,120,255,0.10);
  --fx-soft-shadow: 0 18px 48px rgba(15,23,42,0.10);
}

.theme-dark {
  --fx-glass-bg: rgba(25,25,25,0.68);
  --fx-glass-bg-strong: rgba(30,30,30,0.82);
  --fx-glass-border: rgba(255,255,255,0.08);
  --fx-liquid-green: rgba(7,193,96,0.14);
  --fx-liquid-cyan: rgba(80,200,255,0.08);
  --fx-liquid-purple: rgba(140,120,255,0.08);
  --fx-soft-shadow: 0 18px 48px rgba(0,0,0,0.35);
}
```

### 3.2 液体光斑（ChatContainer.vue scoped CSS）

- `.wechat-layout::before` / `.wechat-layout::after`：`radial-gradient`，`position: absolute; pointer-events: none; filter: blur(40px); opacity ≤ 0.45`
- 动画 14-22s，`prefers-reduced-motion: reduce` 时关闭
- 内容层（SideNavBar / sidebar / chat-main / resize-handle / detail-panel）全部 `position: relative; z-index: 1`

### 3.3 毛玻璃应用区域

仅这些区域加 `backdrop-filter: var(--fx-glass-blur)` + 半透明背景：
- `.chat-sidebar`
- `.chat-header`
- `.wechat-composer`
- `.chat-detail-panel`
- 可选：空状态卡片、历史加载 pill

### 3.4 不玻璃化的区域

- 消息气泡保持不变：自己微信绿 `var(--chat-bubble-own)`，对方白色 `var(--chat-bubble-other)`
- 气泡可加极弱阴影（≤ `0 2px 6px rgba(0,0,0,0.06)`）

---

## 第 4 层：消息区和输入区优化

### 4.1 ChatMessageList.vue — 消息宽度限制

- `.message-list`：`display: flex; flex-direction: column; min-height: 0;`
- `.message-scroller` 高度必须可靠，避免双滚动
- **不重构 DynamicScroller 内部 DOM**，在 `.msg-item` 层控制宽度：
  ```scss
  .msg-item {
    width: min(100%, var(--chat-timeline-max-width, 840px));
    margin: 0 auto;
    box-sizing: border-box;
  }
  ```
- 保留现有虚拟滚动逻辑

### 4.2 ChatMessageItem.vue — 气泡微调

- 保留左右头像、气泡尾巴
- 气泡圆角 4-6px（不做 iMessage 大圆角）
- 连续消息 compact 模式间距收紧
- 自己的气泡 `var(--chat-bubble-own)`，对方的 `var(--chat-bubble-other)`

### 4.3 ChatComposer.vue — 输入区

- 桌面端 `.wechat-composer` min-height: 132px
- 工具栏在上，textarea 占主要空间，发送按钮右下角
- 表情按钮：去掉 `disabled` 属性（功能未实现但不要灰掉影响观感），保留 `@click` 为空或加 TODO 注释
- **补上图片按钮**：`Picture` 图标已 import 但模板未使用，在工具栏添加图片按钮调用 `selectImage()`
- 不改上传逻辑

---

## 第 5 层：代码清理

### 5.1 ChatContainer.vue 未使用 import

删除模板中未使用的组件和图标 import：
- 图标：`ArrowLeft`、`ChatDotRound`、`Moon`、`Setting`、`Sunny`
- 组件：`EncryptionBadge`、`SecurityPanel`、`ConnectionStatusBar`（需确认模板中确实未使用）

### 5.2 样式规范

- 变量优先放 `tokens.scss` / `chat-theme.scss`，不写死颜色
- 移动端 `max-width: 768px` 下不受影响
- 保留 `env(safe-area-inset-bottom)` 移动端处理

---

## 修改文件清单

| 文件 | 操作 | 关键改动 |
|------|------|---------|
| `ChatSidebarPanel.vue` | 修改 | P0: prop 名修正 + 搜索过滤生效 |
| `ChatContainer.vue` | 修改 | P0: 宽度冲突/层级 + 布局对齐 + 光斑 + 清理 import |
| `SideNavBar.vue` | 修改 | 布局: emoji→图标 + 背景变量 |
| `ChatComposer.vue` | 修改 | 布局: 高度/图片按钮/表情去 disabled |
| `ChatMessageList.vue` | 修改 | 消息: msg-item 宽度限制 + flex 布局 |
| `ChatMessageItem.vue` | 修改 | 消息: 气泡间距微调 |
| `chat-theme.scss` | 修改 | 特效: --fx-* 变量 + 暗色版 |
| `tokens.scss` | 不变 | 现有变量已满足需求 |

## 不在本次范围

- 业务逻辑、store、WebSocket、E2EE、API 调用
- 移动端 MobileChatLayout.vue
- 路由调整
- 朋友圈 UI
- 设置/个人资料页面
- AI 功能逻辑
