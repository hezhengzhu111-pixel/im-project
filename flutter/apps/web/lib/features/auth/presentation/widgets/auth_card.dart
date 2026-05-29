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
          constraints: const BoxConstraints(maxWidth: 420),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: glass.cardBackground,
            borderRadius: BorderRadius.circular(glass.pageRadius),
            border: Border.all(color: glass.cardBorder),
            boxShadow: glass.softShadow,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                title,
                style: theme.textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: theme.textTheme.bodyMedium,
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
