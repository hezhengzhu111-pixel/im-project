import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/im_ui.dart';

import '../../features/auth/auth.dart';
import '../../features/chat/chat.dart';
import '../../features/contacts/contacts.dart';
import '../../features/group/group.dart';
import '../../features/moments/moments.dart';
import '../../features/settings/settings.dart';
import 'route_names.dart';

/// Route metadata for auth guards.
class RouteMeta {
  const RouteMeta({
    required this.title,
    this.requiresAuth = true,
    this.hideForAuth = false,
    this.permission,
  });

  final String title;
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;
}

/// Simplified auth state for mobile router redirects.
/// The real auth provider will be implemented in the auth feature.
class MobileAuthState {
  const MobileAuthState({
    this.isAuthenticated = false,
    this.isLoading = true,
    this.permissions = const [],
  });

  final bool isAuthenticated;
  final bool isLoading;
  final List<String> permissions;
}

/// Auth state provider - will be replaced by the real auth provider.
final mobileAuthStateProvider =
    StateProvider<MobileAuthState>((ref) => const MobileAuthState());

/// Route metadata map for redirect logic.
final routeMetaMap = <String, RouteMeta>{
  '/login': const RouteMeta(
    title: 'Login',
    requiresAuth: false,
    hideForAuth: true,
  ),
  '/register': const RouteMeta(
    title: 'Register',
    requiresAuth: false,
    hideForAuth: true,
  ),
  '/chat': const RouteMeta(title: 'Chat'),
  '/contacts': const RouteMeta(title: 'Contacts'),
  '/contacts/add': const RouteMeta(title: 'Add Friend'),
  '/groups': const RouteMeta(title: 'Groups'),
  '/groups/create': const RouteMeta(title: 'Create Group'),
  '/moments': const RouteMeta(title: 'Moments'),
  '/moments/notifications': const RouteMeta(title: 'Notifications'),
  '/settings': const RouteMeta(title: 'Settings'),
  '/settings/profile': const RouteMeta(title: 'Profile'),
  '/settings/ai': const RouteMeta(title: 'AI Settings'),
};

/// Resolve [RouteMeta] for a given location by longest-prefix match.
RouteMeta? resolveRouteMeta(String location) {
  if (routeMetaMap.containsKey(location)) {
    return routeMetaMap[location];
  }
  var bestMatch = '';
  for (final key in routeMetaMap.keys) {
    if (location.startsWith(key) &&
        key.length > bestMatch.length &&
        (key.length == location.length || location[key.length] == '/')) {
      bestMatch = key;
    }
  }
  return bestMatch.isEmpty ? null : routeMetaMap[bestMatch];
}

final _routerRefreshProvider = Provider<_RouterRefreshListenable>((ref) {
  final refresh = _RouterRefreshListenable();
  ref.listen<MobileAuthState>(mobileAuthStateProvider, (_, __) {
    refresh.refresh();
  });
  ref.onDispose(refresh.dispose);
  return refresh;
});

final routerProvider = Provider<GoRouter>((ref) {
  final refreshListenable = ref.watch(_routerRefreshProvider);

  return GoRouter(
    initialLocation: '/chat',
    refreshListenable: refreshListenable,
    redirect: (context, state) {
      final authState = ref.read(mobileAuthStateProvider);
      final isAuth = authState.isAuthenticated;
      final meta = resolveRouteMeta(state.uri.path);

      // No meta (e.g. 404 catch-all) -- let through
      if (meta == null) return null;

      // During startup, auth restoration is asynchronous.
      if (authState.isLoading) return null;

      // hideForAuth: logged-in user on /login or /register -> /chat
      if (meta.hideForAuth && isAuth) return '/chat';

      // requiresAuth: not logged in -> /login
      if (meta.requiresAuth && !isAuth) {
        return '/login?redirect=${Uri.encodeComponent(state.uri.toString())}';
      }

      // permission: user lacks required permission -> /chat
      if (meta.permission != null &&
          !authState.permissions.contains(meta.permission!)) {
        return '/chat';
      }

      return null;
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

class _RouterRefreshListenable extends ChangeNotifier {
  void refresh() => notifyListeners();
}

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
