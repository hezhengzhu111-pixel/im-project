import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// Empty state placeholder with icon, title, and optional action.
class ImEmpty extends StatelessWidget {
  const ImEmpty({
    super.key,
    this.title,
    this.subtitle,
    this.icon,
    this.action,
  });

  final String? title;
  final String? subtitle;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors =
        theme.brightness == Brightness.light ? ImColors.light : ImColors.dark;

    return Center(
      child: Padding(
        padding: EdgeInsets.all(ImTokens.space8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) Icon(icon, size: 64, color: colors.textDisabled),
            if (icon != null) SizedBox(height: ImTokens.space4),
            if (title != null)
              Text(
                title!,
                style: TextStyle(
                  fontSize: ImTokens.textLg,
                  fontWeight: FontWeight.w600,
                  color: colors.textPrimary,
                ),
              ),
            if (title != null) SizedBox(height: ImTokens.space2),
            if (subtitle != null)
              Text(
                subtitle!,
                style: TextStyle(
                  fontSize: ImTokens.textBase,
                  color: colors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
            if (action != null) ...[
              SizedBox(height: ImTokens.space4),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
