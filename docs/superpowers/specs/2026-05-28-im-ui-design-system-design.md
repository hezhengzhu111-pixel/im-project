# IM UI 设计系统建设

## 概述

将 `flutter/packages/ui`（im_ui）从空壳包建设为可复用的 IM 设计系统，提供 design tokens、统一主题、基础组件和组件预览入口。对标 Element Plus / Naive UI 的工程体验。

## 当前状态

- im_ui 包已有基础组件（UserAvatar、UnreadBadge、EmptyState 等），但 web app **零 import**
- web app 有自己的 AppTheme + GlassTheme，与 im_ui 的 AppTheme 完全分叉
- 大量硬编码颜色散落在 auth/chat 等页面
- 无测试、无组件文档

## 范围

**本次交付：**
1. Design Tokens（ImTokens）
2. 统一 Theme（ImTheme）
3. 8 个基础组件
4. 组件预览页（Debug Gallery）
5. LoginPage 全量迁移（输入框+按钮+表单卡片）
6. Widget tests

**不在本次范围：**
- SettingsPage / ChatPage 迁移
- GlassTheme 改造（保留在 web app）
- 其余页面迁移

## 技术约束

- Material 3 底层能力
- im_ui 不依赖 im_web
- Google Fonts (Noto Sans SC) 用于 CJK 文字

---

## 1. Design Tokens（ImTokens）

**文件：** `flutter/packages/ui/lib/src/theme/im_tokens.dart`

两层结构：Semantic tokens（语义颜色）+ Component tokens（组件级引用）。

### Spacing（4px 基准倍数）

| Token | Value |
|---|---|
| `space0` | 0 |
| `space1` | 4 |
| `space2` | 8 |
| `space3` | 12 |
| `space4` | 16 |
| `space5` | 20 |
| `space6` | 24 |
| `space8` | 32 |
| `space10` | 40 |
| `space12` | 48 |

### Radius

| Token | Value |
|---|---|
| `radiusNone` | 0 |
| `radiusSm` | 4 |
| `radiusMd` | 8 |
| `radiusLg` | 12 |
| `radiusXl` | 16 |
| `radiusFull` | 999 |

### Typography（Font Size）

| Token | Value |
|---|---|
| `textXs` | 12 |
| `textSm` | 14 |
| `textBase` | 16 |
| `textLg` | 18 |
| `textXl` | 20 |
| `text2xl` | 24 |
| `text3xl` | 30 |

### Elevation

| Token | Value |
|---|---|
| `elevationNone` | 0 |
| `elevationSm` | 1 |
| `elevationMd` | 2 |
| `elevationLg` | 4 |
| `elevationXl` | 8 |

### Breakpoints

| Token | Value |
|---|---|
| `breakpointMobile` | 600 |
| `breakpointTablet` | 900 |
| `breakpointDesktop` | 1200 |

### Semantic Colors

每个语义颜色有 light/dark 两个值，通过 `ImColors` 类提供：

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `primary` | `#2196F3` | `#90CAF9` | 主色 |
| `secondary` | `#4CAF50` | `#81C784` | 辅助色 |
| `error` | `#F44336` | `#EF5350` | 错误 |
| `warning` | `#FF9800` | `#FFB74D` | 警告 |
| `success` | `#4CAF50` | `#66BB6A` | 成功 |
| `info` | `#2196F3` | `#64B5F6` | 信息 |
| `background` | `#FAFAFA` | `#121212` | 页面背景 |
| `surface` | `#FFFFFF` | `#1E1E1E` | 卡片/容器背景 |
| `surfaceVariant` | `#F5F5F5` | `#2C2C2C` | 次级表面 |
| `textPrimary` | `#212121` | `#E0E0E0` | 主文字 |
| `textSecondary` | `#757575` | `#9E9E9E` | 次要文字 |
| `textDisabled` | `#BDBDBD` | `#616161` | 禁用文字 |
| `border` | `#E0E0E0` | `#424242` | 边框 |
| `borderFocus` | `#2196F3` | `#90CAF9` | 聚焦边框 |
| `borderError` | `#F44336` | `#EF5350` | 错误边框 |
| `overlay` | `#00000054` | `#00000080` | 遮罩层 |

IM 专用语义颜色：

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `ownMessageBubble` | `#DCF8C6` | `#005C4B` | 自己的消息气泡 |
| `otherMessageBubble` | `#FFFFFF` | `#1F2C33` | 他人消息气泡 |
| `systemMessageBubble` | `#E1F5FE` | `#0D2137` | 系统消息气泡 |
| `online` | `#4CAF50` | `#66BB6A` | 在线状态 |
| `offline` | `#9E9E9E` | `#757575` | 离线状态 |
| `busy` | `#F44336` | `#EF5350` | 忙碌状态 |

### Component Tokens

Component tokens 引用 semantic tokens，通过 `ImComponentTokens` 类提供：

**Button：**
- `buttonPrimaryBg` → `primary`
- `buttonPrimaryText` → `#FFFFFF`
- `buttonPrimaryHover` → primary 稍深
- `buttonPrimaryDisabled` → primary + 38% opacity
- `buttonSecondaryBg` → transparent
- `buttonSecondaryText` → `primary`
- `buttonSecondaryBorder` → `primary`
- `buttonDangerBg` → `error`
- `buttonDangerText` → `#FFFFFF`

**Input：**
- `inputBg` → `surface`
- `inputBorder` → `border`
- `inputBorderFocus` → `borderFocus`
- `inputBorderError` → `borderError`
- `inputText` → `textPrimary`
- `inputPlaceholder` → `textSecondary`

**Card：**
- `cardBg` → `surface`
- `cardBorder` → `border`
- `cardShadow` → elevation-based

**Badge：**
- `badgeBg` → `error`
- `badgeText` → `#FFFFFF`

所有值为 `static const`，编译时常量。

---

## 2. Theme（ImTheme）

**文件：** `flutter/packages/ui/lib/src/theme/im_theme.dart`

```dart
class ImTheme {
  ImTheme._();
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark()  => _build(Brightness.dark);
}
```

`_build` 方法：
1. 使用 `ColorScheme.fromSeed(seedColor: ImTokens.primaryColor, brightness: brightness)` 生成颜色方案
2. 应用 `GoogleFonts.notoSansScTextTheme()` 作为文字主题
3. 配置所有组件级 theme overrides：AppBarTheme、CardTheme、InputDecorationTheme、ElevatedButtonThemeData、FilledButtonThemeData、OutlinedButtonThemeData、DialogTheme、SnackBarThemeData 等
4. **不包含 GlassTheme** — GlassTheme 保留在 web app，web app 通过 `MaterialApp.router` 的 `extensions` 参数自行注入

### 与现有代码的关系

| 现有代码 | 处理方式 |
|---|---|
| `im_ui/AppTheme` | 标记 `@Deprecated`，保留但不推荐使用 |
| `web app/AppTheme` | 重构为调用 `ImTheme.light()` / `ImTheme.dark()` |
| `web app/GlassTheme` | 保留不动，由 web app 的 `MaterialApp.router` 自行注入 extensions |

### web app app.dart 改动

```dart
// Before
theme: AppTheme.lightTheme,
darkTheme: AppTheme.darkTheme,

// After
theme: ImTheme.light(),
darkTheme: ImTheme.dark(),
```

同时接入 `themeModeProvider`：
```dart
themeMode: ref.watch(themeModeProvider),
```

---

## 3. 组件 API 设计

### 3.1 ImButton

```dart
enum ImButtonVariant { primary, secondary, danger, ghost, text }
enum ImButtonSize { sm, md, lg }

class ImButton extends StatelessWidget {
  const ImButton({
    super.key,
    this.variant = ImButtonVariant.primary,
    this.size = ImButtonSize.md,
    this.label,
    this.icon,
    this.onPressed,
    this.loading = false,
    this.fullWidth = false,
  });

  final ImButtonVariant variant;
  final ImButtonSize size;
  final String? label;
  final Widget? icon;
  final VoidCallback? onPressed;
  final bool loading;
  final bool fullWidth;
}
```

Size 映射：
- `sm`: padding 8x16, fontSize 14, height 32
- `md`: padding 12x24, fontSize 16, height 40
- `lg`: padding 16x32, fontSize 18, height 48

### 3.2 ImTextField

```dart
class ImTextField extends StatelessWidget {
  const ImTextField({
    super.key,
    this.label,
    this.hintText,
    this.errorText,
    this.controller,
    this.obscure = false,
    this.prefix,
    this.suffix,
    this.onChanged,
    this.maxLines = 1,
    this.enabled = true,
  });

  final String? label;
  final String? hintText;
  final String? errorText;
  final TextEditingController? controller;
  final bool obscure;
  final Widget? prefix;
  final Widget? suffix;
  final ValueChanged<String>? onChanged;
  final int maxLines;
  final bool enabled;
}
```

- 内置 `InputDecoration`，使用 component tokens
- `errorText` 非空时自动显示错误样式（红色边框 + 错误文字）
- 支持 `prefix`/`suffix` 图标或自定义 widget

### 3.3 ImCard

```dart
class ImCard extends StatelessWidget {
  const ImCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.onTap,
    this.elevated = false,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final bool elevated;
}
```

- 默认：`surfaceContainerLow` 背景 + 1px border
- `elevated: true`：加 shadow
- `onTap` 非空时加 hover 效果

### 3.4 ImEmpty

```dart
class ImEmpty extends StatelessWidget {
  const ImEmpty({
    super.key,
    this.title,
    this.subtitle,
    this.icon,
    this.action,
  });

  final String? title;
  final String? subtitle;
  final IconData? icon;
  final Widget? action;
}
```

### 3.5 ImAvatar

```dart
class ImAvatar extends StatelessWidget {
  const ImAvatar({
    super.key,
    this.imageUrl,
    required this.name,
    this.size = 40,
    this.showStatus = false,
    this.isOnline = false,
  });

  final String? imageUrl;
  final String name;
  final double size;
  final bool showStatus;
  final bool isOnline;
}
```

### 3.6 ImBadge

```dart
class ImBadge extends StatelessWidget {
  const ImBadge({
    super.key,
    this.count = 0,
    this.maxCount = 99,
    this.child,
  });

  final int count;
  final int maxCount;
  final Widget? child;
}
```

- `count > 0`：显示数字徽章
- `child != null`：在 child 右上角显示徽章/圆点

### 3.7 ImDialog

```dart
class ImDialogAction {
  const ImDialogAction({
    required this.label,
    required this.onPressed,
    this.isDestructive = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool isDestructive;
}

class ImDialog extends StatelessWidget {
  const ImDialog({
    super.key,
    this.title,
    required this.content,
    required this.actions,
  });

  final String? title;
  final Widget content;
  final List<ImDialogAction> actions;
}
```

### 3.8 ImNavItem

```dart
class ImNavItem extends StatelessWidget {
  const ImNavItem({
    super.key,
    required this.icon,
    this.selectedIcon,
    required this.label,
    this.badge,
    this.isSelected = false,
    required this.onTap,
  });

  final IconData icon;
  final IconData? selectedIcon;
  final String label;
  final int? badge;
  final bool isSelected;
  final VoidCallback onTap;
}
```

---

## 4. 组件预览页（Gallery）

**文件：** `flutter/apps/web/lib/features/debug/presentation/component_gallery_page.dart`

**路由：** `/debug/gallery`，仅 `kDebugMode` 时注册。

**页面结构：**
- 左侧导航：组件分类列表（Button / TextField / Card / Empty / Avatar / Badge / Dialog / NavItem）
- 右侧内容：选中组件的所有变体展示

**展示内容：**
- ImButton: 5 variants × 3 sizes × loading/disabled 状态
- ImTextField: default/focused/error/disabled × with prefix/suffix
- ImCard: default/elevated/tappable
- ImEmpty: icon/title+subtitle/with action
- ImAvatar: image/initials/with status
- ImBadge: count/zero/max count/with child
- ImDialog: confirm/destructive/multi-action（点击触发 dialog）
- ImNavItem: selected/unselected/with badge

---

## 5. LoginPage 迁移

### 替换点

| 现有组件 | 替换为 | 文件 |
|---|---|---|
| `AuthCard`（自定义 Container） | `ImCard(elevated: true)` | auth_card.dart → 可删除 |
| `TextField`（硬编码样式） | `ImTextField(hintText: ..., prefix: Icon(...))` | login_page.dart 内联 |
| `ElevatedButton`（硬编码颜色） | `ImButton(variant: primary, label: '登录')` | login_page.dart 内联 |
| `TextButton`（注册链接） | `ImButton(variant: text, label: '注册')` | login_page.dart 内联 |
| `Color(0xFF667eea)` 等硬编码颜色 | `ImTokens.primaryColor` / `Theme.of(context).colorScheme` | 多处 |

### 不动的部分

- 渐变背景（decorative_background.dart）
- 装饰圆圈动画
- 品牌展示组件（brand_showcase.dart）
- 协议对话框（agreement_dialog.dart）

---

## 6. 测试

### Token 测试（`test/theme/im_tokens_test.dart`）

- spacing 值单调递增
- radius 值有效（> 0 且合理范围）
- 所有 semantic colors 已定义
- component tokens 引用有效的 semantic tokens

### Theme 测试（`test/theme/im_theme_test.dart`）

- `light()` 返回 brightness 为 light 的 ThemeData
- `dark()` 返回 brightness 为 dark 的 ThemeData
- 两个 theme 都有有效的 colorScheme
- textTheme 不为 null

### 组件测试

每个组件至少 3 个测试：

**ImButton（`test/widgets/im_button_test.dart`）：**
- 渲染 primary variant
- tapped 时调用 onPressed
- loading 时显示 spinner
- onPressed 为 null 时 disabled

**ImTextField（`test/widgets/im_text_field_test.dart`）：**
- 渲染带 hintText
- onChanged 回调触发
- errorText 显示错误样式

**ImCard（`test/widgets/im_card_test.dart`）：**
- 渲染 child
- onTap 回调触发
- elevated 模式渲染 shadow

---

## 7. 文件结构

```
flutter/packages/ui/lib/
  ui.dart                              (barrel, re-exports everything)
  src/
    theme/
      im_tokens.dart                   (NEW)
      im_theme.dart                    (NEW)
      app_theme.dart                   (existing, @Deprecated)
    widgets/
      im_button.dart                   (NEW)
      im_text_field.dart               (NEW)
      im_card.dart                     (NEW)
      im_empty.dart                    (NEW)
      im_avatar.dart                   (NEW)
      im_badge.dart                    (NEW)
      im_dialog.dart                   (NEW)
      im_nav_item.dart                 (NEW)
      widgets.dart                     (existing, 保留旧组件)
    layouts/
      layouts.dart                     (existing, 不变)

flutter/packages/ui/test/
  theme/
    im_tokens_test.dart                (NEW)
    im_theme_test.dart                 (NEW)
  widgets/
    im_button_test.dart                (NEW)
    im_text_field_test.dart            (NEW)
    im_card_test.dart                  (NEW)

flutter/apps/web/lib/
  features/debug/presentation/
    component_gallery_page.dart        (NEW)
  core/theme/
    app_theme.dart                     (修改: 消费 ImTheme)
  features/auth/presentation/
    login_page.dart                    (修改: 使用 im_ui 组件)
    auth_card.dart                     (删除: 被 ImCard 替代)
```

## 8. 向后兼容

旧组件（UserAvatar、UnreadBadge、EmptyState、SearchInput、ConfirmDialog、TimeFormatter）保留在 widgets.dart 中，标记为 `@Deprecated('Use ImXxx instead')`。新旧组件同时存在，后续迁移时逐步替换。

---

## 9. 成功标准

1. im_ui 包可通过 `import 'package:im_ui/ui.dart'` 使用所有新组件
2. LoginPage 所有硬编码颜色/按钮/输入框替换为 im_ui 组件
3. web app 的 AppTheme 消费 ImTheme
4. `/debug/gallery` 路由可在 debug 模式访问，展示所有组件变体
5. 所有 widget tests 通过
6. im_ui 不依赖 im_web
