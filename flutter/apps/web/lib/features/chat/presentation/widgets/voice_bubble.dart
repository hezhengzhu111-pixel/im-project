import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

/// P0 止血：语音播放尚未实现，以静态不可交互状态展示。
/// 后续 P1/P2 实现完整音频播放器后恢复交互。
class VoiceBubble extends StatelessWidget {
  const VoiceBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final duration = message.duration ?? 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: isMe
            ? Theme.of(context).colorScheme.primaryContainer
            : Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.play_arrow,
            color: Theme.of(context).disabledColor,
          ),
          const SizedBox(width: 8),
          ...List.generate(
            (duration / 100).clamp(3, 20).toInt(),
            (i) => Container(
              width: 3,
              height: (8 + (i % 3) * 4).toDouble(),
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: BoxDecoration(
                color: Theme.of(context).disabledColor.withAlpha(100),
                borderRadius: BorderRadius.circular(1.5),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${(duration / 1000).toStringAsFixed(1)}s',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).disabledColor,
                ),
          ),
        ],
      ),
    );
  }
}
