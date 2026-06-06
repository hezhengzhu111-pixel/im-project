import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_shared_features/src/auth/auth.dart';
import 'package:im_shared_features/src/chat/chat.dart';
import 'package:im_shared_features/src/contacts/contacts.dart';
import 'package:im_shared_features/src/group/group.dart';
import 'package:im_shared_features/src/moments/moments.dart';
import 'package:im_desktop/features/settings/settings.dart';
import '../shell/main_shell.dart';

// 路由名称常量
class RouteNames {
  static const login = 'login';
  static const register = 'register';
  static const chat = 'chat';
  static const contacts = 'contacts';
  static const groups = 'groups';
  static const settings = 'settings';
  static const profile = 'profile';
  static const moments = 'moments';
}

// 路由配置
final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/chat',
    redirect: (context, state) {
      final isLoggedIn = authState.isAuthenticated;
      final isLoginRoute = state.uri.path == '/login';
      final isRegisterRoute = state.uri.path == '/register';

      // 未登录且不在登录/注册页，跳转到登录页
      if (!isLoggedIn && !isLoginRoute && !isRegisterRoute) {
        return '/login';
      }

      // 已登录且在登录页，跳转到聊天页
      if (isLoggedIn && isLoginRoute) {
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
            path: '/groups',
            name: RouteNames.groups,
            builder: (context, state) => const GroupListPage(),
          ),
          GoRoute(
            path: '/moments',
            name: RouteNames.moments,
            builder: (context, state) => const MomentsMainPage(),
          ),
          GoRoute(
            path: '/settings',
            name: RouteNames.settings,
            builder: (context, state) => const SettingsPage(),
          ),
        ],
      ),
    ],
  );
});
