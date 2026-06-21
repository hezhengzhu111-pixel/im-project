import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'image_viewer.dart';

class ImageBubble extends StatelessWidget {
  const ImageBubble({required this.message, required this.isMe, super.key});
  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final imageUrl = message.thumbnailUrl ?? message.mediaUrl ?? '';
    return GestureDetector(
      onTap: () {
        if (message.mediaUrl != null) {
          showDialog(
            context: context,
            builder: (_) => ImageViewer(imageUrl: message.mediaUrl!),
          );
        }
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 240, maxHeight: 320),
          child: imageUrl.isNotEmpty
              ? Image.network(
                  imageUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    width: 120,
                    height: 120,
                    color: Colors.grey[300],
                    child: const Icon(Icons.broken_image, color: Colors.grey),
                  ),
                )
              : Container(
                  width: 120,
                  height: 120,
                  color: Colors.grey[300],
                  child: const Icon(Icons.image, color: Colors.grey),
                ),
        ),
      ),
    );
  }
}
