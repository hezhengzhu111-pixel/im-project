import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_shared_features/group.dart';
import 'package:im_shared_features/moments.dart';
import 'package:im_desktop/features/settings/settings.dart';
import '../shell/main_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/chat',
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
          return MainShell(child: child);
        },
        routes: [
          GoRoute(
            path: '/chat',
            name: RouteNames.chat,
            builder: (context, state) => const ChatPage(),
          ),
          GoRoute(
            path: '/contacts',
            name: RouteNames.contacts,
            builder: (context, state) => const ContactsPage(),
          ),
          GoRoute(
            path: '/contacts/add',
            name: RouteNames.contactsAdd,
            builder: (context, state) => const AddFriendPage(),
          ),
          GoRoute(
            path: '/groups',
            name: RouteNames.groups,
            builder: (context, state) => const GroupListPage(),
          ),
          GoRoute(
            path: '/groups/create',
            name: RouteNames.groupsCreate,
            builder: (context, state) => const CreateGroupPage(),
          ),
          GoRoute(
            path: '/moments',
            name: RouteNames.moments,
            builder: (context, state) => const MomentsMainPage(),
          ),
          GoRoute(
            path: '/moments/notifications',
            name: RouteNames.momentsNotifications,
            builder: (context, state) => const MomentsNotificationsPage(),
          ),
          GoRoute(
            path: '/settings',
            name: RouteNames.settings,
            builder: (context, state) => const SettingsPage(),
          ),
          GoRoute(
            path: '/settings/profile',
            name: RouteNames.settingsProfile,
            builder: (context, state) => const ProfileSettingsPage(),
          ),
          GoRoute(
            path: '/settings/ai',
            name: RouteNames.settingsAi,
            builder: (context, state) => const AiSettingsPage(),
          ),
        ],
      ),
      // 404 catch-all -- must be last
      GoRoute(
        path: '/:pathMatch(.*)*',
        name: RouteNames.notFound,
        builder: (_, __) => Scaffold(
          appBar: AppBar(title: const Text('404')),
          body: const Center(
            child: Text(
              'Page not found',
              style: TextStyle(fontSize: 24),
            ),
          ),
        ),
      ),
    ],
  );
});
