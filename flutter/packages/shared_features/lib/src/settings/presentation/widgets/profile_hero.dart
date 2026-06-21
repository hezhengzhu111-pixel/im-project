import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';

class ProfileHero extends StatelessWidget {
  const ProfileHero({
    required this.user,
    required this.onAvatarTap,
    super.key,
  });

  final User? user;
  final VoidCallback onAvatarTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: glass?.cardBackground ?? theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(glass?.pageRadius ?? 16),
        border: Border.all(
            color: glass?.cardBorder ?? theme.colorScheme.outlineVariant),
        boxShadow: glass?.softShadow,
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: onAvatarTap,
            child: Stack(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundImage:
                      user?.avatar != null ? NetworkImage(user!.avatar!) : null,
                  child: user?.avatar == null
                      ? Text(
                          (user?.nickname ?? user?.username ?? '?')
                              .substring(0, 1)
                              .toUpperCase(),
                          style: const TextStyle(fontSize: 24),
                        )
                      : null,
                ),
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      gradient: glass?.accentGradient ??
                          LinearGradient(
                            colors: [
                              theme.colorScheme.primary,
                              theme.colorScheme.primaryContainer,
                            ],
                          ),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.camera_alt,
                      size: 14,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user?.nickname ?? user?.username ?? '',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'ID: ${user?.username ?? '-'}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  children: [
                    if (user?.email != null)
                      _VerificationChip(label: user!.email!),
                    if (user?.phone != null)
                      _VerificationChip(label: user!.phone!),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VerificationChip extends StatelessWidget {
  const _VerificationChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.green.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_circle, size: 12, color: Colors.green),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
              style: TextStyle(
                fontSize: 11,
                color: Colors.green.shade700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
