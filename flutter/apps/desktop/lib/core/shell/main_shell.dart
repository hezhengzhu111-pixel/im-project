import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class MainShell extends ConsumerStatefulWidget {
  final Widget child;

  const MainShell({super.key, required this.child});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  int _selectedIndex = 0;

  final _navItems = [
    _NavItem(icon: Icons.chat_outlined, selectedIcon: Icons.chat, label: '聊天', route: '/chat'),
    _NavItem(icon: Icons.people_outlined, selectedIcon: Icons.people, label: '联系人', route: '/contacts'),
    _NavItem(icon: Icons.group_outlined, selectedIcon: Icons.group, label: '群组', route: '/groups'),
    _NavItem(icon: Icons.camera_alt_outlined, selectedIcon: Icons.camera_alt, label: '朋友圈', route: '/moments'),
    _NavItem(icon: Icons.settings_outlined, selectedIcon: Icons.settings, label: '设置', route: '/settings'),
  ];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _updateSelectedIndex();
  }

  void _updateSelectedIndex() {
    final location = GoRouterState.of(context).uri.path;
    for (int i = 0; i < _navItems.length; i++) {
      if (location.startsWith(_navItems[i].route)) {
        if (_selectedIndex != i) {
          setState(() => _selectedIndex = i);
        }
        break;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          // Sidebar navigation
          Container(
            width: 72,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(
                right: BorderSide(
                  color: Theme.of(context).dividerColor,
                  width: 1,
                ),
              ),
            ),
            child: Column(
              children: [
                // App logo
                const SizedBox(height: 16),
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.blue,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.chat_bubble,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
                const SizedBox(height: 24),

                // Navigation items
                Expanded(
                  child: ListView.builder(
                    itemCount: _navItems.length,
                    itemBuilder: (context, index) {
                      final item = _navItems[index];
                      final isSelected = _selectedIndex == index;

                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        child: Material(
                          color: isSelected
                              ? Colors.blue.withAlpha(25)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                          child: InkWell(
                            onTap: () {
                              setState(() => _selectedIndex = index);
                              context.go(item.route);
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Column(
                                children: [
                                  Icon(
                                    isSelected ? item.selectedIcon : item.icon,
                                    color: isSelected ? Colors.blue : Colors.grey,
                                    size: 24,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    item.label,
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: isSelected ? Colors.blue : Colors.grey,
                                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),

                // User avatar
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: CircleAvatar(
                    radius: 20,
                    backgroundColor: Colors.grey[300],
                    child: const Icon(Icons.person, color: Colors.grey),
                  ),
                ),
              ],
            ),
          ),

          // Main content
          Expanded(
            child: widget.child,
          ),
        ],
      ),
    );
  }
}

class _NavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final String route;

  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.route,
  });
}
