import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/l10n/app_localizations.dart';

class MobileShell extends StatelessWidget {
  const MobileShell({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final currentIndex = _indexFromLocation(location);
    final loc = AppLocalizations.of(context)!;

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (index) => _onTap(context, index),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.chat_bubble_outline), selectedIcon: const Icon(Icons.chat_bubble), label: loc.navChat),
          NavigationDestination(icon: const Icon(Icons.contacts_outlined), selectedIcon: const Icon(Icons.contacts), label: loc.navContacts),
          NavigationDestination(icon: const Icon(Icons.group_outlined), selectedIcon: const Icon(Icons.group), label: loc.navGroups),
          NavigationDestination(icon: const Icon(Icons.photo_library_outlined), selectedIcon: const Icon(Icons.photo_library), label: loc.navMoments),
          NavigationDestination(icon: const Icon(Icons.settings_outlined), selectedIcon: const Icon(Icons.settings), label: loc.navSettings),
        ],
      ),
    );
  }

  int _indexFromLocation(String location) {
    if (location.startsWith('/chat')) return 0;
    if (location.startsWith('/contacts')) return 1;
    if (location.startsWith('/groups')) return 2;
    if (location.startsWith('/moments')) return 3;
    if (location.startsWith('/settings')) return 4;
    return 0;
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0: context.go('/chat');
      case 1: context.go('/contacts');
      case 2: context.go('/groups');
      case 3: context.go('/moments');
      case 4: context.go('/settings');
    }
  }
}
