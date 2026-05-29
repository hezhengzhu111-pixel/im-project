# UI 美化（分层混合风格）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Flutter Web IM 应用的 UI 从基础 Material 风格升级为包含毛玻璃、流体渐变、微交互动画、新拟态阴影的现代化视觉设计。

**Architecture:** 基于现有 `GlassTheme` ThemeExtension 扩展属性，新增 3 个共享 Widget（GlassCard、GradientBackground、AnimatedEntrance），然后逐页面应用视觉效果。所有改动仅限 UI 层，不触碰数据/状态/API 代码。

**Tech Stack:** Flutter Web, Material 3, ThemeExtension, AnimationController, BackdropFilter

**改动边界：**
- ✅ 可改：主题文件、presentation/widgets/、新增共享 Widget
- ❌ 禁改：data/、*_provider.dart、*_state.dart、Model 类、路由定义、l10n/

---

### Task 1: 扩展设计令牌和 GlassTheme

**Files:**
- Modify: `flutter/packages/ui/lib/src/theme/im_tokens.dart`
- Modify: `flutter/apps/web/lib/core/theme/glass_theme.dart`

- [ ] **Step 1: 在 ImTokens 中新增阴影和动画令牌**

在 `flutter/packages/ui/lib/src/theme/im_tokens.dart` 的 `ImTokens` 类末尾（`breakpointDesktop` 之后）添加：

```dart
  // ── Neumorphic Shadows ──
  static const List<BoxShadow> neumorphicInset = [
    BoxShadow(
      color: Color(0xFFd1d1d4),
      blurRadius: 12,
      offset: Offset(6, 6),
    ),
    BoxShadow(
      color: Colors.white,
      blurRadius: 12,
      offset: Offset(-6, -6),
    ),
  ];

  static const List<BoxShadow> neumorphicFlat = [
    BoxShadow(
      color: Color(0xFFd1d1d4),
      blurRadius: 8,
      offset: Offset(4, 4),
    ),
    BoxShadow(
      color: Colors.white,
      blurRadius: 8,
      offset: Offset(-4, -4),
    ),
  ];

  static const List<BoxShadow> neumorphicRaised = [
    BoxShadow(
      color: Color(0xFFd1d1d4),
      blurRadius: 16,
      offset: Offset(8, 8),
    ),
    BoxShadow(
      color: Colors.white,
      blurRadius: 16,
      offset: Offset(-8, -8),
    ),
  ];

  // ── Animation Durations ──
  static const Duration animFast = Duration(milliseconds: 150);
  static const Duration animNormal = Duration(milliseconds: 200);
  static const Duration animSlow = Duration(milliseconds: 300);
  static const Duration animDialog = Duration(milliseconds: 250);
```

- [ ] **Step 2: 在 GlassTheme 中新增 blur、gradient、shadow 属性**

在 `flutter/apps/web/lib/core/theme/glass_theme.dart` 中，向 `GlassTheme` 类添加新字段。修改构造函数和字段声明：

```dart
class GlassTheme extends ThemeExtension<GlassTheme> {
  const GlassTheme({
    required this.cardBackground,
    required this.cardBorder,
    required this.softShadow,
    required this.pageRadius,
    required this.controlRadius,
    required this.accentGradient,
    required this.segmentedBackground,
    required this.segmentedActiveBackground,
    required this.dividerColor,
    required this.navHoverBackground,
    required this.blurIntensity,
    required this.gradientColors,
    required this.neumorphicShadow,
    required this.animationDuration,
    required this.navBackground,
    required this.inputBackground,
  });

  // ... 现有字段保持不变 ...

  /// Background blur intensity in logical pixels.
  final double blurIntensity;

  /// Page-level gradient colors (used by GradientBackground).
  final List<Color> gradientColors;

  /// Neumorphic shadow preset.
  final List<BoxShadow> neumorphicShadow;

  /// Default animation duration for micro-interactions.
  final Duration animationDuration;

  /// Navigation rail/bar background color.
  final Color navBackground;

  /// Input field background color.
  final Color inputBackground;
```

- [ ] **Step 3: 更新 light/dark 静态实例**

在 `GlassTheme` 的 `light` 工厂中追加：

```dart
  static final light = GlassTheme(
    // ... 现有字段不变 ...
    blurIntensity: 12,
    gradientColors: const [
      Color(0xFF667eea),
      Color(0xFF764ba2),
      Color(0xFF23a6d5),
      Color(0xFF23d5ab),
    ],
    neumorphicShadow: ImTokens.neumorphicRaised,
    animationDuration: const Duration(milliseconds: 200),
    navBackground: const Color(0xF0FFFFFF),
    inputBackground: const Color(0x80FFFFFF),
  );
```

在 `dark` 工厂中追加：

```dart
  static final dark = GlassTheme(
    // ... 现有字段不变 ...
    blurIntensity: 16,
    gradientColors: const [
      Color(0xFF1e1b4b),
      Color(0xFF0f172a),
      Color(0xFF042f2e),
    ],
    neumorphicShadow: ImTokens.neumorphicFlat,
    animationDuration: const Duration(milliseconds: 200),
    navBackground: const Color(0xE61E1E1E),
    inputBackground: const Color(0xB31E1E1E),
  );
```

- [ ] **Step 4: 更新 copyWith 和 lerp**

在 `copyWith` 方法中添加新参数支持，在 `lerp` 中添加对应的插值逻辑：

```dart
  @override
  GlassTheme copyWith({
    Color? cardBackground,
    Color? cardBorder,
    List<BoxShadow>? softShadow,
    double? pageRadius,
    double? controlRadius,
    LinearGradient? accentGradient,
    Color? segmentedBackground,
    Color? segmentedActiveBackground,
    Color? dividerColor,
    Color? navHoverBackground,
    double? blurIntensity,
    List<Color>? gradientColors,
    List<BoxShadow>? neumorphicShadow,
    Duration? animationDuration,
    Color? navBackground,
    Color? inputBackground,
  }) {
    return GlassTheme(
      cardBackground: cardBackground ?? this.cardBackground,
      cardBorder: cardBorder ?? this.cardBorder,
      softShadow: softShadow ?? this.softShadow,
      pageRadius: pageRadius ?? this.pageRadius,
      controlRadius: controlRadius ?? this.controlRadius,
      accentGradient: accentGradient ?? this.accentGradient,
      segmentedBackground: segmentedBackground ?? this.segmentedBackground,
      segmentedActiveBackground: segmentedActiveBackground ?? this.segmentedActiveBackground,
      dividerColor: dividerColor ?? this.dividerColor,
      navHoverBackground: navHoverBackground ?? this.navHoverBackground,
      blurIntensity: blurIntensity ?? this.blurIntensity,
      gradientColors: gradientColors ?? this.gradientColors,
      neumorphicShadow: neumorphicShadow ?? this.neumorphicShadow,
      animationDuration: animationDuration ?? this.animationDuration,
      navBackground: navBackground ?? this.navBackground,
      inputBackground: inputBackground ?? this.inputBackground,
    );
  }

  @override
  GlassTheme lerp(GlassTheme? other, double t) {
    if (other is! GlassTheme) return this;
    return GlassTheme(
      cardBackground: Color.lerp(cardBackground, other.cardBackground, t)!,
      cardBorder: Color.lerp(cardBorder, other.cardBorder, t)!,
      softShadow: BoxShadow.lerpList(softShadow, other.softShadow, t) ?? [],
      pageRadius: lerpDouble(pageRadius, other.pageRadius, t)!,
      controlRadius: lerpDouble(controlRadius, other.controlRadius, t)!,
      accentGradient: LinearGradient.lerp(accentGradient, other.accentGradient, t)!,
      segmentedBackground: Color.lerp(segmentedBackground, other.segmentedBackground, t)!,
      segmentedActiveBackground: Color.lerp(segmentedActiveBackground, other.segmentedActiveBackground, t)!,
      dividerColor: Color.lerp(dividerColor, other.dividerColor, t)!,
      navHoverBackground: Color.lerp(navHoverBackground, other.navHoverBackground, t)!,
      blurIntensity: lerpDouble(blurIntensity, other.blurIntensity, t)!,
      gradientColors: Color.lerpList(gradientColors, other.gradientColors, t) ?? other.gradientColors,
      neumorphicShadow: BoxShadow.lerpList(neumorphicShadow, other.neumorphicShadow, t) ?? [],
      animationDuration: t < 0.5 ? animationDuration : other.animationDuration,
      navBackground: Color.lerp(navBackground, other.navBackground, t)!,
      inputBackground: Color.lerp(inputBackground, other.inputBackground, t)!,
    );
  }
```

- [ ] **Step 5: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 6: 提交**

```bash
cd D:/project/new-im-project
git add flutter/packages/ui/lib/src/theme/im_tokens.dart flutter/apps/web/lib/core/theme/glass_theme.dart
git commit -m "feat(ui): extend design tokens and GlassTheme with blur/gradient/shadow/animation properties"
```

---

### Task 2: 创建 GlassCard 共享组件

**Files:**
- Create: `flutter/packages/ui/lib/src/widgets/glass_card.dart`
- Modify: `flutter/packages/ui/lib/im_ui.dart`

- [ ] **Step 1: 创建 GlassCard Widget**

创建文件 `flutter/packages/ui/lib/src/widgets/glass_card.dart`：

```dart
import 'dart:ui';
import 'package:flutter/material.dart';

/// A glassmorphism card with backdrop blur and semi-transparent background.
///
/// Wraps [child] in a [ClipRRect] + [BackdropFilter] for the blur effect,
/// with a semi-transparent border and soft shadow.
class GlassCard extends StatelessWidget {
  const GlassCard({
    required this.child,
    this.blurIntensity = 12,
    this.backgroundColor = const Color(0xCCFFFFFF),
    this.borderColor = const Color(0x4DFFFFFF),
    this.borderRadius = 16,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.shadow,
    this.onTap,
    super.key,
  });

  final Widget child;
  final double blurIntensity;
  final Color backgroundColor;
  final Color borderColor;
  final double borderRadius;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final List<BoxShadow>? shadow;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: blurIntensity,
          sigmaY: blurIntensity,
        ),
        child: Container(
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(color: borderColor),
            boxShadow: shadow,
          ),
          padding: padding,
          child: child,
        ),
      ),
    );

    if (margin != null) {
      return Padding(padding: margin!, child: card);
    }

    if (onTap != null) {
      return GestureDetector(onTap: onTap, child: card);
    }

    return card;
  }
}
```

- [ ] **Step 2: 在 im_ui.dart 中导出**

在 `flutter/packages/ui/lib/im_ui.dart` 末尾添加：

```dart
export 'src/widgets/glass_card.dart';
```

- [ ] **Step 3: 验证编译通过**

Run: `cd flutter/packages/ui && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 4: 提交**

```bash
cd D:/project/new-im-project
git add flutter/packages/ui/lib/src/widgets/glass_card.dart flutter/packages/ui/lib/im_ui.dart
git commit -m "feat(ui): add GlassCard component with backdrop blur"
```

---

### Task 3: 创建 GradientBackground 共享组件

**Files:**
- Create: `flutter/packages/ui/lib/src/widgets/gradient_background.dart`
- Modify: `flutter/packages/ui/lib/im_ui.dart`

- [ ] **Step 1: 创建 GradientBackground Widget**

创建文件 `flutter/packages/ui/lib/src/widgets/gradient_background.dart`：

```dart
import 'package:flutter/material.dart';

/// A full-screen animated gradient background.
///
/// Displays a flowing gradient with optional floating decorative orbs.
/// Set [animated] to false for a static gradient (performance fallback).
class GradientBackground extends StatefulWidget {
  const GradientBackground({
    required this.child,
    this.colors = const [
      Color(0xFF667eea),
      Color(0xFF764ba2),
      Color(0xFF23a6d5),
      Color(0xFF23d5ab),
    ],
    this.animated = true,
    this.duration = const Duration(seconds: 8),
    this.orbCount = 3,
    super.key,
  });

  final Widget child;
  final List<Color> colors;
  final bool animated;
  final Duration duration;
  final int orbCount;

  @override
  State<GradientBackground> createState() => _GradientBackgroundState();
}

class _GradientBackgroundState extends State<GradientBackground>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    );
    if (widget.animated) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(GradientBackground oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.animated && !_controller.isAnimating) {
      _controller.repeat();
    } else if (!widget.animated && _controller.isAnimating) {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final angle = _controller.value * 360;
        return Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment(
                -0.5 + 0.5 * (angle / 180 - 1).abs(),
                -1 + 0.5 * (angle / 360),
              ),
              end: Alignment(
                0.5 - 0.5 * (angle / 180 - 1).abs(),
                1 - 0.5 * (angle / 360),
              ),
              colors: widget.colors,
            ),
          ),
          child: Stack(
            children: [
              if (widget.animated) ..._buildOrbs(angle),
              widget.child,
            ],
          ),
        );
      },
    );
  }

  List<Widget> _buildOrbs(double angle) {
    return List.generate(widget.orbCount, (i) {
      final phase = (angle + i * 120) % 360;
      final rad = phase * 3.14159 / 180;
      final x = 0.3 + 0.4 * (i.isEven ? 1 : -1) * rad.sin();
      final y = 0.2 + 0.6 * rad.cos().abs();
      final size = 60.0 + i * 20;

      return Positioned.fill(
        child: Align(
          alignment: Alignment(x * 2 - 1, y * 2 - 1),
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.08 + i * 0.02),
            ),
          ),
        ),
      );
    });
  }
}
```

- [ ] **Step 2: 在 im_ui.dart 中导出**

在 `flutter/packages/ui/lib/im_ui.dart` 末尾添加：

```dart
export 'src/widgets/gradient_background.dart';
```

- [ ] **Step 3: 验证编译通过**

Run: `cd flutter/packages/ui && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 4: 提交**

```bash
cd D:/project/new-im-project
git add flutter/packages/ui/lib/src/widgets/gradient_background.dart flutter/packages/ui/lib/im_ui.dart
git commit -m "feat(ui): add GradientBackground component with animated gradient and floating orbs"
```

---

### Task 4: 创建 AnimatedEntrance 共享组件

**Files:**
- Create: `flutter/packages/ui/lib/src/widgets/animated_entrance.dart`
- Modify: `flutter/packages/ui/lib/im_ui.dart`

- [ ] **Step 1: 创建 AnimatedEntrance Widget**

创建文件 `flutter/packages/ui/lib/src/widgets/animated_entrance.dart`：

```dart
import 'package:flutter/material.dart';

/// Wraps a child widget with a fade-in + slide-up entrance animation.
///
/// Plays once when the widget is first built. Use [delay] for staggered
/// entrance effects in lists.
class AnimatedEntrance extends StatefulWidget {
  const AnimatedEntrance({
    required this.child,
    this.duration = const Duration(milliseconds: 200),
    this.delay = Duration.zero,
    this.offset = 8,
    super.key,
  });

  final Widget child;
  final Duration duration;
  final Duration delay;
  final double offset;

  @override
  State<AnimatedEntrance> createState() => _AnimatedEntranceState();
}

class _AnimatedEntranceState extends State<AnimatedEntrance>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    );
    _fadeAnim = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    );
    _slideAnim = Tween<Offset>(
      begin: Offset(0, widget.offset / 100),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));

    if (widget.delay == Duration.zero) {
      _controller.forward();
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeAnim,
      child: SlideTransition(
        position: _slideAnim,
        child: widget.child,
      ),
    );
  }
}
```

- [ ] **Step 2: 在 im_ui.dart 中导出**

在 `flutter/packages/ui/lib/im_ui.dart` 末尾添加：

```dart
export 'src/widgets/animated_entrance.dart';
```

- [ ] **Step 3: 验证编译通过**

Run: `cd flutter/packages/ui && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 4: 提交**

```bash
cd D:/project/new-im-project
git add flutter/packages/ui/lib/src/widgets/animated_entrance.dart flutter/packages/ui/lib/im_ui.dart
git commit -m "feat(ui): add AnimatedEntrance component for fade+slide entrance animations"
```

---

### Task 5: 改造登录/注册页面

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/login_page.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/register_page.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart`

- [ ] **Step 1: 改造 login_page.dart — 使用 GradientBackground**

替换 `login_page.dart` 中 `build` 方法的 `Scaffold` body 部分。将现有的 `Container` + `LinearGradient` + `DecorativeBackground` 替换为 `GradientBackground`：

```dart
  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final glass = Theme.of(context).extension<GlassTheme>()!;

    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (!mounted) return;
      if (next.errorCode != null) {
        _formController.setFormError(_locErrorCode(next.errorCode!));
      } else if (prev?.errorCode != null && next.errorCode == null) {
        _formController.setFormError(null);
      }
    });

    return Scaffold(
      body: GradientBackground(
        colors: glass.gradientColors,
        animated: true,
        child: FadeTransition(
          opacity: _fadeAnim,
          child: SlideTransition(
            position: _slideAnim,
            child: context.isMobile
                ? _buildMobileLayout(loc)
                : _buildDesktopLayout(loc),
          ),
        ),
      ),
    );
  }
```

同时需要在文件顶部添加 `import 'package:im_ui/ui.dart';`（如果尚未导入 `glass_theme.dart`）和 `import '../../../core/theme/glass_theme.dart';`。

- [ ] **Step 1b: 改造 register_page.dart — 同样使用 GradientBackground**

对 `register_page.dart` 做相同改造。将 `build` 方法中的 `Container` + `LinearGradient` + `DecorativeBackground` 替换为 `GradientBackground`：

```dart
  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final loc = AppLocalizations.of(context)!;
    final glass = Theme.of(context).extension<GlassTheme>()!;

    return Scaffold(
      body: GradientBackground(
        colors: glass.gradientColors,
        animated: true,
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SlideTransition(
            position: _slideAnimation,
            child: context.isMobile
                ? _buildMobileLayout(authState, loc)
                : _buildDesktopLayout(authState, loc),
          ),
        ),
      ),
    );
  }
```

需要在文件顶部添加 `import 'package:im_web/core/theme/glass_theme.dart';`。

- [ ] **Step 2: 改造 auth_card.dart — 使用 GlassCard 效果**

读取 `flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart`，将卡片容器替换为毛玻璃效果。在 `build` 方法中，将外层 `Container` 的 `decoration` 改为：

```dart
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>()!;

    return ClipRRect(
      borderRadius: BorderRadius.circular(glass.pageRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: glass.blurIntensity,
          sigmaY: glass.blurIntensity,
        ),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(maxWidth: 420),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: glass.cardBackground,
            borderRadius: BorderRadius.circular(glass.pageRadius),
            border: Border.all(color: glass.cardBorder),
            boxShadow: glass.softShadow,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ... 现有 title/subtitle/child 内容不变 ...
            ],
          ),
        ),
      ),
    );
  }
```

需要在文件顶部添加 `import 'dart:ui';` 和 `import 'package:im_web/core/theme/glass_theme.dart';`。

- [ ] **Step 3: 改造 gradient_button.dart — 添加悬浮动画**

读取 `flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart`，将其改为 `StatefulWidget` 并添加 `MouseRegion` 悬浮缩放效果：

```dart
class GradientButton extends StatefulWidget {
  const GradientButton({
    required this.text,
    this.isLoading = false,
    this.onPressed,
    super.key,
  });

  final String text;
  final bool isLoading;
  final VoidCallback? onPressed;

  @override
  State<GradientButton> createState() => _GradientButtonState();
}

class _GradientButtonState extends State<GradientButton> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final glass = Theme.of(context).extension<GlassTheme>()!;

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: glass.animationDuration,
        transform: _isHovered
            ? (Matrix4.identity()..translate(0.0, -2.0))
            : Matrix4.identity(),
        child: AnimatedContainer(
          duration: glass.animationDuration,
          decoration: BoxDecoration(
            gradient: glass.accentGradient,
            borderRadius: BorderRadius.circular(glass.controlRadius),
            boxShadow: _isHovered
                ? [
                    BoxShadow(
                      color: glass.accentGradient.colors.first
                          .withValues(alpha: 0.4),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : [],
          ),
          child: ElevatedButton(
            onPressed: widget.isLoading ? null : widget.onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              shadowColor: Colors.transparent,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(
                horizontal: 24,
                vertical: 14,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(glass.controlRadius),
              ),
            ),
            child: widget.isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(widget.text),
          ),
        ),
      ),
    );
  }
}
```

需要在文件顶部添加 `import 'package:im_web/core/theme/glass_theme.dart';`。

- [ ] **Step 4: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 5: 提交**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/features/auth/presentation/login_page.dart \
       flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart \
       flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart
git commit -m "feat(ui): upgrade login/register pages with fluid gradient and glass card effects"
```

---

### Task 6: 改造聊天页面 — 毛玻璃侧栏和渐变底色

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_bubble.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`

- [ ] **Step 1: 改造 chat_page.dart — 侧栏毛玻璃背景**

在 `chat_page.dart` 的 `build` 方法中，为 `expanded` 模式的侧栏 `SizedBox` 添加毛玻璃装饰。找到：

```dart
          expanded: Row(
            children: [
              SizedBox(
                width: context.breakpoint
                    .value(
                      compact: 0,
                      medium: 0,
                      expanded: ImTokens.layoutChatSidebarWidth,
                      large: ImTokens.layoutChatSidebarWidth,
                    )
                    .toDouble(),
                child: _buildSessionList(sessions, activeId, loc),
              ),
```

替换为：

```dart
          expanded: Row(
            children: [
              ClipRect(
                child: BackdropFilter(
                  filter: ImageFilter.blur(
                    sigmaX: glass.blurIntensity * 0.5,
                    sigmaY: glass.blurIntensity * 0.5,
                  ),
                  child: Container(
                    width: context.breakpoint
                        .value(
                          compact: 0,
                          medium: 0,
                          expanded: ImTokens.layoutChatSidebarWidth,
                          large: ImTokens.layoutChatSidebarWidth,
                        )
                        .toDouble(),
                    color: glass.navBackground,
                    child: _buildSessionList(sessions, activeId, loc),
                  ),
                ),
              ),
```

同时在 `build` 方法开头获取 `glass`：

```dart
    final glass = Theme.of(context).extension<GlassTheme>()!;
```

需要在文件顶部添加 `import 'dart:ui';` 和 `import '../../../core/theme/glass_theme.dart';`。

- [ ] **Step 2: 改造 session_tile.dart — 悬浮动画和选中效果**

将 `SessionTile` 改为 `StatefulWidget`，添加 `MouseRegion` 悬浮效果和更精致的选中状态：

```dart
class SessionTile extends StatefulWidget {
  const SessionTile({
    required this.session,
    required this.isSelected,
    required this.onTap,
    super.key,
  });

  final ChatSession session;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  State<SessionTile> createState() => _SessionTileState();
}

class _SessionTileState extends State<SessionTile> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>()!;
    final lastMsg = widget.session.lastMessage;

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: glass.animationDuration,
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: widget.isSelected
              ? theme.colorScheme.primaryContainer.withAlpha(50)
              : _isHovered
                  ? glass.navHoverBackground
                  : Colors.transparent,
          borderRadius: BorderRadius.circular(glass.controlRadius),
        ),
        child: Semantics(
          label: widget.session.targetName.isNotEmpty
              ? widget.session.targetName
              : AppLocalizations.of(context)!.chatSelectSession,
          button: true,
          child: ListTile(
            selected: widget.isSelected,
            selectedTileColor: Colors.transparent,
            leading: CircleAvatar(
              radius: 24,
              backgroundImage: widget.session.targetAvatar != null
                  ? NetworkImage(widget.session.targetAvatar!)
                  : null,
              child: widget.session.targetAvatar == null
                  ? Text(
                      widget.session.targetName.isNotEmpty
                          ? widget.session.targetName[0].toUpperCase()
                          : '?',
                      style: const TextStyle(fontSize: 18),
                    )
                  : null,
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.session.targetName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ),
                if (widget.session.lastMessageTime != null)
                  Text(
                    _formatTime(widget.session.lastMessageTime!),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
              ],
            ),
            subtitle: Row(
              children: [
                Expanded(
                  child: Text(
                    lastMsg?.content ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: theme.colorScheme.onSurfaceVariant,
                      fontSize: 13,
                    ),
                  ),
                ),
                if (widget.session.unreadCount > 0)
                  Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      gradient: glass.accentGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      widget.session.unreadCount > 99
                          ? '99+'
                          : '${widget.session.unreadCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
            onTap: widget.onTap,
          ),
        ),
      ),
    );
  }

  String _formatTime(String time) {
    try {
      final dt = DateTime.parse(time);
      final now = DateTime.now();
      if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
        return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      }
      return '${dt.month}/${dt.day}';
    } catch (_) {
      return time;
    }
  }
}
```

需要在文件顶部添加 `import 'package:im_web/core/theme/glass_theme.dart';`。

- [ ] **Step 3: 改造 message_bubble.dart — 入场动画**

在 `chat_page.dart` 的消息列表 `ListView.builder` 中，为每个 `MessageBubble` 包裹 `AnimatedEntrance`。找到：

```dart
                    return MessageBubble(
                      message: msg,
                      isMe: msg.senderId == currentUserId,
                    );
```

替换为：

```dart
                    return AnimatedEntrance(
                      duration: glass.animationDuration,
                      offset: 8,
                      child: MessageBubble(
                        message: msg,
                        isMe: msg.senderId == currentUserId,
                      ),
                    );
```

需要确保 `glass` 变量在该作用域内可用（已在 Step 1 中添加）。

- [ ] **Step 4: 改造 message_input.dart — 毛玻璃底栏**

在 `message_input.dart` 的 `build` 方法中，将输入栏 `Container` 的 `decoration` 改为毛玻璃效果：

找到：

```dart
        Container(
          padding: const EdgeInsets.all(8.0),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border: Border(
              top: BorderSide(
                  color: Theme.of(context).colorScheme.outlineVariant),
            ),
          ),
```

替换为：

```dart
        ClipRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
              padding: const EdgeInsets.all(8.0),
              decoration: BoxDecoration(
                color: glass.inputBackground,
                border: Border(
                  top: BorderSide(color: glass.dividerColor),
                ),
              ),
```

需要在文件顶部添加 `import 'dart:ui';` 和 `import 'package:im_web/core/theme/glass_theme.dart';`。

在 `build` 方法开头获取 `glass`：

```dart
    final glass = Theme.of(context).extension<GlassTheme>()!;
```

同时找到 `build` 方法末尾的 `),`（对应外层 `Column`），确保 `ClipRect` 的闭合括号正确。

- [ ] **Step 5: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 6: 提交**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart \
       flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart \
       flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart
git commit -m "feat(ui): upgrade chat page with glass sidebar, hover animations, and glass input bar"
```

---

### Task 7: 改造导航栏 — 毛玻璃背景

**Files:**
- Modify: `flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart`

- [ ] **Step 1: 改造 NavigationRail 背景**

在 `responsive_scaffold.dart` 的 `_buildDesktop` 方法中，为 `NavigationRail` 添加毛玻璃效果。找到：

```dart
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
                      label: Text(d.label),
                    ))
                .toList(),
          ),
```

替换为：

```dart
  Widget _buildDesktop(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: Row(
        children: [
          ClipRect(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
              child: Container(
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface.withAlpha(230),
                  border: Border(
                    right: BorderSide(
                      color: theme.colorScheme.outlineVariant.withAlpha(80),
                    ),
                  ),
                ),
                child: NavigationRail(
                  selectedIndex: selectedIndex,
                  onDestinationSelected: onDestinationSelected,
                  labelType: NavigationRailLabelType.all,
                  backgroundColor: Colors.transparent,
                  destinations: destinations
                      .map((d) => NavigationRailDestination(
                            icon: Icon(d.icon),
                            selectedIcon: d.selectedIcon != null
                                ? Icon(d.selectedIcon)
                                : null,
                            label: Text(d.label),
                          ))
                      .toList(),
                ),
              ),
            ),
          ),
```

需要在文件顶部添加 `import 'dart:ui';`。

- [ ] **Step 2: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 3: 提交**

```bash
cd D:/project/new-im-project
git add flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart
git commit -m "feat(ui): add glassmorphism backdrop to NavigationRail"
```

---

### Task 8: 改造联系人和群组页面

**Files:**
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart`
- Modify: `flutter/apps/web/lib/features/group/presentation/group_list_page.dart`

- [ ] **Step 1: 改造 contacts_page.dart — TabBar 毛玻璃效果**

在 `contacts_page.dart` 的 `build` 方法中，为 `TabBar` 外层添加毛玻璃装饰。找到：

```dart
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: TabBar(
                controller: _tabController,
```

替换为：

```dart
    final glass = Theme.of(context).extension<GlassTheme>()!;

    return Column(
      children: [
        ClipRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(
              sigmaX: glass.blurIntensity * 0.5,
              sigmaY: glass.blurIntensity * 0.5,
            ),
            child: Container(
              decoration: BoxDecoration(
                color: glass.navBackground,
                border: Border(
                  bottom: BorderSide(color: glass.dividerColor),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TabBar(
                      controller: _tabController,
```

同时需要修改对应的闭合括号，确保 `Row` 被 `Container` 包裹。在文件末尾附近找到对应的 `],` 闭合，添加 `), ), ),` 来关闭 `Container`、`BackdropFilter`、`ClipRect`。

需要在文件顶部添加 `import 'dart:ui';` 和 `import 'package:im_web/core/theme/glass_theme.dart';`。

- [ ] **Step 2: 改造 group_list_page.dart — 移除 Scaffold appBar，使用自定义头部**

在 `group_list_page.dart` 中，将 `Scaffold` 的 `appBar` 替换为自定义的毛玻璃头部：

```dart
  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final groupState = ref.watch(groupStateProvider);
    final glass = Theme.of(context).extension<GlassTheme>()!;

    return Column(
      children: [
        ClipRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(
              sigmaX: glass.blurIntensity * 0.5,
              sigmaY: glass.blurIntensity * 0.5,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: glass.navBackground,
                border: Border(
                  bottom: BorderSide(color: glass.dividerColor),
                ),
              ),
              child: Row(
                children: [
                  Text(
                    loc.navGroups,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.search),
                    onPressed: () => showDialog(
                      context: context,
                      builder: (_) => const JoinGroupDialog(),
                    ),
                    tooltip: loc.joinGroupTooltip,
                  ),
                  IconButton(
                    icon: const Icon(Icons.add),
                    onPressed: () => context.push('/groups/create'),
                    tooltip: loc.groupCreateTooltip,
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(
          child: groupState.isLoading
              ? const Center(child: CircularProgressIndicator())
              : groupState.groups.isEmpty
                  ? Center(child: Text(loc.groupNoGroups))
                  : ListView.builder(
                      itemCount: groupState.groups.length,
                      itemBuilder: (context, index) {
                        final group = groupState.groups[index];
                        return GroupTile(
                          group: group,
                          onTap: () {
                            final sessionKey = ref
                                .read(chatStateProvider.notifier)
                                .getGroupSessionKey(group.id);
                            ref
                                .read(chatStateProvider.notifier)
                                .setActiveSession(sessionKey);
                            ref
                                .read(chatStateProvider.notifier)
                                .loadGroupMessages(group.id);
                            context.go('/chat');
                          },
                        );
                      },
                    ),
        ),
      ],
    );
  }
```

需要在文件顶部添加 `import 'dart:ui';`、`import 'package:im_ui/im_ui.dart';` 和 `import 'package:im_web/core/theme/glass_theme.dart';`。

- [ ] **Step 3: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 4: 提交**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart \
       flutter/apps/web/lib/features/group/presentation/group_list_page.dart
git commit -m "feat(ui): upgrade contacts and group pages with glass header effects"
```

---

### Task 9: 改造设置页面

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/widgets/settings_section.dart`

- [ ] **Step 1: 改造 SettingsSection — 增强毛玻璃效果**

在 `settings_section.dart` 的 `SettingsSection` build 方法中，添加 `BackdropFilter` 毛玻璃效果：

```dart
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>()!;
    return Container(
      decoration: BoxDecoration(
        color: glass.cardBackground,
        borderRadius: BorderRadius.circular(glass.pageRadius),
        border: Border.all(color: glass.cardBorder),
        boxShadow: glass.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.only(bottom: 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(glass.pageRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(
            sigmaX: glass.blurIntensity,
            sigmaY: glass.blurIntensity,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (title != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Text(
                    title!,
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ...children,
            ],
          ),
        ),
      ),
    );
  }
```

需要在文件顶部添加 `import 'dart:ui';`。

- [ ] **Step 2: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 3: 提交**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/features/settings/presentation/widgets/settings_section.dart
git commit -m "feat(ui): enhance SettingsSection with backdrop blur glass effect"
```

---

### Task 10: 改造朋友圈页面

**Files:**
- Modify: `flutter/apps/web/lib/features/moments/presentation/widgets/moments_cover.dart`
- Modify: `flutter/apps/web/lib/features/moments/presentation/widgets/moments_topbar.dart`

- [ ] **Step 1: 改造 moments_cover.dart — 极简留白风格**

读取 `flutter/apps/web/lib/features/moments/presentation/widgets/moments_cover.dart`，确保封面区域使用简洁的设计。如果现有封面已有渐变背景，保持不变（极简留白 = 不加特效）。如果需要调整，确保封面高度和布局与整体风格一致。

- [ ] **Step 2: 改造 moments_topbar.dart — 毛玻璃顶栏**

读取 `flutter/apps/web/lib/features/moments/presentation/widgets/moments_topbar.dart`，为顶栏添加毛玻璃效果：

在 `build` 方法中，找到顶部 `Container` 或 `AppBar`，添加 `BackdropFilter`：

```dart
  @override
  Widget build(BuildContext context) {
    final glass = Theme.of(context).extension<GlassTheme>()!;

    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: glass.blurIntensity,
          sigmaY: glass.blurIntensity,
        ),
        child: Container(
          // ... 保持现有 padding 和布局 ...
          decoration: BoxDecoration(
            color: glass.navBackground,
            border: Border(
              bottom: BorderSide(color: glass.dividerColor),
            ),
          ),
          child: Row(
            // ... 现有内容不变 ...
          ),
        ),
      ),
    );
  }
```

需要在文件顶部添加 `import 'dart:ui';` 和 `import 'package:im_web/core/theme/glass_theme.dart';`。

- [ ] **Step 3: 验证编译通过**

Run: `cd flutter/apps/web && flutter analyze --no-pub 2>&1 | head -20`
Expected: 无新增 error

- [ ] **Step 4: 提交**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/features/moments/presentation/widgets/moments_cover.dart \
       flutter/apps/web/lib/features/moments/presentation/widgets/moments_topbar.dart
git commit -m "feat(ui): upgrade moments page with glass topbar and minimal style"
```

---

### Task 11: 全局编译验证和最终提交

- [ ] **Step 1: 完整编译检查**

Run: `cd flutter/apps/web && flutter analyze 2>&1 | tail -20`
Expected: 无 error（warning 可接受）

- [ ] **Step 2: 运行现有测试**

Run: `cd flutter/apps/web && flutter test 2>&1 | tail -20`
Expected: 所有现有测试通过

- [ ] **Step 3: 最终提交（如有零散修改）**

```bash
cd D:/project/new-im-project
git add -A
git status
```

如果有未提交的修改，提交为：
```bash
git commit -m "feat(ui): complete UI redesign with glassmorphism, fluid gradients, and micro-interactions"
```
