import 'dart:ui';
import 'package:flutter/material.dart';

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

  static const _lightShadow = [
    BoxShadow(
      color: Color(0x0D000000),
      blurRadius: 24,
      offset: Offset(0, 8),
    ),
    BoxShadow(
      color: Color(0x05000000),
      blurRadius: 8,
      offset: Offset(0, 2),
    ),
  ];

  static const _darkShadow = [
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
  ];

  static final light = GlassTheme(
    cardBackground: const Color(0xCCFFFFFF),
    cardBorder: const Color(0x4DFFFFFF),
    softShadow: _lightShadow,
    pageRadius: 16,
    controlRadius: 10,
    accentGradient: const LinearGradient(
      colors: [Color(0xFFA7F3D0), Color(0xFFBAE6FD)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    segmentedBackground: const Color(0x6BFFFFFF),
    segmentedActiveBackground: const Color(0xFF22C55E),
    dividerColor: const Color(0x1A000000),
    navHoverBackground: const Color(0x0A000000),
  );

  static final dark = GlassTheme(
    cardBackground: const Color(0xCC1E1E1E),
    cardBorder: const Color(0x33FFFFFF),
    softShadow: _darkShadow,
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
    );
  }

  @override
  GlassTheme lerp(GlassTheme? other, double t) {
    if (other is! GlassTheme) return this;
    return GlassTheme(
      cardBackground: Color.lerp(cardBackground, other.cardBackground, t)!,
      cardBorder: Color.lerp(cardBorder, other.cardBorder, t)!,
      softShadow: BoxShadow.lerpList(softShadow, other.softShadow, t),
      pageRadius: lerpDouble(pageRadius, other.pageRadius, t)!,
      controlRadius: lerpDouble(controlRadius, other.controlRadius, t)!,
      accentGradient: LinearGradient.lerp(accentGradient, other.accentGradient, t)!,
      segmentedBackground: Color.lerp(segmentedBackground, other.segmentedBackground, t)!,
      segmentedActiveBackground: Color.lerp(segmentedActiveBackground, other.segmentedActiveBackground, t)!,
      dividerColor: Color.lerp(dividerColor, other.dividerColor, t)!,
      navHoverBackground: Color.lerp(navHoverBackground, other.navHoverBackground, t)!,
    );
  }
}
