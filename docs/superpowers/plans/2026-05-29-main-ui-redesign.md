# IM 主界面 UI 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录后的全部页面从 Material 默认样式升级为"赛博悬浮发光"风格，实现与登录页的视觉统一。

**Architecture:** 采用 Token 优先策略 — 先修改底层 `ImColors`/`ImTokens`/`ImTheme`，全局自动生效；再逐个修复直接使用 `GlassTheme` 或硬编码样式的组件和页面。新增 `GradientButton` 通用组件封装四色渐变按钮。

**Tech Stack:** Flutter (Dart), Material 3, Riverpod, GlassTheme (ThemeExtension)

---

## 文件变更总览

### 修改的文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `flutter/packages/ui/lib/src/theme/im_tokens.dart` | 修改 | 更新 ImColors 主色/背景色，新增 brandGradient，更新 ImComponentTokens |
| `flutter/packages/ui/lib/src/theme/im_theme.dart` | 修改 | 更新 NavigationRail/Input/Card/Button/ListTile/TabBar 组件主题 |
| `flutter/apps/web/lib/core/theme/glass_theme.dart` | 修改 | 更新 accentGradient、softShadow、navBackground |
| `flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart` | 修改 | 移除 BackdropFilter/VerticalDivider，实现赛博悬浮发光导航栏 |
| `flutter/apps/web/lib/features/settings/presentation/widgets/settings_section.dart` | 修改 | 移除毛玻璃，改为纯白卡片 + 微弱阴影 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart` | 修改 | 更新选中态为品牌紫色叠加 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart` | 修改 | 更新输入栏背景和边框样式 |
| `flutter/apps/web/lib/features/chat/presentation/chat_page.dart` | 修改 | 移除搜索栏 BackdropFilter，更新搜索框样式 |
| `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart` | 修改 | 移除头部 BackdropFilter/Border，更新 TabBar 样式 |
| `flutter/apps/web/lib/features/group/presentation/group_list_page.dart` | 修改 | 移除头部 BackdropFilter/Border |
| `flutter/apps/web/lib/features/moments/presentation/moments_main_page.dart` | 修改 | 移除 VerticalDivider |
| `flutter/apps/web/lib/features/settings/presentation/profile_page.dart` | 修改 | Colors.green → ImTokens 颜色，硬编码间距 → ImTokens |
| `flutter/apps/web/lib/features/group/presentation/create_group_page.dart` | 修改 | 硬编码间距 → ImTokens，输入框样式更新 |
| `flutter/apps/web/lib/features/settings/presentation/ai_settings_page.dart` | 修改 | 硬编码间距 → ImTokens |
| `flutter/apps/web/lib/features/settings/presentation/settings_page.dart` | 修改 | FilledButton.tonal → GradientButton |
| `flutter/apps/web/lib/features/contacts/presentation/add_friend_page.dart` | 修改 | FilledButton.tonal → GradientButton |
| `flutter/packages/ui/test/theme/im_theme_test.dart` | 修改 | 更新测试断言以匹配新颜色值 |

### 新增的文件

| 文件 | 说明 |
|------|------|
| `flutter/packages/ui/lib/src/widgets/gradient_button.dart` | 通用四色渐变按钮组件 |

---

## Task 1: 更新 ImColors / ImTokens 设计令牌

**Files:**
- Modify: `flutter/packages/ui/lib/src/theme/im_tokens.dart`

- [ ] **Step 1: 更新 ImColors.light 主色和背景色**

找到 `ImColors` 的 `light` factory，修改以下字段：

```dart
// 在 ImColors.light factory 中:
primary: const Color(0xFF764BA2),        // 原 #2196F3 (蓝色) → 品牌紫色
background: const Color(0xFFF7F8FA),     // 原 #FAFAFA → 浅灰紫
borderFocus: const Color(0xFF764BA2),    // 原 #2196F3 → 品牌紫色
info: const Color(0xFF764BA2),           // 原 #2196F3 → 品牌紫色
```

- [ ] **Step 2: 在 ImColors 中新增 brandGradient 字段**

在 `ImColors` 类中添加一个新的字段（在 light 和 dark factory 中都添加）：

```dart
// ImColors.light 中添加:
brandGradient: const [
  Color(0xFF667eea),
  Color(0xFF764BA2),
  Color(0xFF23a6d5),
  Color(0xFF23d5ab),
],
```

```dart
// ImColors.dark 中添加（保持相同的渐变，暗色模式不做精细打磨）:
brandGradient: const [
  Color(0xFF667eea),
  Color(0xFF764BA2),
  Color(0xFF23a6d5),
  Color(0xFF23d5ab),
],
```

注意：需要在 `ImColors` 类中声明 `brandGradient` 字段：
```dart
final List<Color> brandGradient;
```

- [ ] **Step 3: 在 ImTokens 中新增品牌渐变和阴影常量**

在 `ImTokens` 类中添加静态常量：

```dart
/// 品牌四色渐变
static const brandGradient = LinearGradient(
  colors: [Color(0xFF667eea), Color(0xFF764BA2), Color(0xFF23a6d5), Color(0xFF23d5ab)],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

/// 品牌紫色
static const brandPurple = Color(0xFF764BA2);

/// 卡片微弱阴影
static const cardShadow = BoxShadow(
  color: Color(0x08000000), // black @ 0.03
  blurRadius: 20,
  offset: Offset(0, 4),
);

/// 导航栏右侧阴影（区分内容区）
static const navRightShadow = BoxShadow(
  color: Color(0x08000000), // black @ 0.03
  blurRadius: 15,
  offset: Offset(5, 0),
);

/// 导航胶囊发光阴影
static const capsuleGlowShadow = BoxShadow(
  color: Color(0x66764BA2), // #764BA2 @ 0.4
  blurRadius: 15,
  spreadRadius: 0,
  offset: Offset(0, 4),
);
```

- [ ] **Step 4: 更新 ImComponentTokens**

更新 `ImComponentTokens` 中的组件颜色引用：

```dart
// 按钮
buttonPrimaryBg: ImColors.light.primary,  // 现在是 #764BA2
buttonSecondaryBg: Colors.transparent,
buttonSecondaryText: ImColors.light.primary,  // #764BA2
buttonSecondaryBorder: ImColors.light.primary,  // #764BA2

// 输入框
inputBg: const Color(0xFFF5F5F5),  // 原 ImColors.light.surface → grey.shade100
inputBorder: Colors.transparent,    // 原 ImColors.light.border → 无边框
inputBorderFocus: ImColors.light.primary,  // #764BA2

// 卡片
cardBg: Colors.white,              // 确保纯白
cardBorder: Colors.transparent,    // 原 ImColors.light.border → 无边框
```

- [ ] **Step 5: 运行主题测试验证**

```bash
cd flutter && flutter test packages/ui/test/theme/im_theme_test.dart
```

如果测试因为颜色值变化而失败，进入 Task 2 更新测试。

- [ ] **Step 6: 提交**

```bash
git add flutter/packages/ui/lib/src/theme/im_tokens.dart
git commit -m "feat(ui): update ImColors/ImTokens brand colors and design tokens"
```

---

## Task 2: 更新 ImTheme 组件主题

**Files:**
- Modify: `flutter/packages/ui/lib/src/theme/im_theme.dart`
- Modify: `flutter/packages/ui/test/theme/im_theme_test.dart`

- [ ] **Step 1: 更新 NavigationRailThemeData**

找到 `_build` 方法中的 `NavigationRailThemeData`，替换为：

```dart
navigationRailTheme: NavigationRailThemeData(
  backgroundColor: colors.surface,
  indicatorColor: Colors.transparent,  // 由自定义胶囊处理
  selectedIconTheme: IconThemeData(
    color: ImTokens.brandPurple,
    size: 24,
  ),
  unselectedIconTheme: IconThemeData(
    color: Colors.blueGrey.shade400,
    size: 24,
  ),
  selectedLabelTextStyle: TextStyle(
    fontSize: ImTokens.textSm,
    fontWeight: FontWeight.w600,
    color: ImTokens.brandPurple,
  ),
  unselectedLabelTextStyle: TextStyle(
    fontSize: ImTokens.textSm,
    color: Colors.blueGrey.shade400,
  ),
),
```

- [ ] **Step 2: 更新 InputDecorationTheme**

替换 `inputDecorationTheme` 部分：

```dart
inputDecorationTheme: InputDecorationTheme(
  filled: true,
  fillColor: const Color(0xFFF5F5F5), // grey.shade100
  contentPadding: const EdgeInsets.symmetric(
    horizontal: 16,
    vertical: 14,
  ),
  border: OutlineInputBorder(
    borderSide: BorderSide.none,
    borderRadius: BorderRadius.circular(ImTokens.radiusLg),
  ),
  enabledBorder: OutlineInputBorder(
    borderSide: BorderSide.none,
    borderRadius: BorderRadius.circular(ImTokens.radiusLg),
  ),
  focusedBorder: OutlineInputBorder(
    borderSide: const BorderSide(color: ImTokens.brandPurple, width: 2),
    borderRadius: BorderRadius.circular(ImTokens.radiusLg),
  ),
  errorBorder: OutlineInputBorder(
    borderSide: BorderSide(color: colors.error, width: 1),
    borderRadius: BorderRadius.circular(ImTokens.radiusLg),
  ),
  focusedErrorBorder: OutlineInputBorder(
    borderSide: BorderSide(color: colors.error, width: 2),
    borderRadius: BorderRadius.circular(ImTokens.radiusLg),
  ),
),
```

- [ ] **Step 3: 更新 CardThemeData**

```dart
cardTheme: CardThemeData(
  elevation: 0,  // 原 1 → 0，改用自定义阴影
  color: colors.surface,
  shape: RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(ImTokens.radiusXl), // 16
  ),
  // 不设置 side，移除边框线
),
```

- [ ] **Step 4: 更新 ElevatedButtonThemeData**

注意：渐变背景无法通过 ThemeData 设置，这里设置基础样式，渐变由 `GradientButton` 组件处理。

```dart
elevatedButtonTheme: ElevatedButtonThemeData(
  style: ElevatedButton.styleFrom(
    backgroundColor: colors.primary, // #764BA2 作为 fallback
    foregroundColor: Colors.white,
    elevation: 0,
    shadowColor: Colors.transparent,
    padding: const EdgeInsets.symmetric(
      horizontal: ImTokens.space6,
      vertical: ImTokens.space3,
    ),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(ImTokens.radiusLg), // 12
    ),
    textStyle: const TextStyle(
      fontWeight: FontWeight.bold,
    ),
  ),
),
```

- [ ] **Step 5: 新增 TabBarThemeData**

在 `_build` 方法中添加 TabBar 主题：

```dart
tabBarTheme: TabBarThemeData(
  labelColor: ImTokens.brandPurple,
  unselectedLabelColor: colors.textSecondary,
  indicatorSize: TabBarIndicatorSize.label,
  indicator: UnderlineTabIndicator(
    borderSide: const BorderSide(color: ImTokens.brandPurple, width: 2),
    borderRadius: BorderRadius.circular(ImTokens.radiusFull),
  ),
  labelStyle: const TextStyle(fontWeight: FontWeight.w600),
),
```

- [ ] **Step 6: 更新 ListTileThemeData**

```dart
listTileTheme: ListTileThemeData(
  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
  shape: RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(ImTokens.radiusMd),
  ),
  hoverColor: ImTokens.brandPurple.withOpacity(0.05),
),
```

- [ ] **Step 7: 更新测试断言**

更新 `im_theme_test.dart` 中的测试，验证新的主色：

```dart
test('light theme has correct primary color', () {
  final theme = ImTheme.light();
  expect(theme.colorScheme.primary, const Color(0xFF764BA2));
});

test('light theme has correct scaffold background', () {
  final theme = ImTheme.light();
  expect(theme.scaffoldBackgroundColor, const Color(0xFFF7F8FA));
});
```

- [ ] **Step 8: 运行测试**

```bash
cd flutter && flutter test packages/ui/test/theme/im_theme_test.dart
```

- [ ] **Step 9: 提交**

```bash
git add flutter/packages/ui/lib/src/theme/im_theme.dart flutter/packages/ui/test/theme/im_theme_test.dart
git commit -m "feat(ui): update ImTheme component themes for cyber floating style"
```

---

## Task 3: 更新 GlassTheme

**Files:**
- Modify: `flutter/apps/web/lib/core/theme/glass_theme.dart`

- [ ] **Step 1: 更新 light 主题的 accentGradient**

将 `GlassTheme.light` 中的 `accentGradient` 改为四色品牌渐变：

```dart
accentGradient: const LinearGradient(
  colors: [Color(0xFF667eea), Color(0xFF764BA2), Color(0xFF23a6d5), Color(0xFF23d5ab)],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
),
```

- [ ] **Step 2: 更新 light 主题的 softShadow**

```dart
softShadow: [
  BoxShadow(
    color: Colors.black.withOpacity(0.03),
    blurRadius: 20,
    offset: const Offset(0, 4),
  ),
],
```

- [ ] **Step 3: 更新 light 主题的 navBackground**

改为纯白（不再是半透明白）：

```dart
navBackground: Colors.white,
```

- [ ] **Step 4: 更新 light 主题的 inputBackground**

```dart
inputBackground: const Color(0xFFF5F5F5), // grey.shade100
```

- [ ] **Step 5: 更新 light 主题的 segmentedActiveBackground**

```dart
segmentedActiveBackground: const Color(0xFF764BA2), // 品牌紫色
```

- [ ] **Step 6: 提交**

```bash
git add flutter/apps/web/lib/core/theme/glass_theme.dart
git commit -m "feat(ui): update GlassTheme to brand colors"
```

---

## Task 4: 创建 GradientButton 通用组件

**Files:**
- Create: `flutter/packages/ui/lib/src/widgets/gradient_button.dart`
- Modify: `flutter/packages/ui/lib/ui.dart` (导出新组件)

- [ ] **Step 1: 创建 GradientButton 组件**

创建文件 `flutter/packages/ui/lib/src/widgets/gradient_button.dart`：

```dart
import 'package:flutter/material.dart';
import '../theme/im_tokens.dart';

/// 四色渐变主按钮
///
/// 用于所有主要操作（保存、确认、退出登录等）。
/// 渐变色：#667eea → #764BA2 → #23a6d5 → #23d5ab
class GradientButton extends StatelessWidget {
  const GradientButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.width,
    this.height = 48,
    this.borderRadius,
    this.enabled = true,
  });

  final VoidCallback? onPressed;
  final Widget child;
  final double? width;
  final double height;
  final double? borderRadius;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? ImTokens.radiusLg;

    return Opacity(
      opacity: enabled ? 1.0 : 0.5,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          gradient: enabled ? ImTokens.brandGradient : null,
          color: enabled ? null : Colors.grey.shade300,
          borderRadius: BorderRadius.circular(radius),
        ),
        child: ElevatedButton(
          onPressed: enabled ? onPressed : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: Colors.white,
            disabledBackgroundColor: Colors.transparent,
            disabledForegroundColor: Colors.white70,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
            textStyle: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// 渐变文字按钮（无背景，文字带渐变色）
class GradientTextButton extends StatelessWidget {
  const GradientTextButton({
    super.key,
    required this.onPressed,
    required this.child,
  });

  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: ImTokens.brandPurple,
      ),
      child: child,
    );
  }
}
```

- [ ] **Step 2: 在 ui.dart 中导出**

在 `flutter/packages/ui/lib/ui.dart` 中添加导出：

```dart
export 'src/widgets/gradient_button.dart';
```

- [ ] **Step 3: 运行分析确保无编译错误**

```bash
cd flutter && flutter analyze packages/ui
```

- [ ] **Step 4: 提交**

```bash
git add flutter/packages/ui/lib/src/widgets/gradient_button.dart flutter/packages/ui/lib/ui.dart
git commit -m "feat(ui): add GradientButton reusable component"
```

---

## Task 5: 重构 ResponsiveScaffold 导航栏

**Files:**
- Modify: `flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart`

- [ ] **Step 1: 重写 _buildDesktop 方法**

移除 `BackdropFilter`、`ClipRect`、`VerticalDivider`，实现赛博悬浮发光风格：

```dart
Widget _buildDesktop(BuildContext context, ThemeData theme) {
  return Scaffold(
    body: Row(
      children: [
        // 左侧导航栏 — 纯白底座 + 右侧微弱阴影
        Container(
          width: 88,
          decoration: const BoxDecoration(
            color: Colors.white,
            boxShadow: [ImTokens.navRightShadow],
          ),
          child: Column(
            children: [
              if (header != null) header!,
              Expanded(
                child: NavigationRail(
                  selectedIndex: selectedIndex,
                  onDestinationSelected: onDestinationSelected,
                  labelType: NavigationRailLabelType.all,
                  backgroundColor: Colors.transparent,
                  indicatorColor: Colors.transparent,
                  leading: floatingActionButton,
                  selectedIconTheme: IconThemeData(
                    color: ImTokens.brandPurple,
                    size: 24,
                  ),
                  unselectedIconTheme: IconThemeData(
                    color: Colors.blueGrey.shade400,
                    size: 24,
                  ),
                  selectedLabelTextStyle: TextStyle(
                    fontSize: ImTokens.textSm,
                    fontWeight: FontWeight.w600,
                    color: ImTokens.brandPurple,
                  ),
                  unselectedLabelTextStyle: TextStyle(
                    fontSize: ImTokens.textSm,
                    color: Colors.blueGrey.shade400,
                  ),
                  destinations: destinations.map((d) {
                    final isSelected = destinations.indexOf(d) == selectedIndex;
                    return NavigationRailDestination(
                      icon: _NavCapsule(
                        isSelected: isSelected,
                        child: Icon(d.icon, size: 24),
                      ),
                      selectedIcon: _NavCapsule(
                        isSelected: true,
                        child: Icon(d.selectedIcon ?? d.icon, size: 24),
                      ),
                      label: Text(d.label),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),
        // 右侧内容区
        Expanded(
          child: Column(
            children: [
              if (header != null) header!,
              Expanded(child: child),
            ],
          ),
        ),
      ],
    ),
  );
}
```

- [ ] **Step 2: 添加 _NavCapsule 私有组件**

在文件底部（`ResponsiveScaffold` 类之后）添加：

```dart
/// 导航栏选中态胶囊 — 纯白背景 + 紫色弥散阴影
class _NavCapsule extends StatelessWidget {
  const _NavCapsule({
    required this.isSelected,
    required this.child,
  });

  final bool isSelected;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!isSelected) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: child,
      );
    }

    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [ImTokens.capsuleGlowShadow],
      ),
      child: Center(child: child),
    );
  }
}
```

- [ ] **Step 3: 更新 import**

确保文件顶部导入了 `im_tokens.dart`（如果还没有的话）：

```dart
import '../theme/im_tokens.dart';
```

- [ ] **Step 4: 运行分析**

```bash
cd flutter && flutter analyze packages/ui
```

- [ ] **Step 5: 提交**

```bash
git add flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart
git commit -m "feat(ui): refactor NavigationRail to cyber floating capsule style"
```

---

## Task 6: 重构 SettingsSection 卡片组件

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/widgets/settings_section.dart`

- [ ] **Step 1: 移除 GlassTheme 依赖，改为纯白卡片**

将 `SettingsSection` 的 build 方法中的 `Container` 替换为：

```dart
@override
Widget build(BuildContext context) {
  final theme = Theme.of(context);

  return Container(
    width: double.infinity,
    padding: padding ?? const EdgeInsets.all(ImTokens.space5),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(ImTokens.radiusXl), // 16
      boxShadow: const [ImTokens.cardShadow],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (title != null) ...[
          Text(
            title!,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.primary,
            ),
          ),
          SizedBox(height: ImTokens.layoutSectionGap),
        ],
        child,
      ],
    ),
  );
}
```

- [ ] **Step 2: 移除 GlassTheme import 和 BackdropFilter/ClipRRect**

删除文件顶部的 `import 'glass_theme.dart'`（如果有），删除所有 `BackdropFilter`、`ClipRRect`、`ImageFilter.blur` 相关代码。

- [ ] **Step 3: 更新 SettingsRow 中的分割线颜色**

将 `Divider` 的颜色从 `glass.dividerColor` 改为：

```dart
Divider(
  height: 1,
  color: Colors.grey.shade200,
),
```

- [ ] **Step 4: 运行分析**

```bash
cd flutter && flutter analyze apps/web
```

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/features/settings/presentation/widgets/settings_section.dart
git commit -m "feat(ui): refactor SettingsSection to white card with subtle shadow"
```

---

## Task 7: 更新 SessionTile 和 MessageInput 组件

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`

- [ ] **Step 1: 更新 SessionTile 选中态背景色**

找到选中状态的背景色设置（约第 39 行），替换为：

```dart
color: isSelected
    ? ImTokens.brandPurple.withOpacity(0.08)  // 原 primaryContainer.withAlpha(50)
    : isHovered
        ? glass.navHoverBackground
        : Colors.transparent,
```

确保文件顶部导入了 `im_tokens.dart`。

- [ ] **Step 2: 更新 SessionTile 未读徽标渐变**

找到未读数徽标的渐变（约第 105 行），替换为：

```dart
gradient: ImTokens.brandGradient,
```

- [ ] **Step 3: 更新 MessageInput 输入栏背景**

找到输入栏的背景色（约第 278 行），保持使用 `glass.inputBackground`（已在 Task 3 中更新为 `grey.shade100`）。

- [ ] **Step 4: 运行分析**

```bash
cd flutter && flutter analyze apps/web
```

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart
git commit -m "feat(ui): update SessionTile and MessageInput to brand style"
```

---

## Task 8: 重构聊天页和联系人页

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart`

- [ ] **Step 1: 移除 chat_page.dart 搜索栏的 BackdropFilter**

找到搜索栏区域的 `ClipRect` + `BackdropFilter` 包裹（约第 129 行附近），移除 `BackdropFilter` 和 `ClipRect`，保留内部的 `Container` 和 `TextField`。

将搜索栏的背景色改为：
```dart
color: Colors.white,
```

- [ ] **Step 2: 更新 chat_page.dart 搜索框输入样式**

搜索框的 `InputDecoration` 已使用 `OutlineInputBorder`，更新圆角为 `ImTokens.radiusFull`（保持不变），但移除边框颜色（使用主题默认）。

- [ ] **Step 3: 移除 contacts_page.dart 头部的 BackdropFilter 和 Border**

找到头部区域（约第 52 行的 `BoxDecoration`），替换为：

```dart
Container(
  width: double.infinity,
  padding: EdgeInsets.symmetric(
    horizontal: ImTokens.layoutPanelPadding,
    vertical: ImTokens.space3,
  ),
  decoration: const BoxDecoration(
    color: Colors.white,
    boxShadow: [ImTokens.cardShadow],
  ),
  child: ... // 保留原有子组件
)
```

- [ ] **Step 4: 更新 contacts_page.dart 的 TabBar**

TabBar 样式已通过 ImTheme 全局更新（Task 2），无需额外修改。但如果有直接设置 `TabBar` 的 `indicator` 属性，移除它以使用全局主题。

- [ ] **Step 5: 运行分析**

```bash
cd flutter && flutter analyze apps/web
```

- [ ] **Step 6: 提交**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart
git commit -m "feat(ui): refactor chat and contacts pages - remove glass effects"
```

---

## Task 9: 重构群组页和朋友圈页

**Files:**
- Modify: `flutter/apps/web/lib/features/group/presentation/group_list_page.dart`
- Modify: `flutter/apps/web/lib/features/moments/presentation/moments_main_page.dart`

- [ ] **Step 1: 移除 group_list_page.dart 头部的 BackdropFilter 和 Border**

找到头部区域（约第 46 行的 `BoxDecoration`），替换为：

```dart
Container(
  width: double.infinity,
  padding: EdgeInsets.symmetric(
    horizontal: ImTokens.layoutPanelPadding,
    vertical: ImTokens.space3,
  ),
  decoration: const BoxDecoration(
    color: Colors.white,
    boxShadow: [ImTokens.cardShadow],
  ),
  child: ... // 保留原有子组件
)
```

- [ ] **Step 2: 更新 group_list_page.dart 硬编码间距**

将 `EdgeInsets.symmetric(horizontal: 16, vertical: 12)` 替换为 `ImTokens` 常量。

- [ ] **Step 3: 移除 moments_main_page.dart 的 VerticalDivider**

找到 `VerticalDivider`（约第 101 行），移除它。侧边栏和内容区通过背景色差区分。

- [ ] **Step 4: 运行分析**

```bash
cd flutter && flutter analyze apps/web
```

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/features/group/presentation/group_list_page.dart flutter/apps/web/lib/features/moments/presentation/moments_main_page.dart
git commit -m "feat(ui): refactor group and moments pages - remove glass/divider"
```

---

## Task 10: 重构设置相关页面

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/settings_page.dart`
- Modify: `flutter/apps/web/lib/features/settings/presentation/profile_page.dart`
- Modify: `flutter/apps/web/lib/features/settings/presentation/ai_settings_page.dart`

- [ ] **Step 1: settings_page.dart — 替换按钮为 GradientButton**

找到所有 `FilledButton` 和 `FilledButton.tonal` 按钮，替换为 `GradientButton`：

```dart
// 确认按钮（原 FilledButton）
GradientButton(
  onPressed: () { ... },
  child: const Text('确认'),
)

// 次要操作按钮（原 FilledButton.tonal）保持 FilledButton.tonal 或改为 OutlinedButton
```

注意：`FilledButton.tonal` 用于次要操作（清除缓存、登出），可以保留或改为次按钮样式。仅将主操作按钮改为 `GradientButton`。

- [ ] **Step 2: profile_page.dart — 修复 Colors.green 硬编码**

将 `Colors.green` 替换为 `theme.colorScheme.primary` 或 `ImTokens.brandPurple`（用于"已绑定"状态文字颜色）。

- [ ] **Step 3: profile_page.dart — 修复硬编码间距**

将 `EdgeInsets.all(16)` 替换为 `EdgeInsets.all(ImTokens.space4)`。
将 `SizedBox(height: 12)` 替换为 `SizedBox(height: ImTokens.space3)`。

- [ ] **Step 4: ai_settings_page.dart — 修复硬编码间距**

同 profile_page.dart 的处理方式。

- [ ] **Step 5: 运行分析**

```bash
cd flutter && flutter analyze apps/web
```

- [ ] **Step 6: 提交**

```bash
git add flutter/apps/web/lib/features/settings/presentation/settings_page.dart flutter/apps/web/lib/features/settings/presentation/profile_page.dart flutter/apps/web/lib/features/settings/presentation/ai_settings_page.dart
git commit -m "feat(ui): refactor settings pages - gradient buttons and token fixes"
```

---

## Task 11: 重构联系人和群组子页面

**Files:**
- Modify: `flutter/apps/web/lib/features/contacts/presentation/add_friend_page.dart`
- Modify: `flutter/apps/web/lib/features/group/presentation/create_group_page.dart`

- [ ] **Step 1: add_friend_page.dart — 替换 FilledButton.tonal**

将"添加好友"按钮从 `FilledButton.tonal` 改为 `GradientButton`：

```dart
GradientButton(
  onPressed: _addFriend,
  child: const Text('添加好友'),
),
```

- [ ] **Step 2: create_group_page.dart — 更新输入框样式**

输入框样式已通过 ImTheme 全局更新（Task 2），无需额外修改。但将硬编码间距替换为 `ImTokens` 常量。

- [ ] **Step 3: create_group_page.dart — 替换 TextButton**

将 AppBar 中的"创建" `TextButton` 改为 `GradientTextButton`：

```dart
actions: [
  GradientTextButton(
    onPressed: _createGroup,
    child: const Text('创建'),
  ),
],
```

- [ ] **Step 4: 运行分析**

```bash
cd flutter && flutter analyze apps/web
```

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/features/contacts/presentation/add_friend_page.dart flutter/apps/web/lib/features/group/presentation/create_group_page.dart
git commit -m "feat(ui): refactor add-friend and create-group pages"
```

---

## Task 12: 全局验证和收尾

**Files:**
- 全项目验证

- [ ] **Step 1: 运行完整分析**

```bash
cd flutter && flutter analyze
```

确保零错误零警告。

- [ ] **Step 2: 运行全部测试**

```bash
cd flutter && flutter test
```

确保所有测试通过。

- [ ] **Step 3: 手动视觉检查清单**

逐项确认：
- [ ] 导航栏：纯白背景 + 右侧微弱阴影 + 选中胶囊发光效果
- [ ] 导航栏选中图标：深紫色 #764BA2
- [ ] 导航栏未选中图标：淡蓝灰色
- [ ] 主按钮：四色渐变背景 + 白色加粗文字
- [ ] 输入框：淡灰背景 + 圆角 12 + 聚焦紫色边框
- [ ] 卡片：纯白背景 + 圆角 16 + 微弱阴影
- [ ] 页面背景：浅灰紫 #F7F8FA
- [ ] 无生硬的灰色边框线
- [ ] 暗色模式无编译报错

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "feat(ui): complete main UI redesign - cyber floating style"
```
