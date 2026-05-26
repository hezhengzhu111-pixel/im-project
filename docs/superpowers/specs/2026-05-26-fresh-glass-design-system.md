# Fresh Glass 统一视觉升级 — 设计规格

## 概述

在保留现有微信 PC 聊天三栏布局和所有业务逻辑的前提下，建立"小清新 + 毛玻璃 + 液体光影"的统一 Web 设计语言。核心是新建 `fresh-glass.scss` 作为样式基础设施，所有非聊天页面统一引用，聊天页微调但不破坏三栏结构。

**执行顺序：fresh-glass.scss → 朋友圈 Web 化 → 设置/资料/AI 统一 → 聊天页微调**

**硬约束：不改业务逻辑、store、WebSocket、E2EE、接口调用。不破坏移动端。不新增 UI 库。**

**设计原则：Fresh Glass 是设计系统，不是所有元素都透明化。长文本、表单、聊天气泡区域保持可读性；玻璃主要用于页面背景层、卡片容器、顶部栏、侧栏和弹层。**

---

## 第 1 层：新建 `styles/fresh-glass.scss`（样式基础设施）

### 文件

- 新建：`frontend/apps/web/src/styles/fresh-glass.scss`
- 修改：`frontend/apps/web/src/styles/index.scss`（添加 `@use 'fresh-glass';`）

### 亮色主题变量

```scss
:root {
  --fresh-page-bg:
    radial-gradient(circle at 8% 8%, rgba(167, 243, 208, 0.38), transparent 28%),
    radial-gradient(circle at 88% 12%, rgba(186, 230, 253, 0.34), transparent 30%),
    radial-gradient(circle at 58% 92%, rgba(221, 214, 254, 0.26), transparent 34%),
    linear-gradient(135deg, #f7fbff 0%, #f4fff9 45%, #fffafc 100%);

  --fresh-glass-bg: rgba(255, 255, 255, 0.62);
  --fresh-glass-bg-strong: rgba(255, 255, 255, 0.78);
  --fresh-glass-border: rgba(255, 255, 255, 0.58);
  --fresh-glass-shadow: 0 18px 50px rgba(31, 41, 55, 0.10);
  --fresh-glass-shadow-soft: 0 8px 24px rgba(31, 41, 55, 0.07);
  --fresh-blur: blur(22px) saturate(1.45);
  --fresh-green: #07c160;
  --fresh-mint: #a7f3d0;
  --fresh-sky: #bae6fd;
  --fresh-lavender: #ddd6fe;
  --fresh-text: #12201a;
  --fresh-text-muted: rgba(18, 32, 26, 0.58);
}
```

### 暗色主题变量

```scss
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
```

### 通用 class

```scss
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

### 引入方式

在 `index.scss` 中 `@use 'tokens';` 之后添加 `@use 'fresh-glass';`。

---

## 第 2 层：朋友圈 Web 化

### 文件

- 修改：`frontend/apps/web/src/features/moments/MomentsContainer.vue`

### 桌面端布局（> 768px）

- `.moments-page-wrapper`：`height: 100%; min-height: 100vh;` + `.fresh-page` 的 background
- `.moments-container`：
  - `width: min(1120px, 100%);`
  - `height: 100%; min-height: 0;`（不写死 calc(100vh - 48px)，兼容嵌入聊天页的场景）
  - `display: grid; grid-template-columns: minmax(0, 720px) 320px; gap: 20px;`
  - 去掉 `max-width: 600px`、去掉 `border-left/right`、去掉 `box-shadow`
  - `background: transparent;`
- 左侧 `.moments-main-panel`（包裹 topbar + scroll）：
  - `background: var(--fresh-glass-bg);`
  - `backdrop-filter: var(--fresh-blur); -webkit-backdrop-filter: var(--fresh-blur);`
  - `border: 1px solid var(--fresh-glass-border);`
  - `border-radius: 24px; overflow: hidden;`
  - `display: flex; flex-direction: column;`
- 右侧 `.moments-side-panel`：
  - 桌面端 `display: flex; flex-direction: column; gap: 16px;`
  - 移动端 `display: none;`
  - 内容：用户头像（64px）+ 昵称 + 发布动态按钮 + 提示卡片
  - 使用已有数据：`userStore.avatar`、`userStore.nickname`、`coverPhoto`
  - 按钮 `@click="showComposer = true"`
- `.moments-scroll` 保留在左侧主面板内，去掉顶层的 `overflow-y`

### topbar 优化

- sticky 保留，半透明玻璃
- 标题颜色和相机按钮颜色在 cover 区域白色，滚动后变 `var(--fresh-text)`
- 相机按钮改为圆形玻璃按钮

### feed 卡片

- 每条动态卡片：白色半透明、圆角 18px、图片圆角 14px
- hover 轻微上浮（`.is-interactive`）
- 桌面端不贴边

### 移动端（≤ 768px）

- `max-width: 100%;`、`grid-template-columns: 1fr;`
- 右侧 panel `display: none;`
- padding `0` 或 `12px`
- 保留 drawer 逻辑不变

---

## 第 3 层：设置页 Web 化

### 文件

- 修改：`frontend/apps/web/src/pages/Settings.vue`

### 改动

- 根节点用 `.fresh-page` 背景，加 `.settings-page` 自身
- `.settings-hero` / `.settings-card`：应用 `fresh-glass-card` 变量
  - `background: var(--fresh-glass-bg);`
  - `border: 1px solid var(--fresh-glass-border);`
  - `backdrop-filter: var(--fresh-blur); -webkit-backdrop-filter: var(--fresh-blur);`
  - `box-shadow: var(--fresh-glass-shadow-soft);`
  - `border-radius: 22px;`
- `.settings-content`：`max-width: 1120px;`
- `.settings-kicker`：`color: var(--fresh-green);`
- 可点击卡片（account-card、ai-card）添加 hover 上浮

### segmented-control

- 背景：`rgba(255, 255, 255, 0.42);`
- active：`background: linear-gradient(135deg, rgba(167, 243, 208, 0.9), rgba(186, 230, 253, 0.8));`
- 字色：墨绿色，不用蓝色

### 按钮颜色去蓝化

- 将 `rgba(37, 99, 235, 0.1)` → `rgba(7, 193, 96, 0.1)`（hover 背景）
- 将 `rgba(37, 99, 235, 0.28)` → `rgba(7, 193, 96, 0.22)`（hover border）
- 信息辅助色保留淡天蓝（`rgba(56, 189, 248, ...)`）

---

## 第 4 层：个人资料页 Web 化

### 文件

- 修改：`frontend/apps/web/src/pages/Profile.vue`

### 改动

- `.profile-page` 使用 `.fresh-page` 背景
- `.glass-card`：使用 fresh-glass 变量替换 `var(--chat-glass-blur: none)`
  - `background: var(--fresh-glass-bg);`
  - `border: 1px solid var(--fresh-glass-border);`
  - `backdrop-filter: var(--fresh-blur); -webkit-backdrop-filter: var(--fresh-blur);`
  - `box-shadow: var(--fresh-glass-shadow-soft);`
  - `border-radius: 22px;`
- `.profile-avatar` 增加绿色光晕：
  ```scss
  box-shadow:
    0 0 0 8px rgba(255, 255, 255, 0.45),
    0 18px 36px rgba(7, 193, 96, 0.16);
  ```

### 按钮

- primary：`background: linear-gradient(135deg, var(--fresh-green), var(--fresh-mint)); color: #fff;`
- secondary：半透明玻璃
- hover 轻微上浮
- 去掉 `rgba(37, 99, 235, 0.2)` 的蓝色阴影

### 表单

- input wrapper：`background: rgba(255, 255, 255, 0.58);`
- focus：`box-shadow: 0 0 0 1px rgba(7, 193, 96, 0.48) inset, 0 0 0 3px rgba(7, 193, 96, 0.12);`（绿色 glow 替代蓝色）

### 右侧卡片

- side-card sticky（桌面端），移动端不变

---

## 第 5 层：AiSettings.vue 统一处理

### 文件

- 修改：`frontend/apps/web/src/pages/AiSettings.vue`

### 改动

- 根节点是 `.ai-settings-page`，单独设置 background（不依赖 `.settings-page` 共享）
- 确保页面底面使用 `var(--fresh-page-bg)`
- 内部复用 `.settings-hero` / `.settings-content` / `.settings-card` / `.flat-button`，自动获得 Fresh Glass 升级
- 按钮颜色和卡片 hover 行为同 Settings 规则

### 统一页面背景规则

```scss
.settings-page,
.ai-settings-page,
.profile-page {
  min-height: 100%;
  padding: 28px;
  background: var(--fresh-page-bg);
}
```

---

## 第 6 层：聊天页微调（保留微信三栏）

### 文件

- 修改：`frontend/apps/web/src/features/chat/ChatContainer.vue`
- 可能修改：`ChatMessageList.vue`、`ChatComposer.vue`

### 改动

1. `.wechat-layout` background 改为 `var(--fresh-page-bg)`
2. `.chat-sidebar`、`.chat-header`、`.wechat-composer` 使用 `--fresh-glass-bg-strong` + `var(--fresh-blur)`
3. `.chat-main` 背景加极淡渐变（不破坏可读性）：
   ```scss
   background:
     linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.18)),
     radial-gradient(circle at 82% 12%, rgba(167, 243, 208, 0.22), transparent 30%),
     var(--chat-bg);
   ```
4. 消息气泡保持不变（微信绿 + 白色），仅 `box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);`
5. 消息列表背景增加极淡绿色/蓝色渐变，不过度
6. 输入区玻璃感增强

---

## 第 7 层：颜色去蓝化（保守策略）

### 范围

- **主要强调色**（按钮、hover、focus、kicker）：从 `rgba(37, 99, 235, ...)` 改为微信绿/薄荷绿
- **信息辅助色**（状态标识、链接色）：保留少量淡天蓝 `rgba(56, 189, 248, ...)`
- **涉及文件**：Settings.vue、Profile.vue、AiSettings.vue 的 CSS

### 替换映射

| 旧值 | 新值 | 用途 |
|------|------|------|
| `rgba(37, 99, 235, 0.28)` | `rgba(7, 193, 96, 0.22)` | hover border |
| `rgba(37, 99, 235, 0.14)` | `rgba(7, 193, 96, 0.14)` | background glow |
| `rgba(37, 99, 235, 0.12)` | `rgba(167, 243, 208, 0.12)` | background glow |
| `rgba(37, 99, 235, 0.1)` | `rgba(7, 193, 96, 0.1)` | hover background |
| `rgba(16, 185, 129, ...)` | `rgba(7, 193, 96, ...)` | 统一微信绿 |
| `--chat-accent-strong` | 保持或调整为绿色引用 | accent 颜色 |
| `rgba(37, 99, 235, 0.2)` | `rgba(7, 193, 96, 0.16)` | avatar shadow/glow |

---

## 修改文件清单

| 文件 | 操作 | 关键改动 |
|------|------|---------|
| `styles/fresh-glass.scss` | **新建** | --fresh-* 变量 + .fresh-page + .fresh-glass-card |
| `styles/index.scss` | 修改 | 添加 `@use 'fresh-glass';` |
| `features/moments/MomentsContainer.vue` | 修改 | grid 两栏 + 侧面板 + 玻璃卡片 + 嵌入兼容 |
| `pages/Settings.vue` | 修改 | 玻璃卡片 + 去蓝化 + segmented-control |
| `pages/Profile.vue` | 修改 | 玻璃卡片 + 头像光晕 + 表单绿色 focus |
| `pages/AiSettings.vue` | 修改 | 页面背景 + 复用设置页样式 |
| `features/chat/ChatContainer.vue` | 修改 | 背景渐变 + 玻璃增强 |
| `features/chat/ChatMessageList.vue` | 可能修改 | 消息列表背景微调 |
| `features/chat/ChatComposer.vue` | 可能修改 | 输入区玻璃增强 |

## 不在本次范围

- 业务逻辑、store、WebSocket、E2EE、API 调用
- 移动端布局逻辑（仅保留现有行为，不做结构调整）
- 路由调整
- 消息气泡样式大改
- 新增 UI 库
