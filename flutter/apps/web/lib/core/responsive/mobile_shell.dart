import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class MobileShell extends StatelessWidget {
  const MobileShell({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final currentIndex = _indexFromLocation(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (index) => _onTap(context, index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: '聊天'),
          NavigationDestination(icon: Icon(Icons.contacts_outlined), selectedIcon: Icon(Icons.contacts), label: '联系人'),
          NavigationDestination(icon: Icon(Icons.group_outlined), selectedIcon: Icon(Icons.group), label: '群组'),
          NavigationDestination(icon: Icon(Icons.photo_library_outlined), selectedIcon: Icon(Icons.photo_library), label: '朋友圈'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: '设置'),
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
