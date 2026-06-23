import 'dart:ui';
import 'package:flutter/material.dart';

import 'im_tokens.dart';

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

  final Color cardBackground;
  final Color cardBorder;
  final List<BoxShadow> softShadow;
  final double pageRadius;
  final double controlRadius;
  final LinearGradient accentGradient;
  final Color segmentedBackground;
  final Color segmentedActiveBackground;
  final Color dividerColor;
  final Color navHoverBackground;

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

  static final light = GlassTheme(
    cardBackground: const Color(0xCCFFFFFF),
    cardBorder: const Color(0x4DFFFFFF),
    softShadow: [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.03),
        blurRadius: 0,
        offset: Offset.zero,
      ),
    ],
    pageRadius: 4,
    controlRadius: 4,
    accentGradient: const LinearGradient(
      colors: [
        ImTokens.wechatGreen,
        ImTokens.wechatGreenPressed,
      ],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    segmentedBackground: const Color(0xFFF2F2F2),
    segmentedActiveBackground: ImTokens.wechatGreen,
    dividerColor: ImTokens.wechatDivider,
    navHoverBackground: const Color(0xFFE9E9E9),
    blurIntensity: 0,
    gradientColors: const [
      ImTokens.pageBackground,
      Color(0xFFF5F5F5),
    ],
    neumorphicShadow: const [],
    animationDuration: const Duration(milliseconds: 200),
    navBackground: Colors.white,
    inputBackground: const Color(0xFFFFFFFF),
  );

  static final dark = GlassTheme(
    cardBackground: const Color(0xFF1F1F1F),
    cardBorder: const Color(0xFF343434),
    softShadow: const [],
    pageRadius: 4,
    controlRadius: 4,
    accentGradient: const LinearGradient(
      colors: [ImTokens.wechatGreen, ImTokens.wechatGreenPressed],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    segmentedBackground: const Color(0xFF2A2A2A),
    segmentedActiveBackground: ImTokens.wechatGreen,
    dividerColor: const Color(0xFF343434),
    navHoverBackground: const Color(0xFF2A2A2A),
    blurIntensity: 0,
    gradientColors: const [
      Color(0xFF111111),
      Color(0xFF1F1F1F),
    ],
    neumorphicShadow: const [],
    animationDuration: const Duration(milliseconds: 200),
    navBackground: const Color(0xE61E1E1E),
    inputBackground: const Color(0xB31E1E1E),
  );

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
      segmentedActiveBackground:
          segmentedActiveBackground ?? this.segmentedActiveBackground,
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

  static List<Color> _lerpColorList(List<Color> a, List<Color> b, double t) {
    final len = a.length < b.length ? a.length : b.length;
    return List.generate(len, (i) => Color.lerp(a[i], b[i], t)!);
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
      accentGradient:
          LinearGradient.lerp(accentGradient, other.accentGradient, t)!,
      segmentedBackground:
          Color.lerp(segmentedBackground, other.segmentedBackground, t)!,
      segmentedActiveBackground: Color.lerp(
          segmentedActiveBackground, other.segmentedActiveBackground, t)!,
      dividerColor: Color.lerp(dividerColor, other.dividerColor, t)!,
      navHoverBackground:
          Color.lerp(navHoverBackground, other.navHoverBackground, t)!,
      blurIntensity: lerpDouble(blurIntensity, other.blurIntensity, t)!,
      gradientColors: _lerpColorList(gradientColors, other.gradientColors, t),
      neumorphicShadow:
          BoxShadow.lerpList(neumorphicShadow, other.neumorphicShadow, t) ?? [],
      animationDuration: t < 0.5 ? animationDuration : other.animationDuration,
      navBackground: Color.lerp(navBackground, other.navBackground, t)!,
      inputBackground: Color.lerp(inputBackground, other.inputBackground, t)!,
    );
  }
}
