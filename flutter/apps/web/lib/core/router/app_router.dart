import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/responsive/breakpoints.dart';
import 'package:im_web/core/responsive/mobile_shell.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/features/auth/presentation/register_page.dart';
import 'package:im_web/features/chat/presentation/chat_page.dart';
import 'package:im_web/features/contacts/presentation/contacts_page.dart';
import 'package:im_web/features/group/presentation/group_list_page.dart';
import 'package:im_web/features/moments/presentation/moments_main_page.dart';
import 'package:im_web/features/settings/presentation/settings_page.dart';

// Deferred imports for low-frequency routes
import 'package:im_web/features/contacts/presentation/add_friend_page.dart'
    deferred as add_friend_page;
import 'package:im_web/features/group/presentation/create_group_page.dart'
    deferred as create_group_page;
import 'package:im_web/features/moments/presentation/notifications/moments_notifications_page.dart'
    deferred as notifications_page;
import 'package:im_web/features/settings/presentation/profile_page.dart'
    deferred as profile_page;
import 'package:im_web/features/settings/presentation/ai_settings_page.dart'
    deferred as ai_settings_page;

import 'deferred_route_page.dart';
import 'route_meta.dart';
import 'route_names.dart';
import 'route_resolver.dart';
export 'route_resolver.dart' show routeMetaMap, resolveRouteMeta;
import 'not_found_page.dart';
import 'permission_provider.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/chat',
    redirect: (context, state) {
      final isAuth = authState.isAuthenticated;
      final meta = resolveRouteMeta(state.uri.path);

      // No meta (e.g. 404 catch-all) -- let through
      if (meta == null) return null;

      // hideForAuth: logged-in user on /login or /register -> /chat
      if (meta.hideForAuth && isAuth) return '/chat';

      // requiresAuth: not logged in -> /login?redirect=xxx
      if (meta.requiresAuth && !isAuth) {
        return '/login?redirect=${Uri.encodeComponent(state.uri.toString())}';
      }

      // permission: user lacks required permission -> /chat
      if (meta.permission != null) {
        final hasPerm = ref
            .read(permissionProvider.notifier)
            .hasPermission(meta.permission!);
        if (!hasPerm) return '/chat';
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
      ShellRoute(
        builder: (_, __, child) => ResponsiveLayout(
          mobile: (_) => MobileShell(child: child),
          desktop: (_) => MainLayout(child: child),
        ),
        routes: [
          GoRoute(
            path: '/chat',
            name: RouteNames.chat,
            builder: (_, __) => const ChatPage(),
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
            builder: (_, __) => const MomentsMainPage(),
          ),
          GoRoute(
            path: '/moments/notifications',
            name: RouteNames.momentsNotifications,
            pageBuilder: (_, __) => NoTransitionPage(
              child: DeferredRoutePage(
                loadLibrary: notifications_page.loadLibrary,
                builder: () => notifications_page.MomentsNotificationsPage(),
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
      // 404 catch-all -- must be last
      GoRoute(
        path: '/:pathMatch(.*)*',
        name: RouteNames.notFound,
        builder: (_, __) => const NotFoundPage(),
      ),
    ],
  );
});

class MainLayout extends ConsumerWidget {
  const MainLayout({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

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
            destinations: [
              NavigationRailDestination(
                icon: const Icon(Icons.chat_outlined),
                selectedIcon: const Icon(Icons.chat),
                label: Text(l10n.navChat),
              ),
              NavigationRailDestination(
                icon: const Icon(Icons.people_outlined),
                selectedIcon: const Icon(Icons.people),
                label: Text(l10n.navContacts),
              ),
              NavigationRailDestination(
                icon: const Icon(Icons.group_outlined),
                selectedIcon: const Icon(Icons.group),
                label: Text(l10n.navGroups),
              ),
              NavigationRailDestination(
                icon: const Icon(Icons.camera_alt_outlined),
                selectedIcon: const Icon(Icons.camera_alt),
                label: Text(l10n.navMoments),
              ),
              NavigationRailDestination(
                icon: const Icon(Icons.settings_outlined),
                selectedIcon: const Icon(Icons.settings),
                label: Text(l10n.navSettings),
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
