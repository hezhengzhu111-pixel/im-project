import 'package:flutter/material.dart';

class ChatPage extends StatelessWidget {
  const ChatPage({this.sessionId, super.key});
  final String? sessionId;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 320,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: '搜索',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                  ),
                ),
              ),
              const Expanded(
                child: Center(child: Text('会话列表')),
              ),
            ],
          ),
        ),
        const VerticalDivider(thickness: 1, width: 1),
        Expanded(
          child: sessionId != null
              ? Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      child: Text('会话 $sessionId'),
                    ),
                    const Expanded(child: Center(child: Text('消息区域'))),
                    _MessageInput(onSend: (_) {}),
                  ],
                )
              : const Center(child: Text('选择一个会话')),
        ),
      ],
    );
  }
}

class _MessageInput extends StatelessWidget {
  const _MessageInput({required this.onSend});
  final void Function(String) onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              decoration: InputDecoration(
                hintText: '输入消息...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(onPressed: () {}, child: const Text('发送')),
        ],
      ),
    );
  }
}
