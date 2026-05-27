import 'package:flutter/material.dart';

class NegotiationDialog extends StatelessWidget {
  const NegotiationDialog({required this.requesterName, required this.onAccept, required this.onReject, super.key});
  final String requesterName;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(children: [Icon(Icons.lock, color: Colors.green), SizedBox(width: 8), Text('端到端加密请求')]),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$requesterName 请求启用端到端加密'),
        const SizedBox(height: 12),
        const Text('Signal Protocol 保护：', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        const Text('• 消息内容仅在双方设备上可见'),
        const Text('• 服务器无法读取加密消息'),
        const Text('• 每条消息使用独立密钥加密'),
      ]),
      actions: [
        TextButton(onPressed: onReject, child: const Text('拒绝')),
        FilledButton(onPressed: onAccept, child: const Text('接受')),
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
