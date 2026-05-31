import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

// 路由守卫 Provider
final routerAuthProvider = StateProvider<AuthState>((ref) => AuthState.initial);

class AuthState {
  final bool isAuthenticated;
  final String? userId;

  const AuthState({this.isAuthenticated = false, this.userId});

  static const initial = AuthState();

  AuthState copyWith({bool? isAuthenticated, String? userId}) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      userId: userId ?? this.userId,
    );
  }
}

// 占位页面
class LoginPage extends StatelessWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Login Page'),
      ),
    );
  }
}

class RegisterPage extends StatelessWidget {
  const RegisterPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Register Page'),
      ),
    );
  }
}

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
  final authState = ref.watch(routerAuthProvider);

  return GoRouter(
    initialLocation: '/chat',
    redirect: (context, state) {
      final isLoggedIn = authState.isAuthenticated;
      final isLoginRoute = state.uri.path == '/login';

      // 未登录且不在登录页，跳转到登录页
      if (!isLoggedIn && !isLoginRoute) {
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
