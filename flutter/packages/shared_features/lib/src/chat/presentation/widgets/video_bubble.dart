import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

/// P0 止血：视频播放尚未实现，以静态不可交互状态展示。
/// 后续 P1/P2 实现完整视频播放器后恢复交互。
class VideoBubble extends StatelessWidget {
  const VideoBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final thumbnailUrl = message.thumbnailUrl ?? '';
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        alignment: Alignment.center,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 240, maxHeight: 180),
            child: thumbnailUrl.isNotEmpty
                ? Image.network(thumbnailUrl, fit: BoxFit.cover)
                : Container(
                    width: 240,
                    height: 180,
                    color: Colors.black26,
                  ),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: const BoxDecoration(
              color: Colors.black45,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.play_arrow, color: Colors.white, size: 32),
          ),
        ],
      ),
    );
  }
}
