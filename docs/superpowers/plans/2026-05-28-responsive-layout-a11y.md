# Flutter Web 响应式布局与可访问性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立统一的响应式布局系统和 Web 可访问性规范，替代当前零散的断点实现，提供 BreakpointScope / ResponsiveScaffold / AdaptivePane / ResponsiveValue 等 layout primitives，并为核心控件添加 Semantics、Tooltip、键盘快捷键。

**Architecture:** 在 `im_ui` 包中实现 Hybrid 混合架构（InheritedWidget + BuildContext 扩展 + 核心 Widget），清理并替换现有的 3 个冲突 ResponsiveLayout 类。Web app 通过 `BreakpointScope` 获取统一断点数据，用扩展方法和核心 Widget 实现响应式布局。

**Tech Stack:** Flutter, InheritedWidget, LayoutBuilder, CallbackShortcuts, Semantics, flutter_test

---

## Task 1: Breakpoint 枚举 + 单元测试

**Files:**
- Create: `flutter/packages/ui/lib/src/layouts/breakpoint.dart`
- Create: `flutter/packages/ui/test/responsive/breakpoint_test.dart`

- [ ] **Step 1: 创建 Breakpoint 枚举**

```dart
// flutter/packages/ui/lib/src/layouts/breakpoint.dart
enum Breakpoint {
  compact,   // < 600px
  medium,    // 600–899px
  expanded,  // 900–1199px
  large;     // >= 1200px

  static Breakpoint fromWidth(double width) {
    if (width < 600) return Breakpoint.compact;
    if (width < 900) return Breakpoint.medium;
    if (width < 1200) return Breakpoint.expanded;
    return Breakpoint.large;
  }

  T value<T>({required T compact, T? medium, T? expanded, T? large}) {
    switch (this) {
      case Breakpoint.compact:
        return compact;
      case Breakpoint.medium:
        return medium ?? compact;
      case Breakpoint.expanded:
        return expanded ?? medium ?? compact;
      case Breakpoint.large:
        return large ?? expanded ?? medium ?? compact;
    }
  }
}
```

- [ ] **Step 2: 编写 Breakpoint 单元测试**

```dart
// flutter/packages/ui/test/responsive/breakpoint_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/src/layouts/breakpoint.dart';

void main() {
  group('Breakpoint.fromWidth', () {
    test('returns compact for width < 600', () {
      expect(Breakpoint.fromWidth(0), Breakpoint.compact);
      expect(Breakpoint.fromWidth(320), Breakpoint.compact);
      expect(Breakpoint.fromWidth(599), Breakpoint.compact);
    });

    test('returns medium for width 600-899', () {
      expect(Breakpoint.fromWidth(600), Breakpoint.medium);
      expect(Breakpoint.fromWidth(768), Breakpoint.medium);
      expect(Breakpoint.fromWidth(899), Breakpoint.medium);
    });

    test('returns expanded for width 900-1199', () {
      expect(Breakpoint.fromWidth(900), Breakpoint.expanded);
      expect(Breakpoint.fromWidth(1024), Breakpoint.expanded);
      expect(Breakpoint.fromWidth(1199), Breakpoint.expanded);
    });

    test('returns large for width >= 1200', () {
      expect(Breakpoint.fromWidth(1200), Breakpoint.large);
      expect(Breakpoint.fromWidth(1920), Breakpoint.large);
    });
  });

  group('Breakpoint.value', () {
    test('returns compact value when breakpoint is compact', () {
      expect(
        Breakpoint.compact.value(compact: 'a', medium: 'b', expanded: 'c', large: 'd'),
        'a',
      );
    });

    test('falls back to compact when medium is null', () {
      expect(
        Breakpoint.medium.value(compact: 'a'),
        'a',
      );
    });

    test('falls back through chain when values are null', () {
      expect(
        Breakpoint.large.value(compact: 'a'),
        'a',
      );
    });

    test('returns correct value for each breakpoint', () {
      expect(Breakpoint.compact.value(compact: 1, medium: 2, expanded: 3, large: 4), 1);
      expect(Breakpoint.medium.value(compact: 1, medium: 2, expanded: 3, large: 4), 2);
      expect(Breakpoint.expanded.value(compact: 1, medium: 2, expanded: 3, large: 4), 3);
      expect(Breakpoint.large.value(compact: 1, medium: 2, expanded: 3, large: 4), 4);
    });
  });
}
```

- [ ] **Step 3: 运行测试验证通过**

Run: `cd flutter/packages/ui && flutter test test/responsive/breakpoint_test.dart`
Expected: All tests pass

- [ ] **Step 4: 提交**

```bash
git add flutter/packages/ui/lib/src/layouts/breakpoint.dart flutter/packages/ui/test/responsive/breakpoint_test.dart
git commit -m "feat(ui): add Breakpoint enum with fromWidth and value"
```

---

## Task 2: BreakpointScope + Widget 测试

**Files:**
- Create: `flutter/packages/ui/lib/src/layouts/breakpoint_scope.dart`
- Create: `flutter/packages/ui/test/responsive/breakpoint_scope_test.dart`

- [ ] **Step 1: 创建 BreakpointScope Widget**

```dart
// flutter/packages/ui/lib/src/layouts/breakpoint_scope.dart
import 'package:flutter/widgets.dart';
import 'breakpoint.dart';

class BreakpointScope extends StatelessWidget {
  const BreakpointScope({required this.child, super.key});

  final Widget child;

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
  const _BreakpointData({required this.breakpoint, required super.child});

  final Breakpoint breakpoint;

  @override
  bool updateShouldNotify(_BreakpointData old) => breakpoint != old.breakpoint;
}
```

- [ ] **Step 2: 编写 BreakpointScope Widget 测试**

```dart
// flutter/packages/ui/test/responsive/breakpoint_scope_test.dart
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/src/layouts/breakpoint.dart';
import 'package:im_ui/src/layouts/breakpoint_scope.dart';

void main() {
  group('BreakpointScope', () {
    testWidgets('provides compact breakpoint for width < 600', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(400, 800)),
          child: BreakpointScope(
            child: Builder(
              builder: (context) {
                captured = BreakpointScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(captured, Breakpoint.compact);
    });

    testWidgets('provides medium breakpoint for width 600-899', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(768, 1024)),
          child: BreakpointScope(
            child: Builder(
              builder: (context) {
                captured = BreakpointScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(captured, Breakpoint.medium);
    });

    testWidgets('provides expanded breakpoint for width 900-1199', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(1024, 768)),
          child: BreakpointScope(
            child: Builder(
              builder: (context) {
                captured = BreakpointScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(captured, Breakpoint.expanded);
    });

    testWidgets('provides large breakpoint for width >= 1200', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(1920, 1080)),
          child: BreakpointScope(
            child: Builder(
              builder: (context) {
                captured = BreakpointScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(captured, Breakpoint.large);
    });

    testWidgets('defaults to compact when no BreakpointScope ancestor', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        Builder(
          builder: (context) {
            captured = BreakpointScope.of(context);
            return const SizedBox();
          },
        ),
      );

      expect(captured, Breakpoint.compact);
    });
  });
}
```

- [ ] **Step 3: 运行测试验证通过**

Run: `cd flutter/packages/ui && flutter test test/responsive/breakpoint_scope_test.dart`
Expected: All tests pass

- [ ] **Step 4: 提交**

```bash
git add flutter/packages/ui/lib/src/layouts/breakpoint_scope.dart flutter/packages/ui/test/responsive/breakpoint_scope_test.dart
git commit -m "feat(ui): add BreakpointScope InheritedWidget"
```

---

## Task 3: ResponsiveContext 扩展

**Files:**
- Create: `flutter/packages/ui/lib/src/layouts/responsive_context.dart`

- [ ] **Step 1: 创建 BuildContext 扩展**

```dart
// flutter/packages/ui/lib/src/layouts/responsive_context.dart
import 'package:flutter/widgets.dart';
import 'breakpoint.dart';
import 'breakpoint_scope.dart';

extension ResponsiveContext on BuildContext {
  Breakpoint get breakpoint => BreakpointScope.of(this);
  bool get isCompact => breakpoint == Breakpoint.compact;
  bool get isMedium => breakpoint == Breakpoint.medium;
  bool get isExpanded => breakpoint == Breakpoint.expanded;
  bool get isLarge => breakpoint == Breakpoint.large;
  bool get isMobile => isCompact || isMedium;
  bool get isDesktop => isExpanded || isLarge;
}
```

- [ ] **Step 2: 提交**

```bash
git add flutter/packages/ui/lib/src/layouts/responsive_context.dart
git commit -m "feat(ui): add ResponsiveContext extension on BuildContext"
```

---

## Task 4: AdaptivePane + Widget 测试

**Files:**
- Create: `flutter/packages/ui/lib/src/layouts/adaptive_pane.dart`
- Create: `flutter/packages/ui/test/responsive/adaptive_pane_test.dart`

- [ ] **Step 1: 创建 AdaptivePane Widget**

```dart
// flutter/packages/ui/lib/src/layouts/adaptive_pane.dart
import 'package:flutter/widgets.dart';
import 'breakpoint.dart';
import 'breakpoint_scope.dart';

class AdaptivePane extends StatelessWidget {
  const AdaptivePane({
    this.compact,
    this.medium,
    this.expanded,
    this.large,
    super.key,
  });

  final Widget? compact;
  final Widget? medium;
  final Widget? expanded;
  final Widget? large;

  @override
  Widget build(BuildContext context) {
    final bp = BreakpointScope.of(context);
    return _resolve(bp);
  }

  Widget _resolve(Breakpoint bp) {
    switch (bp) {
      case Breakpoint.compact:
        return compact ?? medium ?? expanded ?? large ?? const SizedBox.shrink();
      case Breakpoint.medium:
        return medium ?? expanded ?? large ?? compact ?? const SizedBox.shrink();
      case Breakpoint.expanded:
        return expanded ?? large ?? medium ?? compact ?? const SizedBox.shrink();
      case Breakpoint.large:
        return large ?? expanded ?? medium ?? compact ?? const SizedBox.shrink();
    }
  }
}
```

- [ ] **Step 2: 编写 AdaptivePane Widget 测试**

```dart
// flutter/packages/ui/test/responsive/adaptive_pane_test.dart
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/src/layouts/adaptive_pane.dart';
import 'package:im_ui/src/layouts/breakpoint_scope.dart';

Widget _buildTestApp({required double width, required AdaptivePane pane}) {
  return MediaQuery(
    data: MediaQueryData(size: Size(width, 800)),
    child: BreakpointScope(child: pane),
  );
}

void main() {
  group('AdaptivePane', () {
    testWidgets('shows compact widget when width < 600', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 400,
        pane: const AdaptivePane(
          compact: Text('compact'),
          medium: Text('medium'),
          expanded: Text('expanded'),
          large: Text('large'),
        ),
      ));

      expect(find.text('compact'), findsOneWidget);
      expect(find.text('medium'), findsNothing);
    });

    testWidgets('shows medium widget when width 600-899', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 768,
        pane: const AdaptivePane(
          compact: Text('compact'),
          medium: Text('medium'),
          expanded: Text('expanded'),
          large: Text('large'),
        ),
      ));

      expect(find.text('medium'), findsOneWidget);
      expect(find.text('compact'), findsNothing);
    });

    testWidgets('falls back to expanded when medium is null', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 768,
        pane: const AdaptivePane(
          compact: Text('compact'),
          expanded: Text('expanded'),
          large: Text('large'),
        ),
      ));

      expect(find.text('expanded'), findsOneWidget);
    });

    testWidgets('falls back to compact when all others null', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 1920,
        pane: const AdaptivePane(compact: Text('compact')),
      ));

      expect(find.text('compact'), findsOneWidget);
    });

    testWidgets('shows SizedBox.shrink when nothing provided', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 400,
        pane: const AdaptivePane(),
      ));

      expect(find.byType(SizedBox), findsOneWidget);
    });
  });
}
```

- [ ] **Step 3: 运行测试验证通过**

Run: `cd flutter/packages/ui && flutter test test/responsive/adaptive_pane_test.dart`
Expected: All tests pass

- [ ] **Step 4: 提交**

```bash
git add flutter/packages/ui/lib/src/layouts/adaptive_pane.dart flutter/packages/ui/test/responsive/adaptive_pane_test.dart
git commit -m "feat(ui): add AdaptivePane widget with breakpoint fallback"
```

---

## Task 5: ResponsiveScaffold + Widget 测试

**Files:**
- Create: `flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart`
- Create: `flutter/packages/ui/test/responsive/responsive_scaffold_test.dart`

- [ ] **Step 1: 创建 ResponsiveScaffold Widget**

```dart
// flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart
import 'package:flutter/material.dart';
import 'breakpoint.dart';
import 'breakpoint_scope.dart';

class ResponsiveNavDestination {
  const ResponsiveNavDestination({
    required this.icon,
    this.selectedIcon,
    required this.label,
    this.route,
  });

  final IconData icon;
  final IconData? selectedIcon;
  final Widget label;
  final String? route;
}

class ResponsiveScaffold extends StatelessWidget {
  const ResponsiveScaffold({
    required this.destinations,
    required this.child,
    required this.selectedIndex,
    required this.onDestinationSelected,
    this.header,
    this.floatingActionButton,
    super.key,
  });

  final List<ResponsiveNavDestination> destinations;
  final Widget child;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final Widget? header;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) {
    final bp = BreakpointScope.of(context);
    final isDesktop = bp == Breakpoint.expanded || bp == Breakpoint.large;

    if (isDesktop) {
      return _buildDesktop(context);
    }
    return _buildMobile(context);
  }

  Widget _buildDesktop(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: selectedIndex,
            onDestinationSelected: onDestinationSelected,
            labelType: NavigationRailLabelType.all,
            destinations: destinations
                .map((d) => NavigationRailDestination(
                      icon: Icon(d.icon),
                      selectedIcon: d.selectedIcon != null
                          ? Icon(d.selectedIcon)
                          : null,
                      label: d.label,
                    ))
                .toList(),
          ),
          const VerticalDivider(thickness: 1, width: 1),
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
      floatingActionButton: floatingActionButton,
    );
  }

  Widget _buildMobile(BuildContext context) {
    return Scaffold(
      appBar: header != null
          ? PreferredSize(preferredSize: const Size.fromHeight(56), child: header!)
          : null,
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: onDestinationSelected,
        destinations: destinations
            .map((d) => NavigationDestination(
                  icon: Icon(d.icon),
                  selectedIcon: d.selectedIcon != null
                      ? Icon(d.selectedIcon)
                      : null,
                  label: d.label,
                ))
            .toList(),
      ),
      floatingActionButton: floatingActionButton,
    );
  }
}
```

- [ ] **Step 2: 编写 ResponsiveScaffold Widget 测试**

```dart
// flutter/packages/ui/test/responsive/responsive_scaffold_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/src/layouts/breakpoint_scope.dart';
import 'package:im_ui/src/layouts/responsive_scaffold.dart';

List<ResponsiveNavDestination> _testDestinations() => const [
      ResponsiveNavDestination(icon: Icons.chat, label: Text('Chat')),
      ResponsiveNavDestination(icon: Icons.settings, label: Text('Settings')),
    ];

Widget _buildTestApp({required double width, required Widget child}) {
  return MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(size: Size(width, 800)),
      child: BreakpointScope(child: child),
    ),
  );
}

void main() {
  group('ResponsiveScaffold', () {
    testWidgets('shows NavigationBar on compact', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 400,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (_) {},
          child: const Text('content'),
        ),
      ));

      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
    });

    testWidgets('shows NavigationBar on medium', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 768,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (_) {},
          child: const Text('content'),
        ),
      ));

      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
    });

    testWidgets('shows NavigationRail on expanded', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 1024,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (_) {},
          child: const Text('content'),
        ),
      ));

      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('shows NavigationRail on large', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 1920,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (_) {},
          child: const Text('content'),
        ),
      ));

      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('calls onDestinationSelected when tapped', (tester) async {
      int? tapped;

      await tester.pumpWidget(_buildTestApp(
        width: 1920,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (i) => tapped = i,
          child: const Text('content'),
        ),
      ));

      await tester.tap(find.byIcon(Icons.settings));
      expect(tapped, 1);
    });
  });
}
```

- [ ] **Step 3: 运行测试验证通过**

Run: `cd flutter/packages/ui && flutter test test/responsive/responsive_scaffold_test.dart`
Expected: All tests pass

- [ ] **Step 4: 提交**

```bash
git add flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart flutter/packages/ui/test/responsive/responsive_scaffold_test.dart
git commit -m "feat(ui): add ResponsiveScaffold with NavigationBar/Rail switch"
```

---

## Task 6: 更新 im_ui barrel exports + 清理旧 ResponsiveLayout

**Files:**
- Modify: `flutter/packages/ui/lib/src/layouts/layouts.dart`
- Modify: `flutter/packages/ui/lib/ui.dart`

- [ ] **Step 1: 清理 layouts.dart，删除旧 ResponsiveLayout，保留其他 Widget**

删除 `layouts.dart` 中第 126-157 行的旧 `ResponsiveLayout` 类。保留 `SideNavLayout`、`NavDestination`、`MainContentLayout`、`PageHeader`、`GroupedList`、`CollapsiblePanel`。

在文件顶部添加新文件的导出：

```dart
// flutter/packages/ui/lib/src/layouts/layouts.dart
export 'breakpoint.dart';
export 'breakpoint_scope.dart';
export 'responsive_context.dart';
export 'adaptive_pane.dart';
export 'responsive_scaffold.dart';
```

- [ ] **Step 2: 更新 ui.dart barrel export**

```dart
// flutter/packages/ui/lib/ui.dart
library im_ui;

export 'src/theme/app_theme.dart';
export 'src/widgets/widgets.dart';
export 'src/layouts/layouts.dart';
```

（保持不变，因为 layouts.dart 已经导出了所有子文件）

- [ ] **Step 3: 验证 im_ui 包编译通过**

Run: `cd flutter/packages/ui && flutter analyze`
Expected: No errors

- [ ] **Step 4: 提交**

```bash
git add flutter/packages/ui/lib/src/layouts/layouts.dart
git commit -m "refactor(ui): remove old ResponsiveLayout, export new responsive modules"
```

---

## Task 7: 添加 l10n 可访问性字符串

**Files:**
- Modify: `flutter/apps/web/lib/l10n/app_localizations.dart`
- Modify: `flutter/apps/web/lib/l10n/app_localizations_zh.dart`
- Modify: `flutter/apps/web/lib/l10n/app_localizations_en.dart`

- [ ] **Step 1: 在 app_localizations.dart 中添加抽象 getter**

在文件末尾（最后一个 getter 之后，`}` 之前）添加：

```dart
  String get a11ySendMessage;
  String get a11yAddAttachment;
  String get a11yVoiceInput;
  String get a11yNetworkConnected;
  String get a11yNetworkDisconnected;
  String get a11yEncryptedMessage;
  String get a11ySettingsProfile;
  String get a11ySettingsAi;
  String get a11ySettingsSecurity;
  String get a11yBackToSessions;
  String get chatSelectSession;
```

- [ ] **Step 2: 在 app_localizations_zh.dart 中添加中文实现**

在类末尾添加：

```dart
  @override
  String get a11ySendMessage => '发送消息';

  @override
  String get a11yAddAttachment => '添加附件';

  @override
  String get a11yVoiceInput => '语音输入';

  @override
  String get a11yNetworkConnected => '网络已连接';

  @override
  String get a11yNetworkDisconnected => '网络已断开';

  @override
  String get a11yEncryptedMessage => '此消息已端到端加密';

  @override
  String get a11ySettingsProfile => '个人信息';

  @override
  String get a11ySettingsAi => 'AI 设置';

  @override
  String get a11ySettingsSecurity => '安全设置';

  @override
  String get a11yBackToSessions => '返回会话列表';

  @override
  String get chatSelectSession => '选择一个会话开始聊天';
```

- [ ] **Step 3: 在 app_localizations_en.dart 中添加英文实现**

在类末尾添加：

```dart
  @override
  String get a11ySendMessage => 'Send message';

  @override
  String get a11yAddAttachment => 'Add attachment';

  @override
  String get a11yVoiceInput => 'Voice input';

  @override
  String get a11yNetworkConnected => 'Network connected';

  @override
  String get a11yNetworkDisconnected => 'Network disconnected';

  @override
  String get a11yEncryptedMessage => 'This message is end-to-end encrypted';

  @override
  String get a11ySettingsProfile => 'Personal info';

  @override
  String get a11ySettingsAi => 'AI settings';

  @override
  String get a11ySettingsSecurity => 'Security settings';

  @override
  String get a11yBackToSessions => 'Back to sessions';

  @override
  String get chatSelectSession => 'Select a session to start chatting';
```

- [ ] **Step 4: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/l10n/
git commit -m "feat(l10n): add accessibility strings for a11y labels"
```

---

## Task 8: 删除旧 responsive 文件 + 更新 imports

**Files:**
- Delete: `flutter/apps/web/lib/core/responsive/breakpoints.dart`
- Delete: `flutter/apps/web/lib/core/utils/responsive.dart`
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/login_page.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/register_page.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/widgets/brand_showcase.dart`

- [ ] **Step 1: 更新 app_router.dart — 替换旧 ResponsiveLayout**

将 `import 'package:im_web/core/responsive/breakpoints.dart';` 替换为：
```dart
import 'package:im_ui/im_ui.dart';
```

删除 `import 'package:im_web/core/responsive/mobile_shell.dart';`

将 ShellRoute builder 中的：
```dart
ResponsiveLayout(
  mobile: (_) => MobileShell(child: child),
  desktop: (_) => MainLayout(child: child),
)
```
替换为使用 `ResponsiveScaffold` 的实现（见 Task 9）。

- [ ] **Step 2: 更新 chat_page.dart — 替换旧断点引用**

将 `import 'package:im_web/core/responsive/breakpoints.dart';` 替换为：
```dart
import 'package:im_ui/im_ui.dart';
```

将所有 `getScreenSize(MediaQuery.of(context).size.width) == ScreenSize.mobile` 替换为 `context.isMobile`。

将所有 `getScreenSize(MediaQuery.of(context).size.width) == ScreenSize.desktop` 替换为 `context.isDesktop`。

- [ ] **Step 3: 更新 auth 页面 — 替换旧 ResponsiveLayout 引用**

在 `login_page.dart`、`register_page.dart`、`auth_card.dart`、`brand_showcase.dart` 中：

将 `import 'package:im_web/core/utils/responsive.dart';` 替换为：
```dart
import 'package:im_ui/im_ui.dart';
```

将所有 `ResponsiveLayout.isMobile(context)` 替换为 `context.isMobile`。

将 `ResponsiveLayout.getCardElevation(context)` 等调用替换为 `context.breakpoint.value(...)` 形式。

- [ ] **Step 4: 删除旧文件**

```bash
rm flutter/apps/web/lib/core/responsive/breakpoints.dart
rm flutter/apps/web/lib/core/utils/responsive.dart
```

- [ ] **Step 5: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors (或仅 warnings)

- [ ] **Step 6: 提交**

```bash
git add -A flutter/apps/web/lib/
git commit -m "refactor(web): migrate to im_ui responsive system, delete old breakpoints"
```

---

## Task 9: 重构 MainLayout → ResponsiveScaffold

**Files:**
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`

- [ ] **Step 1: 重写 ShellRoute 使用 ResponsiveScaffold**

将 `app_router.dart` 中的 ShellRoute builder 替换为：

```dart
ShellRoute(
  builder: (_, __, child) {
    final l10n = AppLocalizations.of(context);
    final location = GoRouterState.of(context).uri.path;
    final selectedIndex = _indexFromPath(location);

    return ResponsiveScaffold(
      destinations: [
        ResponsiveNavDestination(
          icon: Icons.chat_outlined,
          selectedIcon: Icons.chat,
          label: Text(l10n?.navChat ?? '聊天'),
        ),
        ResponsiveNavDestination(
          icon: Icons.people_outlined,
          selectedIcon: Icons.people,
          label: Text(l10n?.navContacts ?? '联系人'),
        ),
        ResponsiveNavDestination(
          icon: Icons.group_outlined,
          selectedIcon: Icons.group,
          label: Text(l10n?.navGroups ?? '群组'),
        ),
        ResponsiveNavDestination(
          icon: Icons.camera_alt_outlined,
          selectedIcon: Icons.camera_alt,
          label: Text(l10n?.navMoments ?? '朋友圈'),
        ),
        ResponsiveNavDestination(
          icon: Icons.settings_outlined,
          selectedIcon: Icons.settings,
          label: Text(l10n?.navSettings ?? '设置'),
        ),
      ],
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) => _onNavigate(_, index),
      child: child,
    );
  },
  routes: [ /* ... 保持不变 ... */ ],
),
```

添加辅助函数：

```dart
int _indexFromPath(String path) {
  if (path.startsWith('/chat')) return 0;
  if (path.startsWith('/contacts')) return 1;
  if (path.startsWith('/groups')) return 2;
  if (path.startsWith('/moments')) return 3;
  if (path.startsWith('/settings')) return 4;
  return 0;
}

void _onNavigate(BuildContext context, int index) {
  switch (index) {
    case 0: context.go('/chat');
    case 1: context.go('/contacts');
    case 2: context.go('/groups');
    case 3: context.go('/moments');
    case 4: context.go('/settings');
  }
}
```

删除 `MainLayout` 类（不再需要）。

- [ ] **Step 2: 删除 mobile_shell.dart**

```bash
rm flutter/apps/web/lib/core/responsive/mobile_shell.dart
```

- [ ] **Step 3: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 4: 提交**

```bash
git add flutter/apps/web/lib/core/router/app_router.dart
git rm flutter/apps/web/lib/core/responsive/mobile_shell.dart
git commit -m "refactor(web): replace MainLayout/MobileShell with ResponsiveScaffold"
```

---

## Task 10: 重构 ChatPage + 添加键盘快捷键

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`

- [ ] **Step 1: 添加键盘快捷键支持**

在 `_ChatPageState` 中添加 Esc 处理逻辑：

```dart
final _messageInputFocusNode = FocusNode();
bool _messageInputFocused = false;

void _handleEsc() {
  if (_messageInputFocused) {
    _messageInputFocusNode.unfocus();
  } else {
    ref.read(chatStateProvider.notifier).setActiveSession(null);
  }
}

@override
void dispose() {
  _searchController.dispose();
  _scrollController.dispose();
  _messageInputFocusNode.dispose();
  super.dispose();
}
```

- [ ] **Step 2: 用 AdaptivePane 替换内联断点逻辑**

将 `_buildMobileLayout` 和 `_buildDesktopLayout` 合并为 `AdaptivePane`：

```dart
@override
Widget build(BuildContext context) {
  final chatState = ref.watch(chatStateProvider);
  final activeId = chatState.activeSessionId;
  final sessions = chatState.sessions.where((s) {
    if (_searchQuery.isEmpty) return true;
    return s.targetName.toLowerCase().contains(_searchQuery.toLowerCase());
  }).toList();

  return CallbackShortcuts(
    bindings: {
      LogicalKeySet(LogicalKeyboardKey.escape): _handleEsc,
    },
    child: Focus(
      autofocus: true,
      child: AdaptivePane(
        compact: activeId != null
            ? _buildChatView(activeId)
            : _buildSessionList(sessions, activeId),
        medium: activeId != null
            ? _buildChatView(activeId)
            : _buildSessionList(sessions, activeId),
        expanded: Row(
          children: [
            SizedBox(
              width: context.breakpoint.value(compact: 0, medium: 0, expanded: 320, large: 320).toDouble(),
              child: _buildSessionList(sessions, activeId),
            ),
            const VerticalDivider(thickness: 1, width: 1),
            Expanded(
              child: activeId == null
                  ? Center(child: Text(AppLocalizations.of(context)?.chatSelectSession ?? '选择一个会话开始聊天'))
                  : _buildChatView(activeId),
            ),
          ],
        ),
      ),
    ),
  );
}
```

- [ ] **Step 3: 将 FocusNode 传递给 MessageInput**

在 `_buildChatView` 中，将 `_messageInputFocusNode` 传递给 `MessageInput`：

```dart
MessageInput(
  focusNode: _messageInputFocusNode,
  onFocusChanged: (focused) => setState(() => _messageInputFocused = focused),
  onSend: (text) { /* ... */ },
  // ...
)
```

- [ ] **Step 4: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart
git commit -m "feat(chat): add Esc keyboard shortcut and AdaptivePane layout"
```

---

## Task 11: 更新 MessageInput — 添加 FocusNode、Semantics、Tooltip

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`

- [ ] **Step 1: 添加 FocusNode 和 Semantics**

更新 `MessageInput` 构造函数，添加 `focusNode` 和 `onFocusChanged` 参数：

```dart
class MessageInput extends ConsumerStatefulWidget {
  const MessageInput({
    required this.onSend,
    this.onSendImage,
    this.onSendFile,
    this.focusNode,
    this.onFocusChanged,
    super.key,
  });

  final ValueChanged<String> onSend;
  final ValueChanged<String>? onSendImage;
  final ValueChanged<String>? onSendFile;
  final FocusNode? focusNode;
  final ValueChanged<bool>? onFocusChanged;

  @override
  ConsumerState<MessageInput> createState() => _MessageInputState();
}
```

在 `_MessageInputState` 中：

```dart
@override
void initState() {
  super.initState();
  widget.focusNode?.addListener(_onFocusChange);
}

void _onFocusChange() {
  widget.onFocusChanged?.call(widget.focusNode!.hasFocus);
}

@override
void didUpdateWidget(MessageInput oldWidget) {
  super.didUpdateWidget(oldWidget);
  if (oldWidget.focusNode != widget.focusNode) {
    oldWidget.focusNode?.removeListener(_onFocusChange);
    widget.focusNode?.addListener(_onFocusChange);
  }
}
```

- [ ] **Step 2: 添加 Semantics 和 Tooltip**

将发送按钮包裹在 Semantics 中：

```dart
Semantics(
  label: AppLocalizations.of(context)?.a11ySendMessage ?? '发送消息',
  button: true,
  child: IconButton(
    icon: const Icon(Icons.send),
    onPressed: _handleSend,
    tooltip: AppLocalizations.of(context)?.a11ySendMessage ?? '发送消息',
    color: Theme.of(context).colorScheme.primary,
  ),
),
```

同样为附件和语音按钮添加 Semantics + Tooltip：

```dart
Semantics(
  label: AppLocalizations.of(context)?.a11yAddAttachment ?? '添加附件',
  button: true,
  child: IconButton(
    icon: const Icon(Icons.add_circle_outline),
    onPressed: _showAttachmentMenu,
    tooltip: AppLocalizations.of(context)?.a11yAddAttachment ?? '添加附件',
  ),
),
```

```dart
Semantics(
  label: AppLocalizations.of(context)?.a11yVoiceInput ?? '语音输入',
  button: true,
  child: IconButton(
    icon: Icon(_isRecording ? Icons.stop : Icons.mic),
    onPressed: () {
      setState(() => _isRecording = !_isRecording);
    },
    tooltip: AppLocalizations.of(context)?.a11yVoiceInput ?? '语音输入',
    color: _isRecording ? Colors.red : null,
  ),
),
```

- [ ] **Step 3: 将 focusNode 传递给 TextField**

```dart
Expanded(
  child: TextField(
    controller: _controller,
    focusNode: widget.focusNode,
    decoration: const InputDecoration(
      hintText: 'Type a message...',
      border: InputBorder.none,
      contentPadding: EdgeInsets.symmetric(horizontal: 12),
    ),
    minLines: 1,
    maxLines: 4,
    onSubmitted: (_) => _handleSend(),
  ),
),
```

- [ ] **Step 4: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart
git commit -m "feat(a11y): add FocusNode, Semantics, Tooltip to MessageInput"
```

---

## Task 12: 重构 SettingsPage — 替换魔法数

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/settings_page.dart`

- [ ] **Step 1: 替换内联魔法数**

将文件顶部添加 im_ui 导入：

```dart
import 'package:im_ui/im_ui.dart';
```

将 `settings_page.dart` 中的：
```dart
final screenWidth = MediaQuery.sizeOf(context).width;
if (screenWidth < 860) {
  return _buildMobileLayout(...);
}
```
替换为：
```dart
if (context.isMobile) {
  return _buildMobileLayout(...);
}
```

将 `if (screenWidth >= 1200)` 替换为 `if (context.isLarge)`。

- [ ] **Step 2: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add flutter/apps/web/lib/features/settings/presentation/settings_page.dart
git commit -m "refactor(settings): replace magic numbers with Breakpoint API"
```

---

## Task 13: 重构 MomentsMainPage — 替换魔法数

**Files:**
- Modify: `flutter/apps/web/lib/features/moments/presentation/moments_main_page.dart`

- [ ] **Step 1: 替换内联魔法数**

添加 im_ui 导入：

```dart
import 'package:im_ui/im_ui.dart';
```

将 `MediaQuery.of(context).size.width > 768` 替换为 `!context.isCompact`。

将 `screenWidth > 1100` 替换为 `context.isLarge`。

- [ ] **Step 2: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add flutter/apps/web/lib/features/moments/presentation/moments_main_page.dart
git commit -m "refactor(moments): replace magic numbers with Breakpoint API"
```

---

## Task 14: 为 SettingsNavPanel 添加可访问性

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/widgets/settings_nav_panel.dart`

- [ ] **Step 1: 添加 Semantics 和 FocusNode**

为每个导航项添加 Semantics label：

```dart
Semantics(
  label: l10n.a11ySettingsProfile,
  button: true,
  child: _NavItem(
    icon: Icons.person_outline,
    label: l10n.navSettings, // 或具体标签
    isSelected: ...,
    onTap: ...,
  ),
),
```

- [ ] **Step 2: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add flutter/apps/web/lib/features/settings/presentation/widgets/settings_nav_panel.dart
git commit -m "feat(a11y): add Semantics labels to SettingsNavPanel"
```

---

## Task 15: 为其他控件添加可访问性

**Files:**
- Modify: `flutter/apps/web/lib/features/e2ee/presentation/message_lock_icon.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/network_status_banner.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart`

- [ ] **Step 1: 更新 message_lock_icon.dart — Tooltip 改用 l10n**

```dart
Tooltip(
  message: AppLocalizations.of(context)?.a11yEncryptedMessage ?? '此消息已端到端加密',
  child: Icon(Icons.lock_outline, size: 12, ...),
)
```

- [ ] **Step 2: 更新 network_status_banner.dart — Tooltip 改用 l10n**

```dart
Tooltip(
  message: networkState.isOffline
      ? AppLocalizations.of(context)?.a11yNetworkDisconnected ?? '网络已断开'
      : AppLocalizations.of(context)?.a11yNetworkConnected ?? '网络已连接',
  ...
)
```

- [ ] **Step 3: 为 SessionTile 添加 Semantics**

```dart
Semantics(
  label: session.targetName ?? '会话',
  button: true,
  child: ListTile(
    // ...
  ),
)
```

- [ ] **Step 4: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/features/e2ee/presentation/message_lock_icon.dart flutter/apps/web/lib/features/chat/presentation/widgets/network_status_banner.dart flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart
git commit -m "feat(a11y): add Semantics labels and l10n Tooltips to core widgets"
```

---

## Task 16: Widget 测试 — 语义化和键盘快捷键

**Files:**
- Create: `flutter/apps/web/test/a11y/semantics_test.dart`
- Create: `flutter/apps/web/test/a11y/keyboard_test.dart`

- [ ] **Step 1: 编写语义化测试**

```dart
// flutter/apps/web/test/a11y/semantics_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/chat/presentation/widgets/message_input.dart';

void main() {
  group('MessageInput Semantics', () {
    testWidgets('send button has semantic label', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: MessageInput(onSend: (_) {}),
        ),
      );

      final sendButton = find.byIcon(Icons.send);
      expect(sendButton, findsOneWidget);

      final SemanticsNode sendNode = tester.getSemantics(sendButton);
      expect(sendNode.label, contains('Send'));
    });

    testWidgets('attachment button has semantic label', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: MessageInput(onSend: (_) {}),
        ),
      );

      final attachButton = find.byIcon(Icons.add_circle_outline);
      expect(attachButton, findsOneWidget);

      final SemanticsNode attachNode = tester.getSemantics(attachButton);
      expect(attachNode.label, contains('Attach'));
    });

    testWidgets('voice button has semantic label', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: MessageInput(onSend: (_) {}),
        ),
      );

      final voiceButton = find.byIcon(Icons.mic);
      expect(voiceButton, findsOneWidget);

      final SemanticsNode voiceNode = tester.getSemantics(voiceButton);
      expect(voiceNode.label, contains('Voice'));
    });
  });
}
```

- [ ] **Step 2: 编写键盘快捷键测试**

```dart
// flutter/apps/web/test/a11y/keyboard_test.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ChatPage Keyboard Shortcuts', () {
    testWidgets('Escape key unfocuses input', (tester) async {
      final focusNode = FocusNode();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CallbackShortcuts(
              bindings: {
                LogicalKeySet(LogicalKeyboardKey.escape): () {
                  focusNode.unfocus();
                },
              },
              child: TextField(focusNode: focusNode),
            ),
          ),
        ),
      );

      focusNode.requestFocus();
      await tester.pump();
      expect(focusNode.hasFocus, isTrue);

      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pump();
      expect(focusNode.hasFocus, isFalse);
    });

    testWidgets('Enter key triggers send in TextField', (tester) async {
      String? sentText;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TextField(
              onSubmitted: (text) => sentText = text,
            ),
          ),
        ),
      );

      await tester.enterText(find.byType(TextField), 'hello');
      await tester.testTextInput.receiveAction(TextInputAction.send);
      await tester.pump();

      expect(sentText, 'hello');
    });
  });
}
```

- [ ] **Step 3: 运行测试验证通过**

Run: `cd flutter/apps/web && flutter test test/a11y/`
Expected: All tests pass

- [ ] **Step 4: 提交**

```bash
git add flutter/apps/web/test/a11y/
git commit -m "test(a11y): add widget tests for Semantics and keyboard shortcuts"
```

---

## Task 17: 最终验证 + 清理

- [ ] **Step 1: 运行所有测试**

Run: `cd flutter/packages/ui && flutter test && cd ../../apps/web && flutter test`
Expected: All tests pass

- [ ] **Step 2: 运行静态分析**

Run: `cd flutter/packages/ui && flutter analyze && cd ../../apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 3: 确认无残留旧引用**

Run: `grep -r "ScreenSize" flutter/apps/web/lib/ && grep -r "getScreenSize" flutter/apps/web/lib/ && grep -r "ResponsiveLayout.isMobile" flutter/apps/web/lib/`
Expected: No output (all old references removed)

- [ ] **Step 4: 最终提交（如有清理）**

```bash
git add -A
git commit -m "chore: final cleanup of responsive migration"
```
