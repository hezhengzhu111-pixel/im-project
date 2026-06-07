import 'package:flutter/material.dart';

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

  // ── Layout Dimensions ──
  static const double layoutChatSidebarWidth = 320;
  static const double layoutSettingsAsideWidth = 340;
  static const double layoutSectionGap = 12;
  static const double layoutPanelPadding = 16;
  static const double layoutItemGap = 8;

  // ── Breakpoints ──
  static const double breakpointMobile = 600;
  static const double breakpointTablet = 900;
  static const double breakpointDesktop = 1200;

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

  // ── Brand Colors ──

  /// 核心品牌紫
  static const Color brandPrimary = Color(0xFF764BA2);

  /// 品牌紫色 (别名，保持向后兼容)
  static const Color brandPurple = brandPrimary;

  /// 极浅灰紫色，用于所有内部内容页底色
  static const Color pageBackground = Color(0xFFF7F8FA);

  /// 纯白，用于悬浮卡片面板
  static const Color surfaceWhite = Colors.white;

  // ── Brand Gradients ──

  /// 交互组件双色渐变 (用于主按钮、操作类组件)
  static const LinearGradient brandActionGradient = LinearGradient(
    colors: [Color(0xFF6B48FF), Color(0xFF00E5FF)],
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
  );

  /// 外层大背景四色渐变 (仅用于最外层页面背景)
  static const LinearGradient brandBackgroundGradient = LinearGradient(
    colors: [
      Color(0xFF667EEA),
      Color(0xFF764BA2),
      Color(0xFF23A6D5),
      Color(0xFF23D5AB)
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// 品牌四色渐变 (向后兼容，请优先使用 [brandActionGradient] 或 [brandBackgroundGradient])
  static const LinearGradient brandGradient = brandBackgroundGradient;

  static const List<Color> _brandGradientColors = [
    Color(0xFF667EEA),
    Color(0xFF764BA2),
    Color(0xFF23A6D5),
    Color(0xFF23D5AB),
  ];

  /// 卡片微弱阴影
  static const BoxShadow cardShadow = BoxShadow(
    color: Color(0x08000000),
    blurRadius: 20,
    offset: Offset(0, 4),
  );

  /// 导航栏右侧阴影 (区分内容区)
  static const BoxShadow navRightShadow = BoxShadow(
    color: Color(0x08000000),
    blurRadius: 15,
    offset: Offset(5, 0),
  );

  /// 导航胶囊发光阴影
  static const BoxShadow capsuleGlowShadow = BoxShadow(
    color: Color(0x66764BA2),
    blurRadius: 15,
    spreadRadius: 0,
    offset: Offset(0, 4),
  );
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
    required this.brandGradient,
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
  final List<Color> brandGradient;

  static const light = ImColors._(
    primary: ImTokens.brandPurple,
    secondary: Color(0xFF4CAF50),
    error: Color(0xFFF44336),
    warning: Color(0xFFFF9800),
    success: Color(0xFF4CAF50),
    info: ImTokens.brandPurple,
    background: Color(0xFFF7F8FA),
    surface: Color(0xFFFFFFFF),
    surfaceVariant: Color(0xFFF5F5F5),
    textPrimary: Color(0xFF212121),
    textSecondary: Color(0xFF757575),
    textDisabled: Color(0xFFBDBDBD),
    border: Color(0xFFE0E0E0),
    borderFocus: ImTokens.brandPurple,
    borderError: Color(0xFFF44336),
    overlay: Color(0x54000000),
    ownMessageBubble: Color(0xFFDCF8C6),
    otherMessageBubble: Color(0xFFFFFFFF),
    systemMessageBubble: Color(0xFFE1F5FE),
    online: Color(0xFF4CAF50),
    offline: Color(0xFF9E9E9E),
    busy: Color(0xFFF44336),
    brandGradient: ImTokens._brandGradientColors,
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
    brandGradient: ImTokens._brandGradientColors,
  );
}

/// Component-level token values that reference semantic colors.
class ImComponentTokens {
  // Intentionally using raw values here instead of ImColors references,
  // as these specific backgrounds need to be white/light grey regardless
  // of theme changes to maintain the "floating card" visual effect.
  ImComponentTokens._();

  // ── Button ──
  static final Color buttonPrimaryBg = ImColors.light.primary;
  static final Color buttonPrimaryText = const Color(0xFFFFFFFF);
  static final Color buttonPrimaryDisabledBg =
      const Color(0x61764BA2); // brand purple @ 38% opacity
  static final Color buttonPrimaryDisabledText = const Color(0x61FFFFFF);
  static final Color buttonSecondaryBg = const Color(0x00000000);
  static final Color buttonSecondaryText = ImColors.light.primary;
  static final Color buttonSecondaryBorder = ImColors.light.primary;
  static final Color buttonDangerBg = ImColors.light.error;
  static final Color buttonDangerText = const Color(0xFFFFFFFF);

  // ── Input ──
  static final Color inputBg = const Color(0xFFF5F5F5);
  static final Color inputBorder = Colors.transparent;
  static final Color inputBorderFocus = ImColors.light.primary;
  static final Color inputBorderError = ImColors.light.borderError;
  static final Color inputText = ImColors.light.textPrimary;
  static final Color inputPlaceholder = ImColors.light.textSecondary;

  // ── Card ──
  static final Color cardBg = Colors.white;
  static final Color cardBorder = Colors.transparent;

  // ── Badge ──
  static final Color badgeBg = ImColors.light.error;
  static final Color badgeText = const Color(0xFFFFFFFF);
}
