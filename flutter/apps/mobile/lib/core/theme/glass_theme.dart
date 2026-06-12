import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:im_ui/im_ui.dart';

/// Glass morphism theme extension for the mobile app.
///
/// Provides consistent visual styling for cards, gradients, and shadows
/// across light and dark modes.
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
  final double blurIntensity;
  final List<Color> gradientColors;
  final List<BoxShadow> neumorphicShadow;
  final Duration animationDuration;
  final Color navBackground;
  final Color inputBackground;

  static final light = GlassTheme(
    cardBackground: const Color(0xCCFFFFFF),
    cardBorder: const Color(0x4DFFFFFF),
    softShadow: [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.03),
        blurRadius: 20,
        offset: const Offset(0, 4),
      ),
    ],
    pageRadius: 16,
    controlRadius: 10,
    accentGradient: const LinearGradient(
      colors: [
        Color(0xFF667eea),
        Color(0xFF764BA2),
        Color(0xFF23a6d5),
        Color(0xFF23d5ab),
      ],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    segmentedBackground: const Color(0x6BFFFFFF),
    segmentedActiveBackground: const Color(0xFF764BA2),
    dividerColor: const Color(0x1A000000),
    navHoverBackground: const Color(0x0A000000),
    blurIntensity: 12,
    gradientColors: const [
      Color(0xFF667eea),
      Color(0xFF764ba2),
      Color(0xFF23a6d5),
      Color(0xFF23d5ab),
    ],
    neumorphicShadow: ImTokens.neumorphicRaised,
    animationDuration: const Duration(milliseconds: 200),
    navBackground: Colors.white,
    inputBackground: const Color(0xFFF5F5F5),
  );

  static final dark = GlassTheme(
    cardBackground: const Color(0xCC1E1E1E),
    cardBorder: const Color(0x33FFFFFF),
    softShadow: const [
      BoxShadow(
        color: Color(0x33000000),
        blurRadius: 24,
        offset: Offset(0, 8),
      ),
      BoxShadow(
        color: Color(0x1A000000),
        blurRadius: 8,
        offset: Offset(0, 2),
      ),
    ],
    pageRadius: 16,
    controlRadius: 10,
    accentGradient: const LinearGradient(
      colors: [Color(0xFF065F46), Color(0xFF1E3A5F)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    segmentedBackground: const Color(0x33FFFFFF),
    segmentedActiveBackground: const Color(0xFF16A34A),
    dividerColor: const Color(0x1AFFFFFF),
    navHoverBackground: const Color(0x0DFFFFFF),
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
        segmentedActiveBackground,
        other.segmentedActiveBackground,
        t,
      )!,
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
