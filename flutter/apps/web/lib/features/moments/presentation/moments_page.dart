import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_core/core.dart';

class MomentsPage extends ConsumerStatefulWidget {
  const MomentsPage({super.key});

  @override
  ConsumerState<MomentsPage> createState() => _MomentsPageState();
}

class _MomentsPageState extends ConsumerState<MomentsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(momentsStateProvider.notifier).loadFeed();
    });
  }

  @override
  Widget build(BuildContext context) {
    final momentsState = ref.watch(momentsStateProvider);

    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(color: Theme.of(context).dividerColor),
            ),
          ),
          child: Row(
            children: [
              const CircleAvatar(child: Icon(Icons.person)),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  decoration: InputDecoration(
                    hintText: '分享新鲜事...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                  ),
                  onSubmitted: (text) {
                    if (text.trim().isEmpty) return;
                    ref.read(momentsStateProvider.notifier).createPost(text.trim());
                  },
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        // Feed
        Expanded(
          child: momentsState.isLoading
              ? const Center(child: CircularProgressIndicator())
              : momentsState.posts.isEmpty
                  ? const Center(child: Text('暂无动态'))
                  : RefreshIndicator(
                      onRefresh: () =>
                          ref.read(momentsStateProvider.notifier).loadFeed(),
                      child: ListView.builder(
                        padding: const EdgeInsets.only(bottom: 80),
                        itemCount: momentsState.posts.length,
                        itemBuilder: (context, index) {
                          final post = momentsState.posts[index];
                          return _MomentPostCard(
                            post: post,
                            onLike: () {
                              ref
                                  .read(momentsStateProvider.notifier)
                                  .toggleLike(post.id, post.isLiked == true);
                            },
                            onComment: () {
                              // TODO: show comment input dialog
                            },
                          );
                        },
                      ),
                    ),
        ),
      ],
    );
  }

  @override
  void dispose() {
    super.dispose();
  }
}

class _MomentPostCard extends StatelessWidget {
  const _MomentPostCard({
    required this.post,
    required this.onLike,
    required this.onComment,
  });
  final MomentPost post;
  final VoidCallback onLike;
  final VoidCallback onComment;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // User info
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundImage: post.userAvatar != null
                      ? NetworkImage(post.userAvatar!)
                      : null,
                  child: post.userAvatar == null
                      ? Text(
                          (post.userName ?? '?').substring(0, 1).toUpperCase(),
                          style: const TextStyle(fontSize: 14),
                        )
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        post.userName ?? '用户',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        _formatTime(post.createTime),
                        style: TextStyle(
                          color: theme.colorScheme.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Content
            Text(
              post.content,
              style: const TextStyle(fontSize: 15, height: 1.5),
            ),
            // Media
            if (post.media != null && post.media!.isNotEmpty) ...[
              const SizedBox(height: 12),
              _buildMediaGrid(post.media!),
            ],
            const SizedBox(height: 12),
            // Actions
            Row(
              children: [
                _ActionChip(
                  icon: post.isLiked == true
                      ? Icons.favorite
                      : Icons.favorite_border,
                  label: post.likeCount != null && post.likeCount! > 0
                      ? '${post.likeCount}'
                      : '赞',
                  color: post.isLiked == true ? Colors.red : null,
                  onTap: onLike,
                ),
                const SizedBox(width: 16),
                _ActionChip(
                  icon: Icons.chat_bubble_outline,
                  label: post.commentCount != null && post.commentCount! > 0
                      ? '${post.commentCount}'
                      : '评论',
                  onTap: onComment,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaGrid(List<MomentMedia> media) {
    if (media.length == 1) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          media[0].thumbnailUrl ?? media[0].url,
          width: 200,
          height: 200,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            width: 200,
            height: 200,
            color: Colors.grey[300],
            child: const Icon(Icons.broken_image),
          ),
        ),
      );
    }

    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: media.take(9).map((m) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Image.network(
            m.thumbnailUrl ?? m.url,
            width: 100,
            height: 100,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              width: 100,
              height: 100,
              color: Colors.grey[300],
              child: const Icon(Icons.broken_image, size: 20),
            ),
          ),
        );
      }).toList(),
    );
  }

  String _formatTime(String time) {
    try {
      final dt = DateTime.parse(time);
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return '刚刚';
      if (diff.inHours < 1) return '${diff.inMinutes}分钟前';
      if (diff.inDays < 1) return '${diff.inHours}小时前';
      if (diff.inDays < 30) return '${diff.inDays}天前';
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return time;
    }
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(fontSize: 13, color: color)),
          ],
        ),
      ),
    );
  }
}
