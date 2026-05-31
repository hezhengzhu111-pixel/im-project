import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import '../../../l10n/app_localizations.dart';

class EncryptionBadge extends StatelessWidget {
  const EncryptionBadge({required this.status, super.key});
  final E2eeSessionStatus status;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final (color, icon, label) = switch (status) {
      E2eeSessionStatus.encrypted => (Colors.green, Icons.lock, loc.e2eeEncryptedBadge),
      E2eeSessionStatus.negotiating => (Colors.amber, Icons.sync, loc.e2eeNegotiatingBadge),
      E2eeSessionStatus.failed => (Colors.red, Icons.lock_outline, loc.e2eeFailedBadge),
      E2eeSessionStatus.plaintext => (Colors.grey, Icons.lock_open, loc.e2eePlaintextBadge),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (status == E2eeSessionStatus.negotiating)
            SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: color))
          else
            Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
