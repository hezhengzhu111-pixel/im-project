import 'package:flutter/material.dart';
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
    return SizedBox(
      height: 56,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(bottom: BorderSide(color: theme.dividerColor)),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Text(
              AppLocalizations.of(context)!.momentsTitle,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurface,
              ),
            ),
            Positioned(
              right: 12,
              child: IconButton(
                onPressed: onComposeTap,
                icon: const Icon(Icons.camera_alt_outlined),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
