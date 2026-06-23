import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';

/// A shared navigation shell used by the Web and Desktop apps.
///
/// It wraps [ResponsiveScaffold] from `im_ui` and provides a single source of
/// truth for the main navigation destinations, their icons, localized labels,
/// and route mapping.
class NavigationShell extends StatelessWidget {
  const NavigationShell({
    required this.child,
    super.key,
  });

  final Widget child;

  static const _routes = [
    '/chat',
    '/contacts',
    '/groups',
    '/moments',
    '/settings',
  ];

  int _indexFromPath(String path) {
    if (path.startsWith('/chat')) return 0;
    if (path.startsWith('/contacts')) return 1;
    if (path.startsWith('/groups')) return 2;
    if (path.startsWith('/moments')) return 3;
    if (path.startsWith('/settings')) return 4;
    return 0;
  }

  void _onDestinationSelected(BuildContext context, int index) {
    final route = _routes[index];
    context.go(route);
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final path = GoRouterState.of(context).uri.path;
    final selectedIndex = _indexFromPath(path);

    return ResponsiveScaffold(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) => _onDestinationSelected(context, index),
      destinations: [
        ResponsiveNavDestination(
          icon: Icons.chat_outlined,
          selectedIcon: Icons.chat,
          label: loc.navChat,
        ),
        ResponsiveNavDestination(
          icon: Icons.people_outlined,
          selectedIcon: Icons.people,
          label: loc.navContacts,
        ),
        ResponsiveNavDestination(
          icon: Icons.group_outlined,
          selectedIcon: Icons.group,
          label: loc.navGroups,
        ),
        ResponsiveNavDestination(
          icon: Icons.camera_alt_outlined,
          selectedIcon: Icons.camera_alt,
          label: loc.navMoments,
        ),
        ResponsiveNavDestination(
          icon: Icons.settings_outlined,
          selectedIcon: Icons.settings,
          label: loc.navSettings,
        ),
      ],
      child: child,
    );
  }
}
