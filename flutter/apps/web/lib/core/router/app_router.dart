import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/error/error_notifier.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/features/auth/presentation/register_page.dart';
import 'package:im_web/features/chat/presentation/chat_page.dart';
import 'package:im_web/features/contacts/presentation/contacts_page.dart';
import 'package:im_web/features/contacts/presentation/add_friend_page.dart';
import 'package:im_web/features/group/presentation/group_list_page.dart';
import 'package:im_web/features/group/presentation/create_group_page.dart';
import 'package:im_web/features/moments/presentation/moments_main_page.dart';
import 'package:im_web/features/moments/presentation/notifications/moments_notifications_page.dart';
import 'package:im_web/features/settings/presentation/settings_page.dart';
import 'package:im_web/features/settings/presentation/profile_page.dart';
import 'package:im_web/features/settings/presentation/ai_settings_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/chat',
    redirect: (context, state) {
      final isAuth = authState.isAuthenticated;
      final isLoginRoute = state.uri.path == '/login' ||
          state.uri.path == '/register';

      // If not authenticated and not on auth pages, redirect to login
      if (!isAuth && !isLoginRoute) return '/login';

      // If authenticated and on auth pages, redirect to chat
      if (isAuth && isLoginRoute) return '/chat';

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterPage()),
      ShellRoute(
        builder: (_, __, child) => MainLayout(child: child),
        routes: [
          GoRoute(path: '/chat', builder: (_, __) => const ChatPage()),
          GoRoute(
              path: '/contacts', builder: (_, __) => const ContactsPage()),
          GoRoute(
              path: '/contacts/add',
              builder: (_, __) => const AddFriendPage()),
          GoRoute(
              path: '/groups', builder: (_, __) => const GroupListPage()),
          GoRoute(
              path: '/groups/create',
              builder: (_, __) => const CreateGroupPage()),
          GoRoute(
              path: '/moments', builder: (_, __) => const MomentsMainPage()),
          GoRoute(
              path: '/moments/notifications',
              builder: (_, __) => const MomentsNotificationsPage()),
          GoRoute(
              path: '/settings', builder: (_, __) => const SettingsPage()),
          GoRoute(
              path: '/settings/profile',
              builder: (_, __) => const ProfilePage()),
          GoRoute(
              path: '/settings/ai',
              builder: (_, __) => const AiSettingsPage()),
        ],
      ),
    ],
  );
});

class MainLayout extends ConsumerWidget {
  const MainLayout({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<ErrorState>(errorProvider, (prev, next) {
      if (next.message != null && next.message != prev?.message) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.message!),
            duration: const Duration(seconds: 3),
          ),
        );
        ref.read(errorProvider.notifier).clear();
      }
    });

    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _selectedIndex(context),
            onDestinationSelected: (index) => _onNavigate(context, index),
            labelType: NavigationRailLabelType.all,
            destinations: const [
              NavigationRailDestination(
                icon: Icon(Icons.chat_outlined),
                selectedIcon: Icon(Icons.chat),
                label: Text('聊天'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.people_outlined),
                selectedIcon: Icon(Icons.people),
                label: Text('联系人'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.group_outlined),
                selectedIcon: Icon(Icons.group),
                label: Text('群组'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.camera_alt_outlined),
                selectedIcon: Icon(Icons.camera_alt),
                label: Text('朋友圈'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.settings_outlined),
                selectedIcon: Icon(Icons.settings),
                label: Text('设置'),
              ),
            ],
          ),
          const VerticalDivider(thickness: 1, width: 1),
          Expanded(child: child),
        ],
      ),
    );
  }

  int _selectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    if (location.startsWith('/chat')) return 0;
    if (location.startsWith('/contacts')) return 1;
    if (location.startsWith('/groups')) return 2;
    if (location.startsWith('/moments')) return 3;
    if (location.startsWith('/settings')) return 4;
    return 0;
  }

  void _onNavigate(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/chat');
      case 1:
        context.go('/contacts');
      case 2:
        context.go('/groups');
      case 3:
        context.go('/moments');
      case 4:
        context.go('/settings');
    }
  }
}
