import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

class GradientBackground extends StatelessWidget {
  const GradientBackground({
    required this.child,
    this.colors = const [
      ImTokens.pageBackground,
      Color(0xFFF5F5F5),
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
  Widget build(BuildContext context) {
    final backgroundColor =
        colors.isEmpty ? ImTokens.pageBackground : colors[0];
    return ColoredBox(
      color: backgroundColor,
      child: child,
    );
  }
}
