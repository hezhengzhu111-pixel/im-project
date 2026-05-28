import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

class NegotiationDialog extends StatelessWidget {
  const NegotiationDialog({required this.requesterName, required this.onAccept, required this.onReject, super.key});
  final String requesterName;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Row(children: [const Icon(Icons.lock, color: Colors.green), const SizedBox(width: 8), Text(loc.e2eeRequestTitle)]),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(loc.e2eeRequestDescription(requesterName)),
        const SizedBox(height: 12),
        Text(loc.e2eeSignalProtocol, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(loc.e2eeSignalBullet1),
        Text(loc.e2eeSignalBullet2),
        Text(loc.e2eeSignalBullet3),
      ]),
      actions: [
        TextButton(onPressed: onReject, child: Text(loc.e2eeReject)),
        FilledButton(onPressed: onAccept, child: Text(loc.e2eeAccept)),
      ],
    );
  }

  static Future<bool?> show(BuildContext context, String requesterName) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => NegotiationDialog(
        requesterName: requesterName,
        onAccept: () => Navigator.of(ctx).pop(true),
        onReject: () => Navigator.of(ctx).pop(false),
      ),
    );
  }
}
