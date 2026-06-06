import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_ui/im_ui.dart';

import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_shared_features/group.dart';
import 'package:im_shared_features/moments.dart';
import '../../features/settings/settings.dart';

final _routerRefreshProvider = Provider<RouterRefreshListenable>((ref) {
  final refresh = RouterRefreshListenable();
  ref.listen(authStateProvider, (_, __) {
    refresh.refresh();
  });
  ref.onDispose(refresh.dispose);
  return refresh;
});

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);
  final refreshListenable = ref.watch(_routerRefreshProvider);

  return GoRouter(
    initialLocation: '/chat',
    refreshListenable: refreshListenable,
    redirect: (context, state) {
      return authGuardRedirect(
        isAuthenticated: authState.isAuthenticated,
        isLoading: authState.isLoading,
        currentPath: state.uri.path,
        permissions: authState.permissions,
      );
    },
    routes: [
      GoRoute(
        path: '/login',
        name: RouteNames.login,
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
        name: RouteNames.register,
        builder: (context, state) => const RegisterPage(),
      ),
      ShellRoute(
        builder: (context, state, child) {
          final selectedIndex = _indexFromPath(state.uri.path);

          return ResponsiveScaffold(
            destinations: const [
              ResponsiveNavDestination(
                icon: Icons.chat_outlined,
                selectedIcon: Icons.chat,
                label: 'Chat',
              ),
              ResponsiveNavDestination(
                icon: Icons.people_outlined,
                selectedIcon: Icons.people,
                label: 'Contacts',
              ),
              ResponsiveNavDestination(
                icon: Icons.group_outlined,
                selectedIcon: Icons.group,
                label: 'Groups',
              ),
              ResponsiveNavDestination(
                icon: Icons.camera_alt_outlined,
                selectedIcon: Icons.camera_alt,
                label: 'Moments',
              ),
              ResponsiveNavDestination(
                icon: Icons.settings_outlined,
                selectedIcon: Icons.settings,
                label: 'Settings',
              ),
            ],
            selectedIndex: selectedIndex,
            onDestinationSelected: (index) => _onNavigate(context, index),
            child: child,
          );
        },
        routes: [
          GoRoute(
            path: '/chat',
            name: RouteNames.chat,
            builder: (_, state) => const ChatPage(),
          ),
          GoRoute(
            path: '/contacts',
            name: RouteNames.contacts,
            builder: (_, __) => const ContactsPage(),
          ),
          GoRoute(
            path: '/contacts/add',
            name: RouteNames.contactsAdd,
            pageBuilder: (_, __) => const NoTransitionPage(
              child: _PlaceholderPage(title: 'Add Friend'),
            ),
          ),
          GoRoute(
            path: '/groups',
            name: RouteNames.groups,
            builder: (_, __) => const GroupListPage(),
          ),
          GoRoute(
            path: '/groups/create',
            name: RouteNames.groupsCreate,
            pageBuilder: (_, __) => const NoTransitionPage(
              child: _PlaceholderPage(title: 'Create Group'),
            ),
          ),
          GoRoute(
            path: '/moments',
            name: RouteNames.moments,
            builder: (_, __) => const MomentsMainPage(),
          ),
          GoRoute(
            path: '/moments/notifications',
            name: RouteNames.momentsNotifications,
            pageBuilder: (_, __) => const NoTransitionPage(
              child: _PlaceholderPage(title: 'Notifications'),
            ),
          ),
          GoRoute(
            path: '/settings',
            name: RouteNames.settings,
            builder: (_, __) => const SettingsPage(),
          ),
          GoRoute(
            path: '/settings/profile',
            name: RouteNames.settingsProfile,
            pageBuilder: (_, __) => const NoTransitionPage(
              child: _PlaceholderPage(title: 'Profile'),
            ),
          ),
          GoRoute(
            path: '/settings/ai',
            name: RouteNames.settingsAi,
            pageBuilder: (_, __) => const NoTransitionPage(
              child: _PlaceholderPage(title: 'AI Settings'),
            ),
          ),
        ],
      ),
      // 404 catch-all -- must be last
      GoRoute(
        path: '/:pathMatch(.*)*',
        name: RouteNames.notFound,
        builder: (_, __) => const _PlaceholderPage(title: '404 Not Found'),
      ),
    ],
  );
});

/// Temporary placeholder page for routes not yet implemented.
class _PlaceholderPage extends StatelessWidget {
  const _PlaceholderPage({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        title,
        style: Theme.of(context).textTheme.headlineMedium,
      ),
    );
  }
}

int _indexFromPath(String path) {
  if (path.startsWith('/chat')) return 0;
  if (path.startsWith('/contacts')) return 1;
  if (path.startsWith('/groups')) return 2;
  if (path.startsWith('/moments')) return 3;
  if (path.startsWith('/settings')) return 4;
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
    default:
      assert(false, 'Unexpected navigation index: $index');
  }
}
