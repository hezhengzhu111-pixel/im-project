import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';

class MediaUploadItem {
  const MediaUploadItem({
    required this.bytes,
    required this.fileName,
    required this.isVideo,
  });

  final Uint8List bytes;
  final String fileName;
  final bool isVideo;
}

class MediaUploadGrid extends StatelessWidget {
  const MediaUploadGrid({
    required this.files,
    required this.onAdd,
    required this.onRemove,
    super.key,
  });

  final List<MediaUploadItem> files;
  final ValueChanged<MediaUploadItem> onAdd;
  final ValueChanged<int> onRemove;

  static const int maxFiles = 9;
  static const int maxImageSize = 20 * 1024 * 1024; // 20MB
  static const int maxVideoSize = 100 * 1024 * 1024; // 100MB

  Future<void> _pickFiles(BuildContext context) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.media,
      allowMultiple: true,
    );

    if (result == null) return;

    for (final file in result.files) {
      if (files.length >= maxFiles) break;
      if (file.bytes == null) continue;

      final isVideo = file.extension == 'mp4' ||
          file.extension == 'mov' ||
          file.extension == 'avi' ||
          file.extension == 'webm';

      final maxSize = isVideo ? maxVideoSize : maxImageSize;
      if (file.size > maxSize) {
        continue;
      }

      onAdd(MediaUploadItem(
        bytes: file.bytes!,
        fileName: file.name,
        isVideo: isVideo,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ...files.asMap().entries.map((entry) {
              return _buildPreviewItem(context, entry.key, entry.value);
            }),
            if (files.length < maxFiles)
              _buildAddButton(context),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '添加图片/视频，最多 $maxFiles 张',
          style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }

  Widget _buildPreviewItem(BuildContext context, int index, MediaUploadItem item) {
    final theme = Theme.of(context);

    return Stack(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: theme.colorScheme.surfaceContainerHighest,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: item.isVideo
                ? Stack(
                    alignment: Alignment.center,
                    children: [
                      Icon(Icons.videocam, color: theme.colorScheme.onSurfaceVariant),
                      Positioned(
                        bottom: 4,
                        child: Text(
                          item.fileName,
                          style: TextStyle(fontSize: 10, color: theme.colorScheme.onSurfaceVariant),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  )
                : Image.memory(
                    item.bytes,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Icon(Icons.broken_image, color: theme.colorScheme.onSurfaceVariant),
                  ),
          ),
        ),
        Positioned(
          top: 2,
          right: 2,
          child: GestureDetector(
            onTap: () => onRemove(index),
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.5),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildAddButton(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: () => _pickFiles(context),
      child: Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.2),
            style: BorderStyle.solid,
          ),
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
        ),
        child: Icon(
          Icons.add,
          size: 32,
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}
