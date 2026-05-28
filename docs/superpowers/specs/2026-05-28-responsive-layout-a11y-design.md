# Flutter Web 响应式布局与 Web 可访问性规范

## 概述

为 Flutter Web 建立统一的响应式布局系统和 Web 可访问性规范，替代当前零散的 MediaQuery / LayoutBuilder / 硬编码断点实现。目标是提供一套 Flutter idiomatic 的 layout primitives，对标 CSS + Tailwind 的能力（统一断点、spacing/grid 工具、responsive variants、aria/focus-visible），同时保持移动端底部导航和桌面侧边导航行为一致。

## 背景与问题

### 当前现状

- **3 个冲突的 `ResponsiveLayout` 类**：`breakpoints.dart`（600/900）、`utils/responsive.dart`（600/1024）、`im_ui`（768/1200），断点值各不相同
- **内联魔法数**：SettingsPage 使用 860/1200，MomentsMainPage 使用 768/1100
- **零无障碍支持**：整个代码库没有 Semantics、FocusTraversalGroup、键盘事件处理
- **`im_ui` 包未使用**：已声明依赖但从未导入，web app 有自己的重复实现
- **导航标签不一致**：MainLayout 用 l10n，MobileShell 硬编码中文

### 目标

1. 统一断点系统：compact / medium / expanded / large
2. 提供 `ResponsiveScaffold` / `AdaptivePane` / `ResponsiveValue` / `BreakpointScope` 等 layout primitives
3. NavigationRail / NavigationBar 的 label 统一走 l10n
4. 为核心交互控件添加 Tooltip、Semantics label、keyboard shortcut / focus traversal
5. ChatPage 支持桌面快捷键（Enter 发送、Shift+Enter 换行、Esc 返回/清空焦点）
6. 新增 accessibility widget tests

## 架构设计

### 方案选择：Hybrid 混合

采用 `InheritedWidget`（`BreakpointScope`）提供底层数据 + `BuildContext` 扩展提供便捷访问 + 少量核心 Widget 处理复杂场景。

理由：
- `BreakpointScope` 作为 `InheritedWidget` 保证断点数据的单一来源
- 扩展方法让已有代码迁移成本最低 — 只需改引用，不需重构 Widget 树
- `ResponsiveScaffold` / `AdaptivePane` 处理最复杂的 shell 切换逻辑

### 放置位置

所有响应式和可访问性工具统一放到 `im_ui` 包（`packages/ui/`），清理并替换现有冲突实现。

## 1. 断点系统

### Breakpoint 枚举

```dart
enum Breakpoint {
  compact,   // < 600px — 手机
  medium,    // 600–899px — 平板竖屏 / 小窗口
  expanded,  // 900–1199px — 平板横屏 / 桌面小窗
  large;     // >= 1200px — 桌面大屏

  static Breakpoint fromWidth(double width) {
    if (width < 600) return Breakpoint.compact;
    if (width < 900) return Breakpoint.medium;
    if (width < 1200) return Breakpoint.expanded;
    return Breakpoint.large;
  }

  T value<T>({required T compact, T? medium, T? expanded, T? large}) {
    switch (this) {
      case Breakpoint.compact: return compact;
      case Breakpoint.medium: return medium ?? compact;
      case Breakpoint.expanded: return expanded ?? medium ?? compact;
      case Breakpoint.large: return large ?? expanded ?? medium ?? compact;
    }
  }
}
```

### BreakpointScope（InheritedWidget）

```dart
class BreakpointScope extends StatelessWidget {
  final Widget child;
  const BreakpointScope({required this.child, super.key});

  static Breakpoint of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<_BreakpointData>();
    return scope?.breakpoint ?? Breakpoint.compact;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final bp = Breakpoint.fromWidth(constraints.maxWidth);
        return _BreakpointData(breakpoint: bp, child: child);
      },
    );
  }
}

class _BreakpointData extends InheritedWidget {
  final Breakpoint breakpoint;
  const _BreakpointData({required this.breakpoint, required super.child});

  @override
  bool updateShouldNotify(_BreakpointData old) =>
      breakpoint != old.breakpoint;
}
```

### BuildContext 扩展

```dart
extension ResponsiveContext on BuildContext {
  Breakpoint get breakpoint => BreakpointScope.of(this);
  bool get isCompact  => breakpoint == Breakpoint.compact;
  bool get isMedium   => breakpoint == Breakpoint.medium;
  bool get isExpanded => breakpoint == Breakpoint.expanded;
  bool get isLarge    => breakpoint == Breakpoint.large;
  bool get isMobile   => isCompact || isMedium;
  bool get isDesktop  => isExpanded || isLarge;
}
```

### 断点值映射

| 用途 | compact | medium | expanded | large |
|------|---------|--------|----------|-------|
| session panel 宽度 | 0 (隐藏) | 0 (隐藏) | 320 | 320 |
| settings nav 宽度 | 0 (隐藏) | 216 | 216 | 216 |
| settings 二级列 | 0 (隐藏) | 0 (隐藏) | 0 (隐藏) | 340 |
| page padding | 8 | 16 | 24 | 32 |

## 2. Layout Primitives

### ResponsiveScaffold

自动在移动端（NavigationBar）和桌面端（NavigationRail）之间切换的 Shell Widget。

```dart
class ResponsiveScaffold extends StatelessWidget {
  final List<NavDestination> destinations;
  final Widget child;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  // compact/medium → NavigationBar（底部）
  // expanded/large → NavigationRail（左侧）
  // NavDestination 的 label 全部走 l10n
}
```

`NavDestination` 数据类：

```dart
class NavDestination {
  final IconData icon;
  final Widget label;    // 支持 Text 和 l10n
  final String route;
}
```

### AdaptivePane

内容区域自适应面板，用于需要根据断点切换布局的页面。

```dart
class AdaptivePane extends StatelessWidget {
  final Widget? compactBuilder;
  final Widget? mediumBuilder;
  final Widget? expandedBuilder;
  final Widget? largeBuilder;

  // 缺省规则：未提供的断点向下取最近的
  // compact 缺省 → 使用 medium
  // medium 缺省 → 使用 expanded
  // expanded 缺省 → 使用 large
}
```

### ResponsiveValue<T>

用于简单值选择（不需要 Widget）：

```dart
// 通过扩展方法使用（推荐）
final padding = context.breakpoint.value(
  compact: 8, medium: 16, expanded: 24, large: 32,
);

// 作为 Widget 使用
ResponsiveValue<double>(
  compact: 8, medium: 16, expanded: 24, large: 32,
  builder: (context, value) => Padding(padding: EdgeInsets.all(value)),
)
```

## 3. 可访问性

### 策略

采用渐进增强方式，为现有 Widget 添加可访问性支持，不改变视觉行为。

### Semantics 标签

| 控件 | Semantics 标签 | 位置 |
|------|---------------|------|
| NavigationRail/Bar 目标 | `'聊天'`, `'联系人'`, `'群组'`, `'朋友圈'`, `'设置'` | im_ui responsive |
| MessageInput 发送按钮 | `'发送消息'` | message_input.dart |
| MessageInput 附件按钮 | `'添加附件'` | message_input.dart |
| MessageInput 语音按钮 | `'语音输入'` | message_input.dart |
| SessionTile | 语义化会话名称 + 未读数 | session_tile.dart |
| SettingsNavPanel 各项 | `'个人信息'`, `'AI 设置'`, `'安全设置'` 等 | settings_nav_panel.dart |
| 网络状态横幅 | `'网络已连接'` / `'网络已断开'` | network_status_banner.dart |
| E2EE 锁图标 | `'此消息已端到端加密'` | message_lock_icon.dart |

### Tooltip 标准

- 所有纯图标按钮（无文字标签）必须有 Tooltip
- Tooltip 文本通过 l10n 获取，不硬编码中文
- 现有 3 个 Tooltip（lock_icon、network_banner、message_input）改用 l10n

### Focus 管理

- `MessageInput` 添加 `FocusNode`，页面打开时自动聚焦
- `SettingsNavPanel` 各项添加 `FocusNode`，支持 Tab 导航
- 在 `MainLayout` 和 `MobileShell` 外层包裹 `FocusTraversalGroup`

### 键盘快捷键（ChatPage）

- `Enter` → 发送消息（当前已有 onSubmitted）
- `Shift+Enter` → 换行（当前已支持，Flutter TextField 默认行为）
- `Esc` → 优先清空输入框焦点，再次按 Esc 返回会话列表

键盘事件通过 `CallbackShortcuts` + `Actions` 实现（Flutter 推荐方式）：

```dart
CallbackShortcuts(
  bindings: {
    LogicalKeySet(LogicalKeyboardKey.escape): _handleEsc,
  },
  child: ...
)
```

## 4. 迁移策略

### im_ui 包变更

| 文件 | 变更 |
|------|------|
| `src/layouts/layouts.dart` | 删除旧 `ResponsiveLayout`（768/1200），替换为新断点系统 |
| `src/layouts/responsive_scope.dart` | **新增** `BreakpointScope` + `Breakpoint` 枚举 |
| `src/layouts/responsive_context.dart` | **新增** `BuildContext` 扩展 |
| `src/layouts/responsive_scaffold.dart` | **新增** `ResponsiveScaffold` |
| `src/layouts/adaptive_pane.dart` | **新增** `AdaptivePane` |
| `src/layouts/responsive_value.dart` | **新增** `ResponsiveValue<T>` |
| `src/layouts/side_nav_layout.dart` | **更新** 为基于新断点的实现 |
| `src/a11y/semantics_wrapper.dart` | **新增** 语义化包装 Widget |
| `src/a11y/accessible_button.dart` | **新增** 带 Semantics + Tooltip 的按钮 |

### Web App 变更

| 文件 | 变更 |
|------|------|
| `core/responsive/breakpoints.dart` | **删除** — 由 im_ui 替代 |
| `core/responsive/mobile_shell.dart` | **重构** — 用 `ResponsiveScaffold` 替代，标签改用 l10n |
| `core/utils/responsive.dart` | **删除** — 由 im_ui 替代 |
| `core/router/app_router.dart` | **重构** — MainLayout 改用 `ResponsiveScaffold`，删除旧 ResponsiveLayout 引用 |
| `features/chat/presentation/chat_page.dart` | **重构** — 用 `AdaptivePane` + `context.breakpoint` 替代内联断点逻辑，添加键盘快捷键 |
| `features/chat/presentation/widgets/message_input.dart` | **更新** — 添加 Semantics、FocusNode、Tooltip（l10n） |
| `features/settings/presentation/settings_page.dart` | **重构** — 860/1200 替换为断点常量 |
| `features/moments/presentation/moments_main_page.dart` | **重构** — 768/1100 替换为断点常量 |
| `features/auth/presentation/login_page.dart` | **更新** — 改用 im_ui 的响应式 API |
| `features/auth/presentation/register_page.dart` | **更新** — 同上 |
| `features/auth/presentation/widgets/auth_card.dart` | **更新** — 改用 im_ui 响应式 API |

### l10n 新增键

```json
{
  "nav_chat": "聊天",
  "nav_contacts": "联系人",
  "nav_groups": "群组",
  "nav_moments": "朋友圈",
  "nav_settings": "设置",
  "a11y_send_message": "发送消息",
  "a11y_add_attachment": "添加附件",
  "a11y_voice_input": "语音输入",
  "a11y_network_connected": "网络已连接",
  "a11y_network_disconnected": "网络已断开",
  "a11y_encrypted_message": "此消息已端到端加密",
  "a11y_settings_profile": "个人信息",
  "a11y_settings_ai": "AI 设置",
  "a11y_settings_security": "安全设置"
}
```

## 5. 测试计划

| 测试文件 | 覆盖内容 |
|----------|---------|
| `test/responsive/breakpoint_test.dart` | Breakpoint.fromWidth、value 选择 |
| `test/responsive/breakpoint_scope_test.dart` | BreakpointScope 在不同宽度下提供正确断点 |
| `test/responsive/responsive_scaffold_test.dart` | 宽度变化时 NavigationBar/NavigationRail 切换 |
| `test/responsive/adaptive_pane_test.dart` | 不同断点下显示正确子 Widget |
| `test/a11y/semantics_test.dart` | 核心控件有正确的 Semantics 标签 |
| `test/a11y/keyboard_test.dart` | ChatPage Esc/Enter 快捷键行为 |

## 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 架构方案 | Hybrid 混合（InheritedWidget + 扩展 + Widget） | 兼顾简洁和结构化 |
| 断点层级 | 4 层（compact/medium/expanded/large） | 覆盖手机、平板、小桌面、大桌面 |
| 放置位置 | im_ui 包 | 统一共享，避免重复 |
| Esc 行为 | 优先清空焦点，再返回列表 | 两步操作更安全 |
| 可访问性范围 | 核心交互控件优先 | 渐进增强，覆盖主要用户路径 |
| im_ui 整合 | 清理并统一 | 替换冲突实现，避免技术债务累积 |
