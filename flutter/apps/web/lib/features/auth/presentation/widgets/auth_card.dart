import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:im_web/core/theme/glass_theme.dart';

class AuthCard extends StatelessWidget {
  final Widget child;
  final String title;
  final String subtitle;

  const AuthCard({
    super.key,
    required this.child,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>()!;

    return ClipRRect(
      borderRadius: BorderRadius.circular(glass.pageRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: glass.blurIntensity,
          sigmaY: glass.blurIntensity,
        ),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(36),
          decoration: BoxDecoration(
            // 更高的透明度，让毛玻璃效果更明显
            color: Colors.white.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(glass.pageRadius),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.5),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 32,
                offset: const Offset(0, 8),
              ),
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                title,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: Colors.grey.shade800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.grey.shade500,
                ),
              ),
              const SizedBox(height: 32),
              child,
            ],
          ),
        ),
      ),
    );
  }
}
