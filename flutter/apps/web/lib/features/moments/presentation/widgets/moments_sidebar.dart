import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../../core/di/providers.dart';

class MomentsSidebar extends ConsumerWidget {
  const MomentsSidebar({required this.onComposeTap, super.key});

  final VoidCallback onComposeTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final user = ref.watch(authStateProvider).user;

    return SizedBox(
      width: 336,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Profile card
          _buildProfileCard(theme, user),

          const SizedBox(height: 14),

          // Today overview
          _buildStatsCard(theme),

          const SizedBox(height: 14),

          // Recent activity
          _buildActivityCard(theme),

          const SizedBox(height: 14),

          // Tip card
          _buildTipCard(theme),
        ],
      ),
    );
  }

  Widget _buildProfileCard(ThemeData theme, User? user) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundImage: user?.avatar != null ? NetworkImage(user!.avatar!) : null,
              child: user?.avatar == null
                  ? Text(
                      (user?.nickname ?? user?.username ?? 'U').substring(0, 1).toUpperCase(),
                      style: const TextStyle(fontSize: 20),
                    )
                  : null,
            ),
            const SizedBox(height: 12),
            Text(
              user?.nickname ?? user?.username ?? '用户',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onComposeTap,
              icon: const Icon(Icons.camera_alt, size: 18),
              label: const Text('发布动态'),
              style: FilledButton.styleFrom(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsCard(ThemeData theme) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '今日概览',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
                letterSpacing: 0.06,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _buildStatItem(theme, '--', '互动'),
                _buildStatItem(theme, '--', '照片'),
                _buildStatItem(theme, '--', '评论'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatItem(ThemeData theme, String value, String label) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityCard(ThemeData theme) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '最近互动',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
                letterSpacing: 0.06,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '暂无最近互动',
                  style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTipCard(ThemeData theme) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '分享你的生活瞬间',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 6),
            Text(
              '照片、文字、视频都可以发布到朋友圈',
              style: TextStyle(
                fontSize: 12,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
