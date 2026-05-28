import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

class EncryptionDialog extends StatelessWidget {
  const EncryptionDialog({required this.onConfirm, super.key});
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Row(children: [const Icon(Icons.lock, color: Colors.green), const SizedBox(width: 8), Expanded(child: Text(loc.e2eeDialogTitle))]),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(loc.e2eeDialogDescription),
        const SizedBox(height: 8),
        Text(loc.e2eeSignalBullet1),
        Text(loc.e2eeSignalBullet2),
        Text(loc.e2eeSignalBullet3),
        const SizedBox(height: 12),
        Text(loc.e2eeDialogFooter),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(loc.commonCancel)),
        FilledButton(onPressed: () { Navigator.of(context).pop(); onConfirm(); }, child: Text(loc.e2eeConfirmEnable)),
      ],
    );
  }
}
