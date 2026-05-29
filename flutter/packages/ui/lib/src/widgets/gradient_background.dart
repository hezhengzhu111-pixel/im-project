import 'dart:math' as math;
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
      final x = 0.3 + 0.4 * (i.isEven ? 1 : -1) * math.sin(rad);
      final y = 0.2 + 0.6 * math.cos(rad).abs();
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
