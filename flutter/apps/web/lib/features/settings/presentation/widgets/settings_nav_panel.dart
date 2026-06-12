import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/l10n/app_localizations.dart';

class SettingsNavPanel extends ConsumerWidget {
  final int selectedIndex;
  final ValueChanged<int> onItemSelected;

  const SettingsNavPanel({
    super.key,
    required this.selectedIndex,
    required this.onItemSelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final authState = ref.watch(authStateProvider);
    final user = authState.user;
    final loc = AppLocalizations.of(context);

    return Container(
      width: 216,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // User info
          Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundImage:
                    user?.avatar != null ? NetworkImage(user!.avatar!) : null,
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
          Semantics(
            label: loc!.a11ySettingsProfile,
            button: true,
            child: _NavItem(
              label: loc.settingsAccount,
              icon: Icons.person_outline,
              isSelected: selectedIndex == 0,
              onTap: () => onItemSelected(0),
            ),
          ),
          Semantics(
            label: loc.a11ySettingsAppearance,
            button: true,
            child: _NavItem(
              label: loc.settingsAppearance,
              icon: Icons.palette_outlined,
              isSelected: selectedIndex == 1,
              onTap: () => onItemSelected(1),
            ),
          ),
          Semantics(
            label: loc.a11ySettingsNotifications,
            button: true,
            child: _NavItem(
              label: loc.settingsNotifications,
              icon: Icons.notifications_outlined,
              isSelected: selectedIndex == 2,
              onTap: () => onItemSelected(2),
            ),
          ),
          Semantics(
            label: loc.a11ySettingsSecurity,
            button: true,
            child: _NavItem(
              label: loc.settingsPrivacy,
              icon: Icons.shield_outlined,
              isSelected: selectedIndex == 3,
              onTap: () => onItemSelected(3),
            ),
          ),
          Semantics(
            label: loc.a11ySettingsAi,
            button: true,
            child: _NavItem(
              label: loc.settingsAi,
              icon: Icons.smart_toy_outlined,
              isSelected: selectedIndex == 4,
              onTap: () => onItemSelected(4),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          decoration: BoxDecoration(
            color: isSelected
                ? theme.colorScheme.surfaceContainerHighest
                : Colors.transparent,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(4),
            child: InkWell(
              borderRadius: BorderRadius.circular(4),
              onTap: onTap,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    Icon(
                      icon,
                      size: 20,
                      color: isSelected
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      label,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight:
                            isSelected ? FontWeight.w600 : FontWeight.w500,
                        color: isSelected ? theme.colorScheme.primary : null,
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
