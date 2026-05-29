import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/l10n/app_localizations.dart';

class MomentsTopbar extends StatelessWidget {
  const MomentsTopbar({
    required this.scrollProgress,
    required this.onComposeTap,
    super.key,
  });

  final double scrollProgress;
  final VoidCallback onComposeTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>()!;
    final isSolid = scrollProgress > 0.5;

    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: glass.blurIntensity,
          sigmaY: glass.blurIntensity,
        ),
        child: Container(
          height: 56,
          decoration: BoxDecoration(
            color: glass.navBackground,
            border: Border(
              bottom: BorderSide(color: glass.dividerColor),
            ),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Text(
                AppLocalizations.of(context)!.momentsTitle,
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: isSolid
                      ? theme.colorScheme.onSurface
                      : Colors.white,
                  shadows: isSolid
                      ? null
                      : const [Shadow(blurRadius: 2, color: Colors.black45)],
                ),
              ),
              Positioned(
                right: 16,
                child: IconButton(
                  onPressed: onComposeTap,
                  icon: Icon(
                    Icons.camera_alt,
                    color: isSolid
                        ? theme.colorScheme.onSurface
                        : Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
