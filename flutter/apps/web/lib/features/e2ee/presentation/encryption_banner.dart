import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_web/l10n/app_localizations.dart';

class EncryptionBanner extends StatelessWidget {
  const EncryptionBanner(
      {required this.status,
      this.onDetails,
      this.onExit,
      this.onClear,
      super.key});
  final E2eeSessionStatus status;
  final VoidCallback? onDetails;
  final VoidCallback? onExit;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    if (status == E2eeSessionStatus.plaintext) return const SizedBox.shrink();

    final loc = AppLocalizations.of(context)!;
    final (color, icon, message) = switch (status) {
      E2eeSessionStatus.encrypted => (
          Colors.green,
          Icons.lock,
          loc.e2eeEncryptedStatus
        ),
      E2eeSessionStatus.negotiating => (
          Colors.amber,
          Icons.sync,
          loc.e2eeNegotiatingStatus
        ),
      E2eeSessionStatus.failed => (
          Colors.red,
          Icons.error_outline,
          loc.e2eeFailedStatus
        ),
      _ => (Colors.grey, Icons.lock_open, ''),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: color.withAlpha(20),
      child: Row(children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
            child: Text(message, style: TextStyle(fontSize: 13, color: color))),
        if (status == E2eeSessionStatus.encrypted) ...[
          TextButton(
              onPressed: onDetails,
              child:
                  Text(loc.e2eeDetails, style: const TextStyle(fontSize: 12))),
          TextButton(
              onPressed: onExit,
              child: Text(loc.e2eeExit, style: const TextStyle(fontSize: 12))),
        ],
        if (status == E2eeSessionStatus.failed)
          TextButton(
              onPressed: onClear,
              child: Text(loc.e2eeClearState,
                  style: const TextStyle(fontSize: 12))),
      ]),
    );
  }
}
