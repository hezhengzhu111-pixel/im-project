import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

/// File download is not implemented yet, so the download button stays disabled.
class FileBubble extends StatelessWidget {
  const FileBubble({required this.message, required this.isMe, super.key});

  final Message message;
  final bool isMe;

  String _formatSize(int? bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
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
            Icons.insert_drive_file,
            size: 36,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message.mediaName ?? 'File',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (message.mediaSize != null)
                  Text(
                    _formatSize(message.mediaSize),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Tooltip(
            message: 'File download is not supported yet',
            child: IconButton(
              icon: const Icon(Icons.download),
              onPressed: null,
            ),
          ),
        ],
      ),
    );
  }
}
