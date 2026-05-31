import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Placeholder login page for the desktop framework.
class _PlaceholderLoginPage extends StatelessWidget {
  const _PlaceholderLoginPage();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Login - Coming Soon'),
      ),
    );
  }
}

/// Placeholder chat page for the desktop framework.
class _PlaceholderChatPage extends StatelessWidget {
  const _PlaceholderChatPage();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Chat - Coming Soon'),
      ),
    );
  }
}

/// Placeholder settings page for the desktop framework.
class _PlaceholderSettingsPage extends StatelessWidget {
  const _PlaceholderSettingsPage();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Settings - Coming Soon'),
      ),
    );
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/chat',
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, __) => const _PlaceholderLoginPage(),
      ),
      GoRoute(
        path: '/chat',
        builder: (_, __) => const _PlaceholderChatPage(),
      ),
      GoRoute(
        path: '/settings',
        builder: (_, __) => const _PlaceholderSettingsPage(),
      ),
    ],
  );
});
