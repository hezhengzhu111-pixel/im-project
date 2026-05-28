# IM UI Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build im_ui from a shell package into a reusable IM design system with tokens, theme, 8 components, tests, gallery page, and LoginPage migration.

**Architecture:** Two-layer token system (Semantic + Component) feeds into ImTheme (light/dark ThemeData builders). 8 base components consume tokens via theme. Debug-only gallery page showcases all components. LoginPage migrated to use im_ui components.

**Tech Stack:** Flutter 3.3+, Material 3, google_fonts, Riverpod (web app), go_router (web app)

---

## File Structure

### im_ui package (flutter/packages/ui/)

| File | Action | Responsibility |
|---|---|---|
| `lib/src/theme/im_tokens.dart` | CREATE | All design tokens (spacing, radius, typography, elevation, breakpoints, semantic colors, component tokens) |
| `lib/src/theme/im_theme.dart` | CREATE | `ImTheme.light()` / `ImTheme.dark()` ThemeData builders consuming ImTokens |
| `lib/src/theme/app_theme.dart` | MODIFY | Add `@Deprecated` annotation to AppTheme class |
| `lib/src/widgets/im_button.dart` | CREATE | ImButton widget (5 variants, 3 sizes, loading/fullWidth) |
| `lib/src/widgets/im_text_field.dart` | CREATE | ImTextField widget (label, error, prefix/suffix) |
| `lib/src/widgets/im_card.dart` | CREATE | ImCard widget (padding, margin, onTap, elevated) |
| `lib/src/widgets/im_empty.dart` | CREATE | ImEmpty widget (icon, title, subtitle, action) |
| `lib/src/widgets/im_avatar.dart` | CREATE | ImAvatar widget (imageUrl, name, size, status) |
| `lib/src/widgets/im_badge.dart` | CREATE | ImBadge widget (count, maxCount, child) |
| `lib/src/widgets/im_dialog.dart` | CREATE | ImDialog + ImDialogAction (title, content, actions) |
| `lib/src/widgets/im_nav_item.dart` | CREATE | ImNavItem widget (icon, label, badge, isSelected) |
| `lib/ui.dart` | MODIFY | Add exports for all new files |
| `test/theme/im_tokens_test.dart` | CREATE | Token validation tests |
| `test/theme/im_theme_test.dart` | CREATE | Theme builder tests |
| `test/widgets/im_button_test.dart` | CREATE | ImButton widget tests |
| `test/widgets/im_text_field_test.dart` | CREATE | ImTextField widget tests |
| `test/widgets/im_card_test.dart` | CREATE | ImCard widget tests |

### web app (flutter/apps/web/)

| File | Action | Responsibility |
|---|---|---|
| `lib/core/theme/app_theme.dart` | MODIFY | Consume ImTheme instead of building ThemeData directly |
| `lib/core/router/app_router.dart` | MODIFY | Add `/debug/gallery` route (debug-only) |
| `lib/features/debug/presentation/component_gallery_page.dart` | CREATE | Debug gallery page showcasing all im_ui components |
| `lib/features/auth/presentation/login_page.dart` | MODIFY | Replace AuthCard/TextField/GradientButton with im_ui components |
| `lib/features/auth/presentation/widgets/auth_card.dart` | DELETE | Replaced by ImCard |
| `lib/features/auth/presentation/widgets/gradient_button.dart` | DELETE | Replaced by ImButton |
| `lib/features/auth/presentation/widgets/form_field.dart` | DELETE | Replaced by ImTextField |

---

### Task 1: ImTokens — Design Tokens

**Files:**
- Create: `flutter/packages/ui/lib/src/theme/im_tokens.dart`

- [ ] **Step 1: Create im_tokens.dart with all token categories**

```dart
// flutter/packages/ui/lib/src/theme/im_tokens.dart

/// Central design token repository for the IM UI system.
///
/// All values are compile-time constants. Components should consume
/// these tokens via [ImTheme] rather than using raw values.
class ImTokens {
  ImTokens._();

  // ── Spacing (4px base unit) ──
  static const double space0 = 0;
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 20;
  static const double space6 = 24;
  static const double space8 = 32;
  static const double space10 = 40;
  static const double space12 = 48;

  // ── Border Radius ──
  static const double radiusNone = 0;
  static const double radiusSm = 4;
  static const double radiusMd = 8;
  static const double radiusLg = 12;
  static const double radiusXl = 16;
  static const double radiusFull = 999;

  // ── Typography (font sizes) ──
  static const double textXs = 12;
  static const double textSm = 14;
  static const double textBase = 16;
  static const double textLg = 18;
  static const double textXl = 20;
  static const double text2xl = 24;
  static const double text3xl = 30;

  // ── Elevation ──
  static const double elevationNone = 0;
  static const double elevationSm = 1;
  static const double elevationMd = 2;
  static const double elevationLg = 4;
  static const double elevationXl = 8;

  // ── Breakpoints ──
  static const double breakpointMobile = 600;
  static const double breakpointTablet = 900;
  static const double breakpointDesktop = 1200;
}

/// Semantic color tokens with light/dark variants.
///
/// Access via `ImColors.light` or `ImColors.dark` to get the correct
/// palette for the current brightness.
class ImColors {
  const ImColors._({
    required this.primary,
    required this.secondary,
    required this.error,
    required this.warning,
    required this.success,
    required this.info,
    required this.background,
    required this.surface,
    required this.surfaceVariant,
    required this.textPrimary,
    required this.textSecondary,
    required this.textDisabled,
    required this.border,
    required this.borderFocus,
    required this.borderError,
    required this.overlay,
    required this.ownMessageBubble,
    required this.otherMessageBubble,
    required this.systemMessageBubble,
    required this.online,
    required this.offline,
    required this.busy,
  });

  final Color primary;
  final Color secondary;
  final Color error;
  final Color warning;
  final Color success;
  final Color info;
  final Color background;
  final Color surface;
  final Color surfaceVariant;
  final Color textPrimary;
  final Color textSecondary;
  final Color textDisabled;
  final Color border;
  final Color borderFocus;
  final Color borderError;
  final Color overlay;
  final Color ownMessageBubble;
  final Color otherMessageBubble;
  final Color systemMessageBubble;
  final Color online;
  final Color offline;
  final Color busy;

  static const light = ImColors._(
    primary: Color(0xFF2196F3),
    secondary: Color(0xFF4CAF50),
    error: Color(0xFFF44336),
    warning: Color(0xFFFF9800),
    success: Color(0xFF4CAF50),
    info: Color(0xFF2196F3),
    background: Color(0xFFFAFAFA),
    surface: Color(0xFFFFFFFF),
    surfaceVariant: Color(0xFFF5F5F5),
    textPrimary: Color(0xFF212121),
    textSecondary: Color(0xFF757575),
    textDisabled: Color(0xFFBDBDBD),
    border: Color(0xFFE0E0E0),
    borderFocus: Color(0xFF2196F3),
    borderError: Color(0xFFF44336),
    overlay: Color(0x54000000),
    ownMessageBubble: Color(0xFFDCF8C6),
    otherMessageBubble: Color(0xFFFFFFFF),
    systemMessageBubble: Color(0xFFE1F5FE),
    online: Color(0xFF4CAF50),
    offline: Color(0xFF9E9E9E),
    busy: Color(0xFFF44336),
  );

  static const dark = ImColors._(
    primary: Color(0xFF90CAF9),
    secondary: Color(0xFF81C784),
    error: Color(0xFFEF5350),
    warning: Color(0xFFFFB74D),
    success: Color(0xFF66BB6A),
    info: Color(0xFF64B5F6),
    background: Color(0xFF121212),
    surface: Color(0xFF1E1E1E),
    surfaceVariant: Color(0xFF2C2C2C),
    textPrimary: Color(0xFFE0E0E0),
    textSecondary: Color(0xFF9E9E9E),
    textDisabled: Color(0xFF616161),
    border: Color(0xFF424242),
    borderFocus: Color(0xFF90CAF9),
    borderError: Color(0xFFEF5350),
    overlay: Color(0x80000000),
    ownMessageBubble: Color(0xFF005C4B),
    otherMessageBubble: Color(0xFF1F2C33),
    systemMessageBubble: Color(0xFF0D2137),
    online: Color(0xFF66BB6A),
    offline: Color(0xFF757575),
    busy: Color(0xFFEF5350),
  );
}

/// Component-level token values that reference semantic colors.
class ImComponentTokens {
  const ImComponentTokens._();

  // ── Button ──
  static const Color buttonPrimaryBg = ImColors.light.primary;
  static const Color buttonPrimaryText = Color(0xFFFFFFFF);
  static const Color buttonPrimaryDisabledBg = Color(0x612196F3);
  static const Color buttonPrimaryDisabledText = Color(0x61FFFFFF);
  static const Color buttonSecondaryBg = Color(0x00000000);
  static const Color buttonSecondaryText = ImColors.light.primary;
  static const Color buttonSecondaryBorder = ImColors.light.primary;
  static const Color buttonDangerBg = ImColors.light.error;
  static const Color buttonDangerText = Color(0xFFFFFFFF);

  // ── Input ──
  static const Color inputBg = ImColors.light.surface;
  static const Color inputBorder = ImColors.light.border;
  static const Color inputBorderFocus = ImColors.light.borderFocus;
  static const Color inputBorderError = ImColors.light.borderError;
  static const Color inputText = ImColors.light.textPrimary;
  static const Color inputPlaceholder = ImColors.light.textSecondary;

  // ── Card ──
  static const Color cardBg = ImColors.light.surface;
  static const Color cardBorder = ImColors.light.border;

  // ── Badge ──
  static const Color badgeBg = ImColors.light.error;
  static const Color badgeText = Color(0xFFFFFFFF);
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/packages/ui && flutter analyze lib/src/theme/im_tokens.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/packages/ui/lib/src/theme/im_tokens.dart
git commit -m "feat(ui): add design tokens (ImTokens, ImColors, ImComponentTokens)"
```

---

### Task 2: ImTheme — Theme Builder

**Files:**
- Create: `flutter/packages/ui/lib/src/theme/im_theme.dart`
- Modify: `flutter/packages/ui/lib/src/theme/app_theme.dart:5` (add @Deprecated)

- [ ] **Step 1: Create im_theme.dart**

```dart
// flutter/packages/ui/lib/src/theme/im_theme.dart

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'im_tokens.dart';

/// Builds Material 3 [ThemeData] from [ImTokens].
///
/// Usage:
/// ```dart
/// MaterialApp(
///   theme: ImTheme.light(),
///   darkTheme: ImTheme.dark(),
/// )
/// ```
class ImTheme {
  ImTheme._();

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final colors = isLight ? ImColors.light : ImColors.dark;
    final colorScheme = ColorScheme.fromSeed(
      seedColor: colors.primary,
      brightness: brightness,
    );

    final baseTextTheme = isLight
        ? ThemeData.light().textTheme
        : ThemeData.dark().textTheme;
    final textTheme = GoogleFonts.notoSansScTextTheme(baseTextTheme);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      textTheme: textTheme,
      scaffoldBackgroundColor: colors.background,
      appBarTheme: AppBarTheme(
        elevation: ImTokens.elevationNone,
        centerTitle: false,
        backgroundColor: colors.surface,
        foregroundColor: colors.textPrimary,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        elevation: ImTokens.elevationSm,
        color: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusLg),
          side: BorderSide(color: colors.border),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          borderSide: BorderSide(color: colors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          borderSide: BorderSide(color: colors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          borderSide: BorderSide(color: colors.borderFocus, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          borderSide: BorderSide(color: colors.borderError),
        ),
        contentPadding: EdgeInsets.symmetric(
          horizontal: ImTokens.space4,
          vertical: ImTokens.space3,
        ),
        hintStyle: TextStyle(color: colors.textSecondary),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: Colors.white,
          elevation: ImTokens.elevationSm,
          padding: EdgeInsets.symmetric(
            horizontal: ImTokens.space6,
            vertical: ImTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: Colors.white,
          padding: EdgeInsets.symmetric(
            horizontal: ImTokens.space6,
            vertical: ImTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.primary,
          side: BorderSide(color: colors.primary),
          padding: EdgeInsets.symmetric(
            horizontal: ImTokens.space6,
            vertical: ImTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        elevation: ImTokens.elevationLg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusXl),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: colors.border,
        thickness: 1,
        space: 1,
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: colors.surface,
        selectedIconTheme: IconThemeData(color: colors.primary),
        unselectedIconTheme: IconThemeData(color: colors.textSecondary),
        selectedLabelTextStyle: TextStyle(
          color: colors.primary,
          fontWeight: FontWeight.w600,
          fontSize: ImTokens.textSm,
        ),
        unselectedLabelTextStyle: TextStyle(
          color: colors.textSecondary,
          fontSize: ImTokens.textSm,
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Add @Deprecated to old AppTheme**

Open `flutter/packages/ui/lib/src/theme/app_theme.dart` and add the annotation before the class declaration (line 5):

```dart
@Deprecated('Use ImTheme.light() / ImTheme.dark() + ImTokens instead')
class AppTheme {
```

- [ ] **Step 3: Update barrel file to export new theme files**

Open `flutter/packages/ui/lib/ui.dart` and add the new exports:

```dart
library im_ui;

export 'src/theme/im_tokens.dart';
export 'src/theme/im_theme.dart';
export 'src/theme/app_theme.dart';
export 'src/widgets/widgets.dart';
export 'src/layouts/layouts.dart';
```

- [ ] **Step 4: Verify compilation**

Run: `cd flutter/packages/ui && flutter analyze lib/`
Expected: No errors (deprecation warning on AppTheme is expected)

- [ ] **Step 5: Commit**

```bash
git add flutter/packages/ui/lib/src/theme/im_theme.dart flutter/packages/ui/lib/src/theme/app_theme.dart flutter/packages/ui/lib/ui.dart
git commit -m "feat(ui): add ImTheme light/dark builders, deprecate old AppTheme"
```

---

### Task 3: ImButton Component

**Files:**
- Create: `flutter/packages/ui/lib/src/widgets/im_button.dart`

- [ ] **Step 1: Create im_button.dart**

```dart
// flutter/packages/ui/lib/src/widgets/im_button.dart

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

enum ImButtonVariant { primary, secondary, danger, ghost, text }

enum ImButtonSize { sm, md, lg }

/// A versatile button component supporting multiple variants and sizes.
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

  bool get _enabled => onPressed != null && !loading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    final content = loading
        ? SizedBox(
            width: _iconSize,
            height: _iconSize,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation(_loadingColor(colors)),
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                icon!,
                SizedBox(width: ImTokens.space2),
              ],
              if (label != null) Text(label!),
            ],
          );

    final button = _buildButton(context, colors, content);

    if (fullWidth) {
      return SizedBox(width: double.infinity, child: button);
    }
    return button;
  }

  Widget _buildButton(BuildContext context, ImColors colors, Widget content) {
    final style = _buttonStyle(colors);

    switch (variant) {
      case ImButtonVariant.primary:
        return ElevatedButton(
          onPressed: _enabled ? onPressed : null,
          style: style,
          child: content,
        );
      case ImButtonVariant.secondary:
        return OutlinedButton(
          onPressed: _enabled ? onPressed : null,
          style: style,
          child: content,
        );
      case ImButtonVariant.danger:
        return ElevatedButton(
          onPressed: _enabled ? onPressed : null,
          style: style,
          child: content,
        );
      case ImButtonVariant.ghost:
        return IconButton(
          onPressed: _enabled ? onPressed : null,
          icon: content,
          style: style,
        );
      case ImButtonVariant.text:
        return TextButton(
          onPressed: _enabled ? onPressed : null,
          style: style,
          child: content,
        );
    }
  }

  ButtonStyle? _buttonStyle(ImColors colors) {
    final padding = EdgeInsets.symmetric(
      horizontal: _horizontalPadding,
      vertical: _verticalPadding,
    );

    return ButtonStyle(
      padding: WidgetStateProperty.all(padding),
      minimumSize: WidgetStateProperty.all(Size(0, _height)),
      textStyle: WidgetStateProperty.all(
        TextStyle(fontSize: _fontSize, fontWeight: FontWeight.w500),
      ),
      shape: WidgetStateProperty.all(
        RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
        ),
      ),
      backgroundColor: _backgroundColor(colors),
      foregroundColor: _foregroundColor(colors),
      side: _borderSide(colors),
      elevation: WidgetStateProperty.all(
        variant == ImButtonVariant.danger ? ImTokens.elevationSm : 0,
      ),
    );
  }

  WidgetStateProperty<Color>? _backgroundColor(ImColors colors) {
    switch (variant) {
      case ImButtonVariant.primary:
        return WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return colors.primary.withAlpha(97);
          }
          return colors.primary;
        });
      case ImButtonVariant.danger:
        return WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return colors.error.withAlpha(97);
          }
          return colors.error;
        });
      case ImButtonVariant.secondary:
        return WidgetStateProperty.all(Colors.transparent);
      case ImButtonVariant.ghost:
        return WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.hovered)) {
            return colors.primary.withAlpha(20);
          }
          return Colors.transparent;
        });
      case ImButtonVariant.text:
        return WidgetStateProperty.all(Colors.transparent);
    }
  }

  Color _foregroundColor(ImColors colors) {
    switch (variant) {
      case ImButtonVariant.primary:
      case ImButtonVariant.danger:
        return Colors.white;
      case ImButtonVariant.secondary:
      case ImButtonVariant.ghost:
      case ImButtonVariant.text:
        return colors.primary;
    }
  }

  Color _loadingColor(ImColors colors) {
    switch (variant) {
      case ImButtonVariant.primary:
      case ImButtonVariant.danger:
        return Colors.white;
      case ImButtonVariant.secondary:
      case ImButtonVariant.ghost:
      case ImButtonVariant.text:
        return colors.primary;
    }
  }

  WidgetStateProperty<BorderSide>? _borderSide(ImColors colors) {
    if (variant == ImButtonVariant.secondary) {
      return WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled)) {
          return BorderSide(color: colors.primary.withAlpha(97));
        }
        return BorderSide(color: colors.primary);
      });
    }
    return null;
  }

  double get _height {
    switch (size) {
      case ImButtonSize.sm:
        return 32;
      case ImButtonSize.md:
        return 40;
      case ImButtonSize.lg:
        return 48;
    }
  }

  double get _horizontalPadding {
    switch (size) {
      case ImButtonSize.sm:
        return ImTokens.space2;
      case ImButtonSize.md:
        return ImTokens.space4;
      case ImButtonSize.lg:
        return ImTokens.space6;
    }
  }

  double get _verticalPadding {
    switch (size) {
      case ImButtonSize.sm:
        return ImTokens.space1;
      case ImButtonSize.md:
        return ImTokens.space2;
      case ImButtonSize.lg:
        return ImTokens.space3;
    }
  }

  double get _fontSize {
    switch (size) {
      case ImButtonSize.sm:
        return ImTokens.textSm;
      case ImButtonSize.md:
        return ImTokens.textBase;
      case ImButtonSize.lg:
        return ImTokens.textLg;
    }
  }

  double get _iconSize {
    switch (size) {
      case ImButtonSize.sm:
        return 14;
      case ImButtonSize.md:
        return 16;
      case ImButtonSize.lg:
        return 20;
    }
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/packages/ui && flutter analyze lib/src/widgets/im_button.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/packages/ui/lib/src/widgets/im_button.dart
git commit -m "feat(ui): add ImButton component with 5 variants and 3 sizes"
```

---

### Task 4: ImTextField Component

**Files:**
- Create: `flutter/packages/ui/lib/src/widgets/im_text_field.dart`

- [ ] **Step 1: Create im_text_field.dart**

```dart
// flutter/packages/ui/lib/src/widgets/im_text_field.dart

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// A text field component with built-in error display and decoration.
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
    this.autofocus = false,
    this.textInputAction,
    this.onSubmitted,
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
  final bool autofocus;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          Text(
            label!,
            style: TextStyle(
              fontSize: ImTokens.textSm,
              fontWeight: FontWeight.w500,
              color: colors.textPrimary,
            ),
          ),
          SizedBox(height: ImTokens.space1),
        ],
        TextFormField(
          controller: controller,
          obscureText: obscure,
          onChanged: onChanged,
          maxLines: maxLines,
          enabled: enabled,
          autofocus: autofocus,
          textInputAction: textInputAction,
          onFieldSubmitted: onSubmitted,
          decoration: InputDecoration(
            hintText: hintText,
            errorText: errorText,
            prefixIcon: prefix,
            suffixIcon: suffix,
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/packages/ui && flutter analyze lib/src/widgets/im_text_field.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/packages/ui/lib/src/widgets/im_text_field.dart
git commit -m "feat(ui): add ImTextField component with label, error, prefix/suffix"
```

---

### Task 5: ImCard Component

**Files:**
- Create: `flutter/packages/ui/lib/src/widgets/im_card.dart`

- [ ] **Step 1: Create im_card.dart**

```dart
// flutter/packages/ui/lib/src/widgets/im_card.dart

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// A card container with optional elevation and tap handling.
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    final card = Container(
      margin: margin,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(ImTokens.radiusLg),
        border: Border.all(color: colors.border),
        boxShadow: elevated
            ? [
                BoxShadow(
                  color: Colors.black.withAlpha(13),
                  blurRadius: ImTokens.elevationLg,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: padding ?? EdgeInsets.all(ImTokens.space4),
        child: child,
      ),
    );

    if (onTap != null) {
      return MouseRegion(
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: onTap,
          child: card,
        ),
      );
    }

    return card;
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/packages/ui && flutter analyze lib/src/widgets/im_card.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/packages/ui/lib/src/widgets/im_card.dart
git commit -m "feat(ui): add ImCard component with elevation and tap handling"
```

---

### Task 6: Widget Tests — ImButton, ImTextField, ImCard

**Files:**
- Create: `flutter/packages/ui/test/widgets/im_button_test.dart`
- Create: `flutter/packages/ui/test/widgets/im_text_field_test.dart`
- Create: `flutter/packages/ui/test/widgets/im_card_test.dart`

- [ ] **Step 1: Create im_button_test.dart**

```dart
// flutter/packages/ui/test/widgets/im_button_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

Widget wrapInApp(Widget child) => MaterialApp(
      home: Scaffold(body: child),
    );

void main() {
  group('ImButton', () {
    testWidgets('renders primary variant with label', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(label: 'Submit'),
      ));
      expect(find.text('Submit'), findsOneWidget);
    });

    testWidgets('calls onPressed when tapped', (tester) async {
      var tapped = false;
      await tester.pumpWidget(wrapInApp(
        ImButton(label: 'Tap', onPressed: () => tapped = true),
      ));
      await tester.tap(find.text('Tap'));
      expect(tapped, isTrue);
    });

    testWidgets('shows loading spinner when loading', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(label: 'Save', loading: true),
      ));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Save'), findsNothing);
    });

    testWidgets('disabled when onPressed is null', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(label: 'Disabled'),
      ));
      final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('renders secondary variant as OutlinedButton', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(
          label: 'Cancel',
          variant: ImButtonVariant.secondary,
        ),
      ));
      expect(find.byType(OutlinedButton), findsOneWidget);
    });

    testWidgets('renders text variant as TextButton', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(
          label: 'Link',
          variant: ImButtonVariant.text,
        ),
      ));
      expect(find.byType(TextButton), findsOneWidget);
    });

    testWidgets('fullWidth stretches button', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(label: 'Full', fullWidth: true),
      ));
      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, double.infinity);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails (no test file yet at this point would be a compile error — verify with analyze)**

Run: `cd flutter/packages/ui && flutter analyze test/widgets/im_button_test.dart`
Expected: No errors (test file compiles)

- [ ] **Step 3: Create im_text_field_test.dart**

```dart
// flutter/packages/ui/test/widgets/im_text_field_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

Widget wrapInApp(Widget child) => MaterialApp(
      home: Scaffold(body: child),
    );

void main() {
  group('ImTextField', () {
    testWidgets('renders with hintText', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImTextField(hintText: 'Enter name'),
      ));
      expect(find.text('Enter name'), findsOneWidget);
    });

    testWidgets('renders with label', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImTextField(label: 'Username'),
      ));
      expect(find.text('Username'), findsOneWidget);
    });

    testWidgets('calls onChanged when text changes', (tester) async {
      String? changed;
      await tester.pumpWidget(wrapInApp(
        ImTextField(onChanged: (v) => changed = v),
      ));
      await tester.enterText(find.byType(TextFormField), 'hello');
      expect(changed, 'hello');
    });

    testWidgets('shows errorText', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImTextField(errorText: 'Required field'),
      ));
      expect(find.text('Required field'), findsOneWidget);
    });

    testWidgets('obscureText hides input', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImTextField(obscure: true),
      ));
      final field =
          tester.widget<TextFormField>(find.byType(TextFormField));
      expect(field.obscureText, isTrue);
    });
  });
}
```

- [ ] **Step 4: Create im_card_test.dart**

```dart
// flutter/packages/ui/test/widgets/im_card_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

Widget wrapInApp(Widget child) => MaterialApp(
      home: Scaffold(body: child),
    );

void main() {
  group('ImCard', () {
    testWidgets('renders child widget', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImCard(child: Text('Card content')),
      ));
      expect(find.text('Card content'), findsOneWidget);
    });

    testWidgets('calls onTap when tapped', (tester) async {
      var tapped = false;
      await tester.pumpWidget(wrapInApp(
        ImCard(
          onTap: () => tapped = true,
          child: const Text('Tap me'),
        ),
      ));
      await tester.tap(find.text('Tap me'));
      expect(tapped, isTrue);
    });

    testWidgets('does not have gesture detector when no onTap', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImCard(child: Text('Static')),
      ));
      expect(find.byType(GestureDetector), findsNothing);
    });
  });
}
```

- [ ] **Step 5: Update barrel file to export new widgets**

Open `flutter/packages/ui/lib/ui.dart` and add exports after existing ones:

```dart
library im_ui;

export 'src/theme/im_tokens.dart';
export 'src/theme/im_theme.dart';
export 'src/theme/app_theme.dart';
export 'src/widgets/im_button.dart';
export 'src/widgets/im_text_field.dart';
export 'src/widgets/im_card.dart';
export 'src/widgets/widgets.dart';
export 'src/layouts/layouts.dart';
```

- [ ] **Step 6: Run all tests**

Run: `cd flutter/packages/ui && flutter test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add flutter/packages/ui/test/ flutter/packages/ui/lib/ui.dart
git commit -m "feat(ui): add widget tests for ImButton, ImTextField, ImCard"
```

---

### Task 7: Remaining Components — ImEmpty, ImAvatar, ImBadge, ImDialog, ImNavItem

**Files:**
- Create: `flutter/packages/ui/lib/src/widgets/im_empty.dart`
- Create: `flutter/packages/ui/lib/src/widgets/im_avatar.dart`
- Create: `flutter/packages/ui/lib/src/widgets/im_badge.dart`
- Create: `flutter/packages/ui/lib/src/widgets/im_dialog.dart`
- Create: `flutter/packages/ui/lib/src/widgets/im_nav_item.dart`

- [ ] **Step 1: Create im_empty.dart**

```dart
// flutter/packages/ui/lib/src/widgets/im_empty.dart

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// Empty state placeholder with icon, title, and optional action.
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    return Center(
      child: Padding(
        padding: EdgeInsets.all(ImTokens.space8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null)
              Icon(icon, size: 64, color: colors.textDisabled),
            if (icon != null) SizedBox(height: ImTokens.space4),
            if (title != null)
              Text(
                title!,
                style: TextStyle(
                  fontSize: ImTokens.textLg,
                  fontWeight: FontWeight.w600,
                  color: colors.textPrimary,
                ),
              ),
            if (title != null) SizedBox(height: ImTokens.space2),
            if (subtitle != null)
              Text(
                subtitle!,
                style: TextStyle(
                  fontSize: ImTokens.textBase,
                  color: colors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
            if (action != null) ...[
              SizedBox(height: ImTokens.space4),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Create im_avatar.dart**

```dart
// flutter/packages/ui/lib/src/widgets/im_avatar.dart

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// Circular avatar with image or color-hash initials fallback.
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

  static const _palette = [
    Color(0xFFE91E63),
    Color(0xFF9C27B0),
    Color(0xFF3F51B5),
    Color(0xFF009688),
    Color(0xFFFF5722),
    Color(0xFF795548),
    Color(0xFF607D8B),
    Color(0xFF00BCD4),
  ];

  Color get _avatarColor => _palette[name.hashCode.abs() % _palette.length];

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    final avatar = SizedBox(
      width: size,
      height: size,
      child: CircleAvatar(
        radius: size / 2,
        backgroundColor: _avatarColor,
        backgroundImage: imageUrl != null ? NetworkImage(imageUrl!) : null,
        child: imageUrl == null
            ? Text(
                _initials,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: size * 0.4,
                  fontWeight: FontWeight.w600,
                ),
              )
            : null,
      ),
    );

    if (!showStatus) return avatar;

    final statusColor = isOnline ? colors.online : colors.offline;
    final statusSize = size * 0.25;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        avatar,
        Positioned(
          right: 0,
          bottom: 0,
          child: Container(
            width: statusSize,
            height: statusSize,
            decoration: BoxDecoration(
              color: statusColor,
              shape: BoxShape.circle,
              border: Border.all(
                color: colors.surface,
                width: 2,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 3: Create im_badge.dart**

```dart
// flutter/packages/ui/lib/src/widgets/im_badge.dart

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// Badge displaying a count or a dot indicator.
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

  @override
  Widget build(BuildContext context) {
    if (child == null && count <= 0) return const SizedBox.shrink();

    final displayText = count > maxCount ? '$maxCount+' : '$count';
    final showBadge = count > 0;

    if (child == null) {
      return Container(
        padding: EdgeInsets.symmetric(
          horizontal: ImTokens.space2,
          vertical: ImTokens.space0 + 2,
        ),
        decoration: BoxDecoration(
          color: ImComponentTokens.badgeBg,
          borderRadius: BorderRadius.circular(ImTokens.radiusFull),
        ),
        child: Text(
          displayText,
          style: TextStyle(
            color: ImComponentTokens.badgeText,
            fontSize: ImTokens.textXs,
            fontWeight: FontWeight.w600,
            height: 1.2,
          ),
        ),
      );
    }

    return Stack(
      clipBehavior: Clip.none,
      children: [
        child!,
        if (showBadge)
          Positioned(
            right: -6,
            top: -6,
            child: Container(
              padding: EdgeInsets.symmetric(
                horizontal: count > 9 ? ImTokens.space1 : 4,
                vertical: 1,
              ),
              decoration: BoxDecoration(
                color: ImComponentTokens.badgeBg,
                borderRadius: BorderRadius.circular(ImTokens.radiusFull),
              ),
              child: Text(
                displayText,
                style: TextStyle(
                  color: ImComponentTokens.badgeText,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
```

- [ ] **Step 4: Create im_dialog.dart**

```dart
// flutter/packages/ui/lib/src/widgets/im_dialog.dart

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// A dialog action configuration.
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

/// A dialog with title, content, and configurable action buttons.
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

  /// Convenience method to show the dialog and return when closed.
  static Future<void> show(
    BuildContext context, {
    String? title,
    required Widget content,
    required List<ImDialogAction> actions,
  }) {
    return showDialog(
      context: context,
      builder: (_) => ImDialog(
        title: title,
        content: content,
        actions: actions,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    return AlertDialog(
      title: title != null
          ? Text(
              title!,
              style: TextStyle(
                fontSize: ImTokens.textXl,
                fontWeight: FontWeight.w600,
                color: colors.textPrimary,
              ),
            )
          : null,
      content: content,
      actions: actions.map((action) {
        if (action.isDestructive) {
          return TextButton(
            onPressed: () {
              action.onPressed();
              Navigator.of(context).pop();
            },
            child: Text(
              action.label,
              style: TextStyle(color: colors.error),
            ),
          );
        }
        return FilledButton(
          onPressed: () {
            action.onPressed();
            Navigator.of(context).pop();
          },
          child: Text(action.label),
        );
      }).toList(),
    );
  }
}
```

- [ ] **Step 5: Create im_nav_item.dart**

```dart
// flutter/packages/ui/lib/src/widgets/im_nav_item.dart

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';
import 'im_badge.dart';

/// Navigation item with icon, label, optional badge, and selection state.
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

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    final iconColor = isSelected ? colors.primary : colors.textSecondary;
    final textColor = isSelected ? colors.primary : colors.textSecondary;
    final currentIcon = isSelected && selectedIcon != null
        ? selectedIcon!
        : icon;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(ImTokens.radiusMd),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: ImTokens.space3,
          vertical: ImTokens.space2,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ImBadge(
              count: badge ?? 0,
              child: Icon(currentIcon, color: iconColor, size: 24),
            ),
            SizedBox(height: ImTokens.space1),
            Text(
              label,
              style: TextStyle(
                fontSize: ImTokens.textXs,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                color: textColor,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 6: Update barrel file to export all new widgets**

Open `flutter/packages/ui/lib/ui.dart` and ensure all new widgets are exported:

```dart
library im_ui;

export 'src/theme/im_tokens.dart';
export 'src/theme/im_theme.dart';
export 'src/theme/app_theme.dart';
export 'src/widgets/im_button.dart';
export 'src/widgets/im_text_field.dart';
export 'src/widgets/im_card.dart';
export 'src/widgets/im_empty.dart';
export 'src/widgets/im_avatar.dart';
export 'src/widgets/im_badge.dart';
export 'src/widgets/im_dialog.dart';
export 'src/widgets/im_nav_item.dart';
export 'src/widgets/widgets.dart';
export 'src/layouts/layouts.dart';
```

- [ ] **Step 7: Verify compilation**

Run: `cd flutter/packages/ui && flutter analyze lib/`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add flutter/packages/ui/lib/src/widgets/im_empty.dart flutter/packages/ui/lib/src/widgets/im_avatar.dart flutter/packages/ui/lib/src/widgets/im_badge.dart flutter/packages/ui/lib/src/widgets/im_dialog.dart flutter/packages/ui/lib/src/widgets/im_nav_item.dart flutter/packages/ui/lib/ui.dart
git commit -m "feat(ui): add ImEmpty, ImAvatar, ImBadge, ImDialog, ImNavItem components"
```

---

### Task 8: Token & Theme Tests

**Files:**
- Create: `flutter/packages/ui/test/theme/im_tokens_test.dart`
- Create: `flutter/packages/ui/test/theme/im_theme_test.dart`

- [ ] **Step 1: Create im_tokens_test.dart**

```dart
// flutter/packages/ui/test/theme/im_tokens_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

void main() {
  group('ImTokens', () {
    test('spacing values are monotonically increasing', () {
      final spacings = [
        ImTokens.space0,
        ImTokens.space1,
        ImTokens.space2,
        ImTokens.space3,
        ImTokens.space4,
        ImTokens.space5,
        ImTokens.space6,
        ImTokens.space8,
        ImTokens.space10,
        ImTokens.space12,
      ];
      for (var i = 1; i < spacings.length; i++) {
        expect(spacings[i], greaterThan(spacings[i - 1]),
            reason: 'space[$i] should be > space[${i - 1}]');
      }
    });

    test('radius values are positive and reasonable', () {
      expect(ImTokens.radiusNone, 0);
      expect(ImTokens.radiusSm, greaterThan(0));
      expect(ImTokens.radiusMd, greaterThan(ImTokens.radiusSm));
      expect(ImTokens.radiusLg, greaterThan(ImTokens.radiusMd));
      expect(ImTokens.radiusXl, greaterThan(ImTokens.radiusLg));
      expect(ImTokens.radiusFull, greaterThan(ImTokens.radiusXl));
    });

    test('breakpoints are monotonically increasing', () {
      expect(ImTokens.breakpointMobile, lessThan(ImTokens.breakpointTablet));
      expect(ImTokens.breakpointTablet, lessThan(ImTokens.breakpointDesktop));
    });
  });

  group('ImColors', () {
    test('light and dark have different backgrounds', () {
      expect(ImColors.light.background, isNot(ImColors.dark.background));
    });

    test('semantic colors are defined in both modes', () {
      expect(ImColors.light.primary, isNotNull);
      expect(ImColors.dark.primary, isNotNull);
      expect(ImColors.light.error, isNotNull);
      expect(ImColors.dark.error, isNotNull);
    });
  });

  group('ImComponentTokens', () {
    test('button tokens reference valid colors', () {
      expect(ImComponentTokens.buttonPrimaryBg, isNotNull);
      expect(ImComponentTokens.buttonPrimaryText, isNotNull);
    });

    test('input tokens reference valid colors', () {
      expect(ImComponentTokens.inputBorder, isNotNull);
      expect(ImComponentTokens.inputBorderFocus, isNotNull);
    });
  });
}
```

- [ ] **Step 2: Create im_theme_test.dart**

```dart
// flutter/packages/ui/test/theme/im_theme_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

void main() {
  group('ImTheme', () {
    test('light theme has brightness light', () {
      final theme = ImTheme.light();
      expect(theme.brightness, Brightness.light);
    });

    test('dark theme has brightness dark', () {
      final theme = ImTheme.dark();
      expect(theme.brightness, Brightness.dark);
    });

    test('both themes have valid colorScheme', () {
      final light = ImTheme.light();
      final dark = ImTheme.dark();
      expect(light.colorScheme.primary, isNotNull);
      expect(dark.colorScheme.primary, isNotNull);
    });

    test('light theme has scaffoldBackgroundColor', () {
      final theme = ImTheme.light();
      expect(theme.scaffoldBackgroundColor, isNotNull);
    });

    test('dark theme has scaffoldBackgroundColor', () {
      final theme = ImTheme.dark();
      expect(theme.scaffoldBackgroundColor, isNotNull);
    });

    test('textTheme is not null', () {
      expect(ImTheme.light().textTheme, isNotNull);
      expect(ImTheme.dark().textTheme, isNotNull);
    });
  });
}
```

- [ ] **Step 3: Run all tests**

Run: `cd flutter/packages/ui && flutter test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add flutter/packages/ui/test/theme/
git commit -m "test(ui): add token and theme validation tests"
```

---

### Task 9: Web App — Consume ImTheme

**Files:**
- Modify: `flutter/apps/web/lib/core/theme/app_theme.dart`
- Modify: `flutter/apps/web/lib/app.dart`

- [ ] **Step 1: Rewrite web app's AppTheme to delegate to ImTheme**

Replace the entire content of `flutter/apps/web/lib/core/theme/app_theme.dart`:

```dart
// flutter/apps/web/lib/core/theme/app_theme.dart

import 'package:flutter/material.dart';
import 'package:im_ui/ui.dart';

import 'glass_theme.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme => ImTheme.light().copyWith(
        extensions: [GlassTheme.light],
      );

  static ThemeData get darkTheme => ImTheme.dark().copyWith(
        extensions: [GlassTheme.dark],
      );
}
```

- [ ] **Step 2: Wire themeModeProvider into app.dart**

Open `flutter/apps/web/lib/app.dart` and modify the build method. Change the `MaterialApp.router` to use `themeMode`:

The current `build` method in `_AppState` (lines ~27-38) returns:
```dart
MaterialApp.router(
  title: 'IM',
  theme: AppTheme.lightTheme,
  darkTheme: AppTheme.darkTheme,
  // ...
)
```

Change it to:
```dart
MaterialApp.router(
  title: 'IM',
  theme: AppTheme.lightTheme,
  darkTheme: AppTheme.darkTheme,
  themeMode: ref.watch(themeModeProvider),
  // ... rest unchanged
)
```

Also add the import for `themeModeProvider` if not already imported (it's in `core/di/providers.dart` which is already imported).

- [ ] **Step 3: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze lib/app.dart lib/core/theme/app_theme.dart`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/core/theme/app_theme.dart flutter/apps/web/lib/app.dart
git commit -m "feat(web): migrate AppTheme to consume ImTheme, wire themeModeProvider"
```

---

### Task 10: Component Gallery Page

**Files:**
- Create: `flutter/apps/web/lib/features/debug/presentation/component_gallery_page.dart`
- Modify: `flutter/apps/web/lib/core/router/app_router.dart` (add debug route)

- [ ] **Step 1: Create component_gallery_page.dart**

```dart
// flutter/apps/web/lib/features/debug/presentation/component_gallery_page.dart

import 'package:flutter/material.dart';
import 'package:im_ui/ui.dart';

class ComponentGalleryPage extends StatefulWidget {
  const ComponentGalleryPage({super.key});

  @override
  State<ComponentGalleryPage> createState() => _ComponentGalleryPageState();
}

class _ComponentGalleryPageState extends State<ComponentGalleryPage> {
  int _selectedIndex = 0;

  static const _sections = [
    'Button',
    'TextField',
    'Card',
    'Empty',
    'Avatar',
    'Badge',
    'Dialog',
    'NavItem',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Component Gallery')),
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _selectedIndex,
            onDestinationSelected: (i) => setState(() => _selectedIndex = i),
            labelType: NavigationRailLabelType.all,
            destinations: _sections
                .map((s) => NavigationRailDestination(
                      icon: const Icon(Icons.widgets),
                      label: Text(s),
                    ))
                .toList(),
          ),
          const VerticalDivider(width: 1),
          Expanded(child: _buildContent()),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: _sectionWidgets[_selectedIndex],
    );
  }

  List<Widget> get _sectionWidgets => [
        _buttonSection(),
        _textFieldSection(),
        _cardSection(),
        _emptySection(),
        _avatarSection(),
        _badgeSection(),
        _dialogSection(),
        _navItemSection(),
      ];

  Widget _buttonSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImButton', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const Text('Variants'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: ImButtonVariant.values.map((v) {
            return ImButton(variant: v, label: v.name);
          }).toList(),
        ),
        const SizedBox(height: 24),
        const Text('Sizes'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: ImButtonSize.values.map((s) {
            return ImButton(size: s, label: s.name);
          }).toList(),
        ),
        const SizedBox(height: 24),
        const Text('Loading'),
        const SizedBox(height: 8),
        const ImButton(label: 'Saving...', loading: true),
        const SizedBox(height: 24),
        const Text('Disabled'),
        const SizedBox(height: 8),
        const ImButton(label: 'Disabled'),
        const SizedBox(height: 24),
        const Text('Full Width'),
        const SizedBox(height: 8),
        const ImButton(label: 'Full Width', fullWidth: true),
      ],
    );
  }

  Widget _textFieldSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImTextField', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const ImTextField(label: 'Username', hintText: 'Enter username'),
        const SizedBox(height: 16),
        const ImTextField(
          label: 'Password',
          hintText: 'Enter password',
          obscure: true,
        ),
        const SizedBox(height: 16),
        const ImTextField(
          label: 'Email',
          hintText: 'user@example.com',
          prefix: Icon(Icons.email),
        ),
        const SizedBox(height: 16),
        const ImTextField(
          label: 'With Error',
          hintText: 'Invalid input',
          errorText: 'This field is required',
        ),
        const SizedBox(height: 16),
        const ImTextField(label: 'Disabled', hintText: 'Cannot edit', enabled: false),
      ],
    );
  }

  Widget _cardSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImCard', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const ImCard(child: Text('Default Card')),
        const SizedBox(height: 16),
        const ImCard(elevated: true, child: Text('Elevated Card')),
        const SizedBox(height: 16),
        ImCard(
          onTap: () => ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Card tapped!')),
          ),
          child: const Text('Tappable Card (click me)'),
        ),
      ],
    );
  }

  Widget _emptySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImEmpty', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const ImEmpty(icon: Icons.inbox, title: 'No messages'),
        const SizedBox(height: 16),
        const ImEmpty(
          icon: Icons.search_off,
          title: 'No results',
          subtitle: 'Try a different search term',
        ),
        const SizedBox(height: 16),
        ImEmpty(
          icon: Icons.folder_open,
          title: 'No files',
          action: ImButton(label: 'Upload', onPressed: () {}),
        ),
      ],
    );
  }

  Widget _avatarSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImAvatar', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            ImAvatar(name: 'Alice'),
            ImAvatar(name: 'Bob', size: 56),
            ImAvatar(name: 'Charlie', size: 72),
          ],
        ),
        const SizedBox(height: 24),
        const Text('With Status'),
        const SizedBox(height: 8),
        const Wrap(
          spacing: 16,
          children: [
            ImAvatar(name: 'Online User', showStatus: true, isOnline: true),
            ImAvatar(name: 'Offline User', showStatus: true, isOnline: false),
          ],
        ),
      ],
    );
  }

  Widget _badgeSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImBadge', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        const Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            ImBadge(count: 5),
            ImBadge(count: 150),
            ImBadge(count: 0),
            ImBadge(
              count: 3,
              child: Icon(Icons.mail, size: 32),
            ),
          ],
        ),
      ],
    );
  }

  Widget _dialogSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImDialog', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          children: [
            ImButton(
              label: 'Confirm Dialog',
              onPressed: () => ImDialog.show(
                context,
                title: 'Confirm Action',
                content: const Text('Are you sure you want to proceed?'),
                actions: [
                  ImDialogAction(label: 'Cancel', onPressed: () {}),
                  ImDialogAction(label: 'Confirm', onPressed: () {}),
                ],
              ),
            ),
            ImButton(
              label: 'Destructive Dialog',
              variant: ImButtonVariant.danger,
              onPressed: () => ImDialog.show(
                context,
                title: 'Delete Item',
                content: const Text('This action cannot be undone.'),
                actions: [
                  ImDialogAction(label: 'Cancel', onPressed: () {}),
                  ImDialogAction(
                    label: 'Delete',
                    isDestructive: true,
                    onPressed: () {},
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _navItemSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('ImNavItem', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        Row(
          children: [
            ImNavItem(
              icon: Icons.chat,
              label: 'Chat',
              isSelected: true,
              onTap: () {},
            ),
            ImNavItem(
              icon: Icons.people,
              label: 'Contacts',
              badge: 5,
              onTap: () {},
            ),
            ImNavItem(
              icon: Icons.settings,
              label: 'Settings',
              onTap: () {},
            ),
          ],
        ),
      ],
    );
  }
}
```

- [ ] **Step 2: Add debug route to app_router.dart**

Open `flutter/apps/web/lib/core/router/app_router.dart`.

Add import at the top (after existing imports):
```dart
import 'package:im_web/features/debug/presentation/component_gallery_page.dart';
```

Add the route inside the `GoRoute` list, after the login/register routes (around line 76):
```dart
      GoRoute(
        path: '/debug/gallery',
        builder: (context, state) => const ComponentGalleryPage(),
      ),
```

- [ ] **Step 3: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze lib/features/debug/ lib/core/router/app_router.dart`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/features/debug/presentation/component_gallery_page.dart flutter/apps/web/lib/core/router/app_router.dart
git commit -m "feat(web): add debug component gallery page at /debug/gallery"
```

---

### Task 11: LoginPage Migration

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/login_page.dart`
- Delete: `flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart`
- Delete: `flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart`
- Delete: `flutter/apps/web/lib/features/auth/presentation/widgets/form_field.dart`

- [ ] **Step 1: Rewrite login_page.dart to use im_ui components**

Replace the entire content of `flutter/apps/web/lib/features/auth/presentation/login_page.dart`:

```dart
// flutter/apps/web/lib/features/auth/presentation/login_page.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/ui.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/utils/responsive.dart';
import 'package:im_web/core/utils/validators.dart';
import 'package:im_web/features/auth/presentation/widgets/brand_showcase.dart';
import 'package:im_web/features/auth/presentation/widgets/decorative_background.dart';

import 'auth_provider.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _rememberMe = false;
  bool _obscurePassword = true;

  late AnimationController _animController;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeAnim = CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOut,
    );
    _slideAnim = Tween<Offset>(
      begin: const Offset(0, 0.1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOut,
    ));
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = Responsive.isDesktop(context);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF667eea),
              Color(0xFF764ba2),
            ],
          ),
        ),
        child: Stack(
          children: [
            const DecorativeBackground(),
            FadeTransition(
              opacity: _fadeAnim,
              child: SlideTransition(
                position: _slideAnim,
                child: isDesktop ? _buildDesktopLayout() : _buildMobileLayout(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMobileLayout() {
    return Center(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(ImTokens.space6),
        child: _buildLoginCard(),
      ),
    );
  }

  Widget _buildDesktopLayout() {
    return Row(
      children: [
        const Expanded(child: BrandShowcase()),
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(ImTokens.space6),
              child: _buildLoginCard(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLoginCard() {
    return ImCard(
      elevated: true,
      padding: EdgeInsets.all(ImTokens.space8),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '登录',
              style: TextStyle(
                fontSize: ImTokens.text2xl,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: ImTokens.space2),
            Text(
              '欢迎回来，请登录您的账号',
              style: TextStyle(
                fontSize: ImTokens.textBase,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            SizedBox(height: ImTokens.space6),
            _buildForm(),
          ],
        ),
      ),
    );
  }

  Widget _buildForm() {
    final authState = ref.watch(authStateProvider);

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ImTextField(
            controller: _usernameController,
            label: '用户名',
            hintText: '请输入用户名',
            prefix: const Icon(Icons.person_outline),
            validator: Validators.required,
          ),
          SizedBox(height: ImTokens.space4),
          ImTextField(
            controller: _passwordController,
            label: '密码',
            hintText: '请输入密码',
            obscure: _obscurePassword,
            prefix: const Icon(Icons.lock_outline),
            suffix: IconButton(
              icon: Icon(
                _obscurePassword ? Icons.visibility_off : Icons.visibility,
              ),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
            validator: Validators.required,
          ),
          if (authState.error != null) ...[
            SizedBox(height: ImTokens.space3),
            Text(
              authState.error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          SizedBox(height: ImTokens.space3),
          Row(
            children: [
              Checkbox(
                value: _rememberMe,
                onChanged: (v) => setState(() => _rememberMe = v ?? false),
                activeColor: ImColors.light.primary,
              ),
              const Text('记住我'),
            ],
          ),
          SizedBox(height: ImTokens.space4),
          ImButton(
            label: '登录',
            fullWidth: true,
            loading: authState.isLoading,
            onPressed: _login,
          ),
          SizedBox(height: ImTokens.space4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('还没有账号？'),
              ImButton(
                variant: ImButtonVariant.text,
                label: '立即注册',
                onPressed: () => context.go('/register'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    await ref.read(authStateProvider.notifier).login(
          username: _usernameController.text,
          password: _passwordController.text,
        );
  }
}
```

- [ ] **Step 2: Delete old widget files**

```bash
rm flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart
rm flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart
rm flutter/apps/web/lib/features/auth/presentation/widgets/form_field.dart
```

- [ ] **Step 3: Verify no remaining imports of deleted files**

Run: `grep -r "auth_card\|gradient_button\|form_field" flutter/apps/web/lib/`
Expected: No matches (except possibly register_page.dart if it also uses them — if so, that page is out of scope for now, leave a TODO comment)

- [ ] **Step 4: Verify compilation**

Run: `cd flutter/packages/ui && flutter analyze lib/`
Run: `cd flutter/apps/web && flutter analyze lib/features/auth/`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/features/auth/presentation/login_page.dart
git rm flutter/apps/web/lib/features/auth/presentation/widgets/auth_card.dart flutter/apps/web/lib/features/auth/presentation/widgets/gradient_button.dart flutter/apps/web/lib/features/auth/presentation/widgets/form_field.dart
git commit -m "feat(web): migrate LoginPage to use im_ui components, remove AuthCard/GradientButton/AuthFormField"
```

---

### Task 12: Deprecate Old Components

**Files:**
- Modify: `flutter/packages/ui/lib/src/widgets/widgets.dart` (add @Deprecated annotations)

- [ ] **Step 1: Add @Deprecated annotations to old widgets**

Open `flutter/packages/ui/lib/src/widgets/widgets.dart` and add `@Deprecated` before each old widget class:

Before `class UserAvatar` (line 4):
```dart
@Deprecated('Use ImAvatar instead')
```

Before `class UnreadBadge` (line 84):
```dart
@Deprecated('Use ImBadge instead')
```

Before `class EmptyState` (line 158):
```dart
@Deprecated('Use ImEmpty instead')
```

Before `class SearchInput` (line 215):
```dart
@Deprecated('Use ImTextField with prefix icon instead')
```

Before `class ConfirmDialog` (line 249):
```dart
@Deprecated('Use ImDialog instead')
```

Note: `LoadingIndicator` and `TimeFormatter` have no ImXxx replacements, so they stay without deprecation.

- [ ] **Step 2: Verify compilation (deprecation warnings are expected)**

Run: `cd flutter/packages/ui && flutter analyze lib/src/widgets/widgets.dart`
Expected: Deprecation warnings only, no errors

- [ ] **Step 3: Commit**

```bash
git add flutter/packages/ui/lib/src/widgets/widgets.dart
git commit -m "chore(ui): deprecate old widgets (UserAvatar, UnreadBadge, EmptyState, SearchInput, ConfirmDialog)"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run all im_ui tests**

Run: `cd flutter/packages/ui && flutter test`
Expected: All tests pass

- [ ] **Step 2: Run im_ui analysis**

Run: `cd flutter/packages/ui && flutter analyze`
Expected: Only deprecation warnings, no errors

- [ ] **Step 3: Run web app analysis**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 4: Verify gallery page loads (manual or integration test)**

Run: `cd flutter/apps/web && flutter run -d chrome --dart-define=kDebugMode=true`
Navigate to `/debug/gallery` — all components should render.

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore(ui): final cleanup and verification for IM UI design system"
```
