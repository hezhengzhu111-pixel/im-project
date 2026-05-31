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
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: media
                    .map((m) => Container(
                          width: 100,
                          height: 100,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            image: DecorationImage(
                              image: NetworkImage(m.url),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ))
                    .toList(),
              ),
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
}
