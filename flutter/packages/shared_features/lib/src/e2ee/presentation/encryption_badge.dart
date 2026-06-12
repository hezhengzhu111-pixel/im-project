import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class EncryptionBadge extends StatelessWidget {
  const EncryptionBadge({
    required this.status,
    required this.encryptedLabel,
    required this.negotiatingLabel,
    required this.failedLabel,
    required this.plaintextLabel,
    super.key,
  });

  final E2eeSessionStatus status;
  final String encryptedLabel;
  final String negotiatingLabel;
  final String failedLabel;
  final String plaintextLabel;

  @override
  Widget build(BuildContext context) {
    final (color, icon, label) = switch (status) {
      E2eeSessionStatus.encrypted => (Colors.green, Icons.lock, encryptedLabel),
      E2eeSessionStatus.negotiating => (
          Colors.amber,
          Icons.sync,
          negotiatingLabel
        ),
      E2eeSessionStatus.failed => (Colors.red, Icons.lock_outline, failedLabel),
      E2eeSessionStatus.plaintext => (
          Colors.grey,
          Icons.lock_open,
          plaintextLabel
        ),
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
            SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 2, color: color),
            )
          else
            Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: color,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
