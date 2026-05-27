import 'dart:ui';
import 'package:flutter/material.dart';

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
    final isSolid = scrollProgress > 0.5;

    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: scrollProgress * 10, sigmaY: scrollProgress * 10),
        child: Container(
          height: 56,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface.withValues(alpha: scrollProgress * 0.95),
            border: Border(
              bottom: BorderSide(
                color: Theme.of(context).dividerColor.withValues(alpha: scrollProgress),
              ),
            ),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Text(
                '朋友圈',
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
