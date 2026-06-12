import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

import 'video_player_widget.dart';

class MediaGrid extends StatelessWidget {
  const MediaGrid({
    required this.media,
    this.onImageTap,
    super.key,
  });

  final List<MomentMedia> media;
  final void Function(int index)? onImageTap;

  @override
  Widget build(BuildContext context) {
    if (media.isEmpty) return const SizedBox.shrink();

    // Single video
    if (media.length == 1 && media[0].type == 1) {
      return _buildSingleVideo(context);
    }

    final images = media.where((m) => m.type == 0).toList();
    return _buildImageGrid(context, images);
  }

  Widget _buildSingleVideo(BuildContext context) {
    return MomentVideoPlayer(
      videoUrl: media[0].url,
      thumbnailUrl: media[0].thumbnailUrl,
    );
  }

  Widget _buildImageGrid(BuildContext context, List<MomentMedia> images) {
    final count = images.length.clamp(0, 9);
    final columns = count <= 1
        ? 1
        : count <= 4
            ? 2
            : 3;

    return Container(
      constraints: const BoxConstraints(maxWidth: 720),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: columns,
          crossAxisSpacing: 4,
          mainAxisSpacing: 4,
        ),
        itemCount: count,
        itemBuilder: (context, index) {
          final item = images[index];
          return _buildImageItem(context, item, index);
        },
      ),
    );
  }

  Widget _buildImageItem(BuildContext context, MomentMedia item, int index) {
    return GestureDetector(
      onTap: () => onImageTap?.call(index),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          item.thumbnailUrl ?? item.url,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            color: Colors.grey[300],
            child: const Icon(Icons.broken_image, size: 24),
          ),
        ),
      ),
    );
  }
}
