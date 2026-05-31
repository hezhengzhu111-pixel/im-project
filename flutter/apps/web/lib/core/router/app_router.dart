import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/features/auth/presentation/register_page.dart';
import 'package:im_web/features/chat/presentation/chat_page.dart';
import 'package:im_web/features/contacts/presentation/add_friend_page.dart';
import 'package:im_web/features/contacts/presentation/contacts_page.dart';
import 'package:im_web/features/group/presentation/create_group_page.dart';
import 'package:im_web/features/group/presentation/group_list_page.dart';
import 'package:im_web/features/moments/presentation/moments_main_page.dart';
import 'package:im_web/features/moments/presentation/notifications/moments_notifications_page.dart';
import 'package:im_web/features/settings/presentation/ai_settings_page.dart';
import 'package:im_web/features/settings/presentation/profile_page.dart';
import 'package:im_web/features/settings/presentation/settings_page.dart';
import 'package:im_web/features/debug/presentation/component_gallery_page.dart';
import 'package:im_web/features/auth/domain/auth_status.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';

import 'route_names.dart';
import 'route_resolver.dart';
import 'route_observer.dart';
export 'route_resolver.dart' show routeMetaMap, resolveRouteMeta;
import 'not_found_page.dart';

final _routerRefreshProvider = Provider<_RouterRefreshListenable>((ref) {
  final refresh = _RouterRefreshListenable();
  ref.listen<AuthState>(authStateProvider, (_, __) => refresh.refresh());
  ref.onDispose(refresh.dispose);
  return refresh;
});

final routerProvider = Provider<GoRouter>((ref) {
  final refreshListenable = ref.watch(_routerRefreshProvider);

  return GoRouter(
    initialLocation: '/chat',
    refreshListenable: refreshListenable,
    observers: [routeObserver],
    redirect: (context, state) {
      final authState = ref.read(authStateProvider);
      final isAuth = authState.isAuthenticated;
      final meta = resolveRouteMeta(state.uri.path);

      // No meta (e.g. 404 catch-all) -- let through
      if (meta == null) return null;

      // During startup, auth restoration is asynchronous. Do not redirect an
      // existing session to /login before restoreSession has checked storage.
      if (authState.status == AuthStatus.initial ||
          authState.status == AuthStatus.loading) {
        return null;
      }

      // hideForAuth: logged-in user on /login or /register -> /chat
      if (meta.hideForAuth && isAuth) return '/chat';

      // requiresAuth: not logged in -> /login?redirect=xxx
      if (meta.requiresAuth && !isAuth) {
        return '/login?redirect=${Uri.encodeComponent(state.uri.toString())}';
      }

      // permission: user lacks required permission -> /chat
      if (meta.permission != null) {
        if (!authState.permissions.contains(meta.permission!)) {
          return '/chat';
        }
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        name: RouteNames.login,
        builder: (_, __) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
        name: RouteNames.register,
        builder: (_, __) => const RegisterPage(),
      ),
      if (kDebugMode)
        GoRoute(
          path: '/debug/gallery',
          builder: (context, state) => const ComponentGalleryPage(),
        ),
      ShellRoute(
        builder: (context, state, child) {
          final l10n = AppLocalizations.of(context);
          final selectedIndex = _indexFromPath(state.uri.path);

          return ResponsiveScaffold(
            destinations: [
              ResponsiveNavDestination(
                icon: Icons.chat_outlined,
                selectedIcon: Icons.chat,
                label: l10n?.navChat ?? '聊天',
              ),
              ResponsiveNavDestination(
                icon: Icons.people_outlined,
                selectedIcon: Icons.people,
                label: l10n?.navContacts ?? '联系人',
              ),
              ResponsiveNavDestination(
                icon: Icons.group_outlined,
                selectedIcon: Icons.group,
                label: l10n?.navGroups ?? '群组',
              ),
              ResponsiveNavDestination(
                icon: Icons.camera_alt_outlined,
                selectedIcon: Icons.camera_alt,
                label: l10n?.navMoments ?? '朋友圈',
              ),
              ResponsiveNavDestination(
                icon: Icons.settings_outlined,
                selectedIcon: Icons.settings,
                label: l10n?.navSettings ?? '设置',
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
            builder: (_, state) {
              final sessionId = state.uri.queryParameters['sessionId'];
              return ChatPage(sessionId: sessionId);
            },
            routes: [
              GoRoute(
                path: ':sessionId',
                name: RouteNames.chatSession,
                builder: (_, state) {
                  final sessionId = state.pathParameters['sessionId']!;
                  return ChatPage(sessionId: sessionId);
                },
              ),
            ],
          ),
          GoRoute(
            path: '/contacts',
            name: RouteNames.contacts,
            builder: (_, __) => const ContactsPage(),
          ),
          GoRoute(
            path: '/contacts/add',
            name: RouteNames.contactsAdd,
            pageBuilder: (_, __) => NoTransitionPage(
              child: const AddFriendPage(),
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
            pageBuilder: (_, __) => NoTransitionPage(
              child: const CreateGroupPage(),
            ),
          ),
          GoRoute(
            path: '/moments',
            name: RouteNames.moments,
            builder: (_, state) {
              final postId = state.uri.queryParameters['postId'];
              return MomentsMainPage(postId: postId);
            },
          ),
          GoRoute(
            path: '/moments/notifications',
            name: RouteNames.momentsNotifications,
            pageBuilder: (_, __) => NoTransitionPage(
              child: const MomentsNotificationsPage(),
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
            pageBuilder: (_, __) => NoTransitionPage(
              child: const ProfilePage(),
            ),
          ),
          GoRoute(
            path: '/settings/ai',
            name: RouteNames.settingsAi,
            pageBuilder: (_, __) => NoTransitionPage(
              child: const AiSettingsPage(),
            ),
          ),
        ],
      ),
      // 404 catch-all -- must be last
      GoRoute(
        path: '/:pathMatch(.*)*',
        name: RouteNames.notFound,
        builder: (_, __) => const NotFoundPage(),
      ),
    ],
  );
});

class _RouterRefreshListenable extends ChangeNotifier {
  void refresh() => notifyListeners();
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
