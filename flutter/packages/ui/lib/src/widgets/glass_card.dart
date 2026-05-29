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
