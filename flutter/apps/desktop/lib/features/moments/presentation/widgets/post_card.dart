import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../moments_providers.dart';

class PostCard extends ConsumerWidget {
  final PostWithDetails post;

  const PostCard({super.key, required this.post});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nickname = post.userNickname ?? post.post.userNickname ?? '未知用户';
    final media = post.media ?? [];

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // User info
            Row(
              children: [
                CircleAvatar(
                  child: Text(nickname.isNotEmpty ? nickname[0] : '?'),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        nickname,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        post.post.createTime,
                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Content
            if (post.post.content != null && post.post.content!.isNotEmpty)
              Text(post.post.content!, style: const TextStyle(fontSize: 15)),

            // Media
            if (media.isNotEmpty) ...[
              const SizedBox(height: 12),
              _buildMediaGrid(media),
            ],

            const SizedBox(height: 12),

            // Actions
            Row(
              children: [
                IconButton(
                  icon: Icon(
                    (post.isLiked ?? false)
                        ? Icons.favorite
                        : Icons.favorite_border,
                    color: (post.isLiked ?? false) ? Colors.red : null,
                  ),
                  onPressed: () {
                    ref
                        .read(momentsFeedProvider.notifier)
                        .toggleLike(post.post.id);
                  },
                  iconSize: 20,
                ),
                Text('${post.likeCount ?? 0}'),
                const SizedBox(width: 16),
                IconButton(
                  icon: const Icon(Icons.comment_outlined),
                  onPressed: () {
                    // TODO: 打开评论
                  },
                  iconSize: 20,
                ),
                Text('${post.commentCount ?? 0}'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaGrid(List<MomentMedia> media) {
    if (media.isEmpty) return const SizedBox.shrink();

    // 最多显示 9 个媒体
    final displayMedia = media.take(9).toList();
    final crossAxisCount = displayMedia.length <= 1 ? 1 : (displayMedia.length <= 4 ? 2 : 3);

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: displayMedia.length,
      itemBuilder: (context, index) {
        final item = displayMedia[index];
        return _buildMediaItem(item);
      },
    );
  }

  Widget _buildMediaItem(MomentMedia item) {
    final url = item.url;
    final type = item.type;

    // type: 0 = image, 1 = video
    if (type == 1) {
      return _buildVideoItem(url, item.thumbnailUrl);
    } else {
      return _buildImageItem(url);
    }
  }

  Widget _buildImageItem(String url) {
    if (url.isEmpty) {
      return Container(
        color: Colors.grey[300],
        child: const Icon(Icons.image_not_supported),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) {
          return Container(
            color: Colors.grey[300],
            child: const Icon(Icons.image_not_supported),
          );
        },
      ),
    );
  }

  Widget _buildVideoItem(String url, String? thumbnailUrl) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(8),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // 视频缩略图
            if (thumbnailUrl != null && thumbnailUrl.isNotEmpty)
              Positioned.fill(
                child: Image.network(
                  thumbnailUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) {
                    return const SizedBox.shrink();
                  },
                ),
              )
            else if (url.isNotEmpty)
              Positioned.fill(
                child: Image.network(
                  url,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) {
                    return const SizedBox.shrink();
                  },
                ),
              ),
            // 播放按钮
            const Icon(
              Icons.play_circle_outline,
              color: Colors.white,
              size: 48,
            ),
          ],
        ),
      ),
    );
  }
}
