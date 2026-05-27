import 'package:flutter/material.dart';

class EncryptionDialog extends StatelessWidget {
  const EncryptionDialog({required this.onConfirm, super.key});
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(children: [Icon(Icons.lock, color: Colors.green), SizedBox(width: 8), Text('启用端到端加密')]),
      content: const Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('端到端加密使用 Signal Protocol 保护您的消息：'),
        SizedBox(height: 8),
        Text('• 消息内容仅在双方设备上可见'),
        Text('• 服务器无法读取加密消息'),
        Text('• 每条消息使用独立密钥加密'),
        SizedBox(height: 12),
        Text('启用后，双方需要确认才能开始加密通信。'),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: () { Navigator.of(context).pop(); onConfirm(); }, child: const Text('确认启用')),
      ],
    );
  }
}
