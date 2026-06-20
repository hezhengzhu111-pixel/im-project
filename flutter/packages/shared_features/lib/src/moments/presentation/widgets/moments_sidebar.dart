import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';

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
          _buildProfileCard(context, theme, user),

          const SizedBox(height: 14),

          // Today overview
          _buildStatsCard(context, theme),

          const SizedBox(height: 14),

          // Recent activity
          _buildActivityCard(context, theme),

          const SizedBox(height: 14),

          // Tip card
          _buildTipCard(context, theme),
        ],
      ),
    );
  }

  Widget _buildProfileCard(BuildContext context, ThemeData theme, User? user) {
    final loc = AppLocalizations.of(context)!;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundImage:
                  user?.avatar != null ? NetworkImage(user!.avatar!) : null,
              child: user?.avatar == null
                  ? Text(
                      (user?.nickname ?? user?.username ?? 'U')
                          .substring(0, 1)
                          .toUpperCase(),
                      style: const TextStyle(fontSize: 20),
                    )
                  : null,
            ),
            const SizedBox(height: 12),
            Text(
              user?.nickname ?? user?.username ?? loc.momentsUserFallback,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onComposeTap,
              icon: const Icon(Icons.camera_alt, size: 18),
              label: Text(loc.momentsPublishButton),
              style: FilledButton.styleFrom(
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20)),
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsCard(BuildContext context, ThemeData theme) {
    final loc = AppLocalizations.of(context)!;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              loc.momentsDailyOverview,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color:
                    theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
                letterSpacing: 0.06,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _buildStatItem(theme, '--', loc.momentsInteractions),
                _buildStatItem(theme, '--', loc.momentsPhotos),
                _buildStatItem(theme, '--', loc.momentsComments),
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
            style: TextStyle(
                fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityCard(BuildContext context, ThemeData theme) {
    final loc = AppLocalizations.of(context)!;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              loc.momentsRecentInteractions,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color:
                    theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
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
                  loc.momentsNoRecentInteractions,
                  style: TextStyle(
                      fontSize: 13, color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTipCard(BuildContext context, ThemeData theme) {
    final loc = AppLocalizations.of(context)!;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              loc.momentsSharePrompt,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 6),
            Text(
              loc.momentsShareDesc,
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
