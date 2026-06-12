import 'package:flutter/material.dart';

class GlassCard extends StatelessWidget {
  const GlassCard({
    required this.child,
    this.blurIntensity = 0,
    this.backgroundColor = const Color(0xFFFFFFFF),
    this.borderColor = const Color(0xFFE5E5E5),
    this.borderRadius = 4,
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
    final card = Container(
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: borderColor),
        boxShadow: shadow,
      ),
      padding: padding,
      child: child,
    );

    final wrapped = onTap == null
        ? card
        : Material(
            color: Colors.transparent,
            child: InkWell(onTap: onTap, child: card),
          );

    if (margin != null) {
      return Padding(padding: margin!, child: wrapped);
    }

    return wrapped;
  }
}
