import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/l10n/app_localizations.dart';

class SettingsNavPanel extends ConsumerWidget {
  const SettingsNavPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>()!;
    final authState = ref.watch(authStateProvider);
    final user = authState.user;
    final loc = AppLocalizations.of(context);

    return Container(
      width: 216,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: glass.cardBackground,
        borderRadius: BorderRadius.circular(glass.pageRadius),
        border: Border.all(color: glass.cardBorder),
        boxShadow: glass.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // User info
          Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundImage: user?.avatar != null
                    ? NetworkImage(user!.avatar!)
                    : null,
                child: user?.avatar == null
                    ? Text(
                        (user?.nickname ?? user?.username ?? '?')
                            .substring(0, 1)
                            .toUpperCase(),
                        style: const TextStyle(fontSize: 16),
                      )
                    : null,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  user?.nickname ?? user?.username ?? 'IM',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Navigation items
          _NavItem(label: loc!.settingsAccount, icon: Icons.person_outline),
          _NavItem(label: loc.settingsAppearance, icon: Icons.palette_outlined),
          _NavItem(label: loc.settingsNotifications, icon: Icons.notifications_outlined),
          _NavItem(label: loc.settingsPrivacy, icon: Icons.shield_outlined),
          _NavItem(label: loc.settingsStorage, icon: Icons.storage_outlined),
          _NavItem(label: loc.settingsAi, icon: Icons.smart_toy_outlined),
        ],
      ),
    );
  }
}

class _NavItem extends StatefulWidget {
  const _NavItem({required this.label, required this.icon});
  final String label;
  final IconData icon;

  @override
  State<_NavItem> createState() => _NavItemState();
}

class _NavItemState extends State<_NavItem> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          decoration: BoxDecoration(
            color: _hovered ? glass.navHoverBackground : Colors.transparent,
            borderRadius: BorderRadius.circular(glass.controlRadius),
          ),
          child: Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(glass.controlRadius),
            child: InkWell(
              borderRadius: BorderRadius.circular(glass.controlRadius),
              onTap: () {},
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    Icon(widget.icon, size: 20, color: theme.colorScheme.onSurfaceVariant),
                    const SizedBox(width: 10),
                    Text(
                      widget.label,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
