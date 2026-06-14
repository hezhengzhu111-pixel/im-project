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
  static const Color brandPrimary = Color(0xFF07C160);

  /// 品牌紫色 (别名，保持向后兼容)
  static const Color brandPurple = brandPrimary;

  /// 极浅灰紫色，用于所有内部内容页底色
  static const Color pageBackground = Color(0xFFEDEDED);

  /// 纯白，用于悬浮卡片面板
  static const Color surfaceWhite = Colors.white;
  static const Color wechatGreen = Color(0xFF07C160);
  static const Color wechatGreenPressed = Color(0xFF06AD56);
  static const Color wechatOwnBubble = Color(0xFF95EC69);
  static const Color wechatOtherBubble = Color(0xFFFFFFFF);
  static const Color wechatDivider = Color(0xFFE5E5E5);
  static const Color wechatUnread = Color(0xFFFA5151);
  static const Color wechatSidebar = Color(0xFF2E2E2E);
  static const Color wechatSidebarSelected = Color(0xFF07C160);
  static const Color wechatSidebarHover = Color(0xFF3A3A3A);
  static const Color wechatPageBg = Color(0xFFEDEDED);
  static const Color wechatAppBg = Color(0xFFF5F5F5);
  static const Color wechatPanelBg = Color(0xFFFFFFFF);
  static const Color wechatSearchBg = Color(0xFFEDEDED);
  static const Color wechatInputBg = Color(0xFFF5F5F5);
  static const Color wechatTextPrimary = Color(0xFF111111);
  static const Color wechatTextSecondary = Color(0xFF999999);
  static const Color wechatTextTertiary = Color(0xFFB2B2B2);
  static const Color wechatHoverBg = Color(0xFFE9E9E9);
  static const Color wechatSelectedBg = Color(0xFFD8D8D8);
  static const Color wechatIcon = Color(0xFF666666);
  static const Color wechatAvatarBg = Color(0xFFD9D9D9);

  // ── Brand Gradients ──

  /// 交互组件双色渐变 (用于主按钮、操作类组件)
  static const LinearGradient brandActionGradient = LinearGradient(
    colors: [wechatGreen, wechatGreenPressed],
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
  );

  /// 外层大背景四色渐变 (仅用于最外层页面背景)
  static const LinearGradient brandBackgroundGradient = LinearGradient(
    colors: [
      pageBackground,
      Color(0xFFF5F5F5),
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// 品牌四色渐变 (向后兼容，请优先使用 [brandActionGradient] 或 [brandBackgroundGradient])
  static const LinearGradient brandGradient = brandBackgroundGradient;

  static const List<Color> _brandGradientColors = [
    pageBackground,
    Color(0xFFF5F5F5),
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
    color: Color(0x6607C160),
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
    primary: ImTokens.wechatGreen,
    secondary: ImTokens.wechatGreen,
    error: Color(0xFFF44336),
    warning: Color(0xFFFF9800),
    success: Color(0xFF4CAF50),
    info: ImTokens.wechatGreen,
    background: ImTokens.wechatPageBg,
    surface: ImTokens.wechatPanelBg,
    surfaceVariant: ImTokens.wechatAppBg,
    textPrimary: ImTokens.wechatTextPrimary,
    textSecondary: ImTokens.wechatTextSecondary,
    textDisabled: ImTokens.wechatTextTertiary,
    border: ImTokens.wechatDivider,
    borderFocus: ImTokens.wechatGreen,
    borderError: Color(0xFFF44336),
    overlay: Color(0x54000000),
    ownMessageBubble: ImTokens.wechatOwnBubble,
    otherMessageBubble: Color(0xFFFFFFFF),
    systemMessageBubble: Color(0xFFE9E9E9),
    online: ImTokens.wechatGreen,
    offline: Color(0xFF9E9E9E),
    busy: Color(0xFFF44336),
    brandGradient: ImTokens._brandGradientColors,
  );

  static const dark = ImColors._(
    primary: Color(0xFF07C160),
    secondary: Color(0xFF07C160),
    error: Color(0xFFEF5350),
    warning: Color(0xFFFFB74D),
    success: Color(0xFF66BB6A),
    info: Color(0xFF64B5F6),
    background: Color(0xFF111111),
    surface: Color(0xFF1F1F1F),
    surfaceVariant: Color(0xFF2A2A2A),
    textPrimary: Color(0xFFEDEDED),
    textSecondary: Color(0xFFA6A6A6),
    textDisabled: Color(0xFF616161),
    border: Color(0xFF424242),
    borderFocus: Color(0xFF07C160),
    borderError: Color(0xFFEF5350),
    overlay: Color(0x80000000),
    ownMessageBubble: Color(0xFF1F8F45),
    otherMessageBubble: Color(0xFF2A2A2A),
    systemMessageBubble: Color(0xFF252525),
    online: Color(0xFF07C160),
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
      const Color(0x6107C160); // brand green @ 38% opacity
  static final Color buttonPrimaryDisabledText = const Color(0x61FFFFFF);
  static final Color buttonSecondaryBg = const Color(0x00000000);
  static final Color buttonSecondaryText = ImColors.light.primary;
  static final Color buttonSecondaryBorder = ImColors.light.primary;
  static final Color buttonDangerBg = ImColors.light.error;
  static final Color buttonDangerText = const Color(0xFFFFFFFF);

  // ── Input ──
  static final Color inputBg = ImTokens.wechatInputBg;
  static final Color inputBorder = Colors.transparent;
  static final Color inputBorderFocus = ImColors.light.primary;
  static final Color inputBorderError = ImColors.light.borderError;
  static final Color inputText = ImColors.light.textPrimary;
  static final Color inputPlaceholder = ImColors.light.textSecondary;

  // ── Card ──
  static final Color cardBg = Colors.white;
  static final Color cardBorder = ImTokens.wechatDivider;

  // ── Badge ──
  static final Color badgeBg = ImColors.light.error;
  static final Color badgeText = const Color(0xFFFFFFFF);
}
