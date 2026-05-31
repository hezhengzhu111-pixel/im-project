import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_desktop/features/auth/auth.dart';

// 路由名称常量
class RouteNames {
  static const login = 'login';
  static const register = 'register';
  static const chat = 'chat';
  static const contacts = 'contacts';
  static const groups = 'groups';
  static const settings = 'settings';
  static const profile = 'profile';
}

// 占位页面
class ChatPage extends StatelessWidget {
  const ChatPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Chat Page'),
      ),
    );
  }
}

class ContactsPage extends StatelessWidget {
  const ContactsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Contacts Page'),
      ),
    );
  }
}

class GroupsPage extends StatelessWidget {
  const GroupsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Groups Page'),
      ),
    );
  }
}

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Settings Page'),
      ),
    );
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Profile Page'),
      ),
    );
  }
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
        builder: (context, state) => const GroupsPage(),
      ),
      GoRoute(
        path: '/settings',
        name: RouteNames.settings,
        builder: (context, state) => const SettingsPage(),
      ),
      GoRoute(
        path: '/profile',
        name: RouteNames.profile,
        builder: (context, state) => const ProfilePage(),
      ),
    ],
  );
});
