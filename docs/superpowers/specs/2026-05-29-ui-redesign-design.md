# UI 美化设计方案 — 分层混合风格

> 日期：2026-05-29
> 状态：已批准
> 方案：分层混合（Approach C）

## 概述

将现有 Flutter Web IM 应用的 UI 从基础 Material 风格升级为现代化视觉设计，采用分层混合策略：不同页面根据内容特征使用不同视觉风格，通过统一的设计语言保持整体一致性。

### 目标

- 引入毛玻璃（Glassmorphism）、流体渐变、微交互动画、新拟态阴影四大特效
- 在视觉效果和性能之间取得平衡，低端设备自动降级
- 全部页面一次性改造

### 约束

- **只改 UI 和交互逻辑，绝对不改动接口、数据层、状态管理相关代码**（API 调用、Repository、Provider/State、数据模型等一律不动）
- Flutter Web 平台，`backdrop-filter` 有性能开销
- 需保持 Light/Dark 双主题支持
- 基于现有 `GlassTheme` ThemeExtension 架构扩展，不破坏现有 API

---

## 0. 改动边界（重要）

### ✅ 可以改动

- **主题层**：`glass_theme.dart`、`app_theme.dart`、`im_tokens.dart`、`im_theme.dart`
- **UI 组件**：`presentation/widgets/` 下所有 Widget 的外观、动画、布局
- **页面布局**：`presentation/` 下所有 Page 的视觉结构、装饰效果
- **新增共享组件**：`im_ui` 包中的新 Widget（GlassCard 等）

### ❌ 禁止改动

- **数据层**：`data/` 目录下所有文件（API 调用、Repository 实现）
- **状态管理**：所有 `*_provider.dart`、`*_state.dart` 文件（Riverpod Provider/State）
- **数据模型**：`im_core` 包中的 Model 类
- **路由逻辑**：`app_router.dart` 的路由定义和守卫逻辑
- **国际化**：`l10n/` 目录下的 ARB 文件和生成代码

---

## 1. 页面风格分配

| 页面 | 风格 | 核心效果 | 理由 |
|------|------|----------|------|
| 登录 / 注册 | 流体渐变 | 动态渐变背景 + 毛玻璃卡片 + 粒子动画 | 第一印象，需要视觉冲击力 |
| 聊天 | 柔和渐变 | 微妙渐变背景 + 毛玻璃侧边栏 + 聊天气泡微动画 | 高频使用，不能太花哨影响阅读 |
| 联系人 / 群组 | 毛玻璃 | 半透明卡片 + 柔和阴影 + 悬浮高亮 | 信息密度高，需要清晰层次 |
| 朋友圈 | 极简留白 | 大留白 + 细分割线 + 内容优先 | 内容为主，不应抢夺注意力 |
| 设置 | 毛玻璃 | 半透明面板 + 分组卡片 + 平滑切换动画 | 工具性页面，需要整洁高效 |

### 统一元素

- **导航栏**：始终使用毛玻璃背景
- **按钮系统**：渐变主按钮 + 毛玻璃次要按钮 + 悬浮缩放
- **对话框**：毛玻璃背景 + 淡入动画 + 圆角 20px
- **输入框**：半透明背景 + 聚焦时渐变边框 + 柔和阴影

---

## 2. 核心组件设计

### 2.1 毛玻璃卡片 (Glassmorphism)

**Light Mode 参数：**
```dart
backdropFilter: blur(12px)
background: rgba(255, 255, 255, 0.6)
border: 1px solid rgba(255, 255, 255, 0.8)
borderRadius: 16px
boxShadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)
```

**Dark Mode 参数：**
```dart
backdropFilter: blur(16px)
background: rgba(30, 30, 50, 0.7)
border: 1px solid rgba(255, 255, 255, 0.08)
borderRadius: 16px
boxShadow: 0 4px 24px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)
```

**注意**：Flutter 的 `BackdropFilter` 内部已处理浏览器前缀兼容。

### 2.2 流体渐变背景

- 登录页全屏动态渐变：`linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)`
- `background-size: 400% 400%`，8 秒循环动画
- 浮动光球：3-4 个半透明圆形，5-8 秒浮动动画
- 聊天页使用微妙静态渐变（避免动画干扰阅读）

**性能策略**：使用 Flutter `AnimationController` 驱动 GPU 友好的属性（opacity、transform），低端设备降级为静态渐变。

### 2.3 微交互动画

| 交互 | 效果 | 参数 |
|------|------|------|
| 聊天气泡入场 | 底部淡入 + 微位移 | 8px, 200ms ease-out |
| 按钮悬浮 | 轻微上浮 + 阴影扩大 | 2px, 150ms ease |
| 页面切换 | 交叉淡入淡出 | 300ms Curves.easeInOut |
| 列表项悬浮 | 背景色渐变 + 左侧彩色条 | 150ms ease |
| 开关切换 | 弹性滑动 + 背景色渐变 | 250ms spring |
| 对话框弹出 | 缩放 + 淡入 | 250ms Curves.easeOutBack |

### 2.4 新拟态阴影系统

四级阴影 token，用于不同层级的 UI 元素：

| Level | 用途 | 效果 |
|-------|------|------|
| 1 | 凹陷面板 | `6px 6px 12px #d1d1d4, -6px -6px 12px #ffffff` |
| 2 | 平面上升 | `4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff` |
| 3 | 悬浮卡片 | `8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff` |
| 4 | 主按钮 | `8px 8px 20px rgba(102,126,234,0.3), -4px -4px 12px #ffffff` |

---

## 3. 技术实现

### 3.1 架构改动

**增强 GlassTheme（ThemeExtension）：**
- 新增 `blurIntensity` 参数（light: 12, dark: 16）
- 新增 `gradientColors` 支持页面级渐变
- 新增 `neumorphicShadow` 四级阴影 token
- 新增 `animationDuration` 统一动画时长

**新增共享组件（im_ui 包）：**
- `GlassCard` — 可复用毛玻璃卡片，支持 blur/透明度/圆角配置
- `GradientBackground` — 流体渐变背景容器，支持动态/静态模式
- `AnimatedEntrance` — 统一入场动画包装器，支持位移/淡入/缩放
- `NeumorphicButton` — 新拟态按钮变体

### 3.2 性能策略

**降级机制：**
- 检测 `kIsWeb` 平台标识，Web 端启用 blur 降级逻辑
- 低端设备判定：连续 3 帧动画低于 30fps 时自动降级
- 降级后：关闭 `BackdropFilter`，使用纯色背景替代毛玻璃
- 渐变动画降级为静态渐变
- 微交互时长 ×0.5（感觉更快）

**优化手段：**
- 使用 `RepaintBoundary` 隔离动画区域
- 使用 `AnimationController` 驱动 GPU 友好属性（opacity、transform）
- 限制 `BackdropFilter` 作用区域在 200×200 像素内
- 懒加载：滚动到视口内才启用特效

### 3.3 改动文件清单

**主题层（核心）：**
- `flutter/apps/web/lib/core/theme/glass_theme.dart` — 扩展属性
- `flutter/apps/web/lib/core/theme/app_theme.dart` — 新增动画主题
- `flutter/packages/ui/lib/src/theme/im_tokens.dart` — 新增阴影/动画 token

**共享组件（im_ui）：**
- 新增 `flutter/packages/ui/lib/src/widgets/glass_card.dart`
- 新增 `flutter/packages/ui/lib/src/widgets/gradient_background.dart`
- 新增 `flutter/packages/ui/lib/src/widgets/animated_entrance.dart`

**页面改造：**
- `login_page.dart` — 流体渐变背景
- `register_page.dart` — 同上
- `chat_page.dart` — 毛玻璃侧栏 + 渐变底色
- `contacts_page.dart` — 毛玻璃卡片
- `group_list_page.dart` — 毛玻璃卡片
- `moments_main_page.dart` — 极简留白
- `settings_page.dart` — 毛玻璃面板

**组件改造：**
- `session_tile.dart` — 悬浮动画
- `message_bubble.dart` — 入场动画
- `message_input.dart` — 毛玻璃底栏
- `ResponsiveScaffold` / NavigationRail — 毛玻璃背景

### 3.4 实施顺序

1. 主题 Token + GlassTheme 扩展
2. 共享组件（GlassCard, GradientBackground, AnimatedEntrance）
3. 登录/注册页
4. 聊天页
5. 联系人/群组/朋友圈/设置页

---

## 4. 测试策略

- Light/Dark 模式视觉回归测试
- 低端设备降级验证（关闭 blur 后 UI 仍正常）
- 动画流畅度验证（60fps 目标）
- 响应式断点下各页面布局正确性
- 现有 Widget 测试不受影响
