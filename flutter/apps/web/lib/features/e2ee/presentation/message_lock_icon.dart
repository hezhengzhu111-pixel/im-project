import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

class MessageLockIcon extends StatelessWidget {
  const MessageLockIcon({super.key});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: AppLocalizations.of(context)?.a11yEncryptedMessage ?? '此消息已端到端加密',
      child: Icon(Icons.lock_outline, size: 12, color: Colors.green.withAlpha(180)),
    );
  }
}
