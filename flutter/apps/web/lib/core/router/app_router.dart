import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_shared_features/navigation.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/features/auth/presentation/register_page.dart';
import 'package:im_web/features/chat/presentation/chat_page.dart';
import 'package:im_web/features/contacts/presentation/contacts_page.dart';
import 'package:im_web/features/group/presentation/group_list_page.dart';
import 'package:im_web/features/moments/presentation/moments_main_page.dart';
import 'package:im_web/features/settings/presentation/settings_page.dart';

// Low-frequency pages loaded as separate JS chunks to reduce initial bundle.
import 'package:im_web/features/contacts/presentation/add_friend_page.dart'
    deferred as add_friend_page;
import 'package:im_web/features/group/presentation/create_group_page.dart'
    deferred as create_group_page;
import 'package:im_web/features/moments/presentation/notifications/moments_notifications_page.dart'
    deferred as moments_notifications_page;
import 'package:im_web/features/settings/presentation/ai_settings_page.dart'
    deferred as ai_settings_page;
import 'package:im_web/features/settings/presentation/profile_page.dart'
    deferred as profile_page;

import 'deferred_route_page.dart';
import 'package:im_web/features/debug/presentation/component_gallery_page.dart';
import 'package:im_web/features/auth/domain/auth_status.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';

import 'route_names.dart';
import 'route_resolver.dart';
import 'route_observer.dart';
export 'route_resolver.dart' show routeMetaMap, resolveRouteMeta;
import 'not_found_page.dart';
import 'forbidden_page.dart';

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

      // permission: user lacks required permission -> /forbidden
      if (meta.permission != null) {
        if (!authState.permissions.contains(meta.permission!)) {
          return '/forbidden';
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
          return _ProtectedShellGate(
            location: state.uri.toString(),
            child: NavigationShell(child: child),
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
              child: DeferredRoutePage(
                loadLibrary: add_friend_page.loadLibrary,
                builder: () => add_friend_page.AddFriendPage(),
              ),
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
              child: DeferredRoutePage(
                loadLibrary: create_group_page.loadLibrary,
                builder: () => create_group_page.CreateGroupPage(),
              ),
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
              child: DeferredRoutePage(
                loadLibrary: moments_notifications_page.loadLibrary,
                builder: () => moments_notifications_page.MomentsNotificationsPage(),
              ),
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
              child: DeferredRoutePage(
                loadLibrary: profile_page.loadLibrary,
                builder: () => profile_page.ProfilePage(),
              ),
            ),
          ),
          GoRoute(
            path: '/settings/ai',
            name: RouteNames.settingsAi,
            pageBuilder: (_, __) => NoTransitionPage(
              child: DeferredRoutePage(
                loadLibrary: ai_settings_page.loadLibrary,
                builder: () => ai_settings_page.AiSettingsPage(),
              ),
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/forbidden',
        name: RouteNames.forbidden,
        builder: (_, __) => const ForbiddenPage(),
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

class _ProtectedShellGate extends ConsumerWidget {
  const _ProtectedShellGate({
    required this.location,
    required this.child,
  });

  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    if (authState.status == AuthStatus.initial ||
        authState.status == AuthStatus.loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!authState.isAuthenticated) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        context.go('/login?redirect=${Uri.encodeComponent(location)}');
      });
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return child;
  }
}

class _RouterRefreshListenable extends ChangeNotifier {
  void refresh() => notifyListeners();
}
