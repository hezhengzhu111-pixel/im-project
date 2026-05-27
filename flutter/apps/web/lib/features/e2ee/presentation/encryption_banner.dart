import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class EncryptionBanner extends StatelessWidget {
  const EncryptionBanner({required this.status, this.onDetails, this.onExit, this.onClear, super.key});
  final E2eeSessionStatus status;
  final VoidCallback? onDetails;
  final VoidCallback? onExit;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    if (status == E2eeSessionStatus.plaintext) return const SizedBox.shrink();

    final (color, icon, message) = switch (status) {
      E2eeSessionStatus.encrypted => (Colors.green, Icons.lock, '端到端加密已开启'),
      E2eeSessionStatus.negotiating => (Colors.amber, Icons.sync, '加密协商中...'),
      E2eeSessionStatus.failed => (Colors.red, Icons.error_outline, '端到端加密异常'),
      _ => (Colors.grey, Icons.lock_open, ''),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: color.withAlpha(20),
      child: Row(children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(child: Text(message, style: TextStyle(fontSize: 13, color: color))),
        if (status == E2eeSessionStatus.encrypted) ...[
          TextButton(onPressed: onDetails, child: const Text('详情', style: TextStyle(fontSize: 12))),
          TextButton(onPressed: onExit, child: const Text('退出加密', style: TextStyle(fontSize: 12))),
        ],
        if (status == E2eeSessionStatus.failed)
          TextButton(onPressed: onClear, child: const Text('清理状态', style: TextStyle(fontSize: 12))),
      ]),
    );
  }
}
