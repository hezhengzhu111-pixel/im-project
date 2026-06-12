import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class VideoBubble extends StatelessWidget {
  const VideoBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final thumbnailUrl = message.thumbnailUrl ?? '';
    return GestureDetector(
      onTap: () {
        // TODO: implement video playback
      },
      child: ClipRRect(
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
              child:
                  const Icon(Icons.play_arrow, color: Colors.white, size: 32),
            ),
          ],
        ),
      ),
    );
  }
}
