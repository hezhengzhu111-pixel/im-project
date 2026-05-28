import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// A dialog action configuration.
class ImDialogAction {
  const ImDialogAction({
    required this.label,
    required this.onPressed,
    this.isDestructive = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool isDestructive;
}

/// A dialog with title, content, and configurable action buttons.
class ImDialog extends StatelessWidget {
  const ImDialog({
    super.key,
    this.title,
    required this.content,
    required this.actions,
  });

  final String? title;
  final Widget content;
  final List<ImDialogAction> actions;

  /// Convenience method to show the dialog and return when closed.
  static Future<void> show(
    BuildContext context, {
    String? title,
    required Widget content,
    required List<ImDialogAction> actions,
  }) {
    return showDialog(
      context: context,
      builder: (_) => ImDialog(
        title: title,
        content: content,
        actions: actions,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    return AlertDialog(
      title: title != null
          ? Text(
              title!,
              style: TextStyle(
                fontSize: ImTokens.textXl,
                fontWeight: FontWeight.w600,
                color: colors.textPrimary,
              ),
            )
          : null,
      content: content,
      actions: actions.map((action) {
        if (action.isDestructive) {
          return TextButton(
            onPressed: () {
              action.onPressed();
              Navigator.of(context).pop();
            },
            child: Text(
              action.label,
              style: TextStyle(color: colors.error),
            ),
          );
        }
        return FilledButton(
          onPressed: () {
            action.onPressed();
            Navigator.of(context).pop();
          },
          child: Text(action.label),
        );
      }).toList(),
    );
  }
}
