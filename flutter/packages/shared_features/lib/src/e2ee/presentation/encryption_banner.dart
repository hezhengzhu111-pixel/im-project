import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class EncryptionBanner extends StatelessWidget {
  const EncryptionBanner({
    required this.status,
    required this.encryptedLabel,
    required this.negotiatingLabel,
    required this.failedLabel,
    required this.detailsLabel,
    required this.exitLabel,
    required this.clearStateLabel,
    this.onDetails,
    this.onExit,
    this.onClear,
    super.key,
  });

  final E2eeSessionStatus status;
  final String encryptedLabel;
  final String negotiatingLabel;
  final String failedLabel;
  final String detailsLabel;
  final String exitLabel;
  final String clearStateLabel;
  final VoidCallback? onDetails;
  final VoidCallback? onExit;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    if (status == E2eeSessionStatus.plaintext) return const SizedBox.shrink();

    final (color, icon, message) = switch (status) {
      E2eeSessionStatus.encrypted => (Colors.green, Icons.lock, encryptedLabel),
      E2eeSessionStatus.negotiating =>
        (Colors.amber, Icons.sync, negotiatingLabel),
      E2eeSessionStatus.failed =>
        (Colors.red, Icons.error_outline, failedLabel),
      _ => (Colors.grey, Icons.lock_open, ''),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: color.withAlpha(20),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 13, color: color),
            ),
          ),
          if (status == E2eeSessionStatus.encrypted) ...[
            TextButton(
              onPressed: onDetails,
              child: Text(
                detailsLabel,
                style: const TextStyle(fontSize: 12),
              ),
            ),
            TextButton(
              onPressed: onExit,
              child: Text(
                exitLabel,
                style: const TextStyle(fontSize: 12),
              ),
            ),
          ],
          if (status == E2eeSessionStatus.failed)
            TextButton(
              onPressed: onClear,
              child: Text(
                clearStateLabel,
                style: const TextStyle(fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }
}
