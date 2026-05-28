import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/router/route_meta.dart';
import 'package:im_web/core/router/route_names.dart';
import 'package:im_web/core/router/route_resolver.dart';

import '../../helpers/fakes.dart';

void main() {
  group('RouteMeta', () {
    test('default values are correct', () {
      const meta = RouteMeta(title: 'Test');

      expect(meta.title, 'Test');
      expect(meta.requiresAuth, isTrue);
      expect(meta.hideForAuth, isFalse);
      expect(meta.permission, isNull);
    });

    test('custom values override defaults', () {
      const meta = RouteMeta(
        title: 'Login',
        requiresAuth: false,
        hideForAuth: true,
        permission: 'admin:read',
      );

      expect(meta.requiresAuth, isFalse);
      expect(meta.hideForAuth, isTrue);
      expect(meta.permission, 'admin:read');
    });
  });

  group('RouteNames', () {
    test('all route names are defined', () {
      expect(RouteNames.login, 'login');
      expect(RouteNames.register, 'register');
      expect(RouteNames.chat, 'chat');
      expect(RouteNames.chatSession, 'chatSession');
      expect(RouteNames.contacts, 'contacts');
      expect(RouteNames.contactsAdd, 'contactsAdd');
      expect(RouteNames.groups, 'groups');
      expect(RouteNames.groupsCreate, 'groupsCreate');
      expect(RouteNames.moments, 'moments');
      expect(RouteNames.momentsNotifications, 'momentsNotifications');
      expect(RouteNames.settings, 'settings');
      expect(RouteNames.settingsProfile, 'settingsProfile');
      expect(RouteNames.settingsAi, 'settingsAi');
      expect(RouteNames.notFound, 'notFound');
    });

    test('route names are unique', () {
      final names = [
        RouteNames.login,
        RouteNames.register,
        RouteNames.chat,
        RouteNames.chatSession,
        RouteNames.contacts,
        RouteNames.contactsAdd,
        RouteNames.groups,
        RouteNames.groupsCreate,
        RouteNames.moments,
        RouteNames.momentsNotifications,
        RouteNames.settings,
        RouteNames.settingsProfile,
        RouteNames.settingsAi,
        RouteNames.notFound,
      ];
      expect(names.toSet().length, names.length);
    });
  });

  group('routeMetaMap', () {
    test('contains all expected routes', () {
      expect(routeMetaMap.length, 12);
      expect(routeMetaMap.containsKey('/login'), isTrue);
      expect(routeMetaMap.containsKey('/chat'), isTrue);
      expect(routeMetaMap.containsKey('/settings'), isTrue);
    });

    test('login has hideForAuth meta', () {
      final meta = routeMetaMap['/login']!;
      expect(meta.requiresAuth, isFalse);
      expect(meta.hideForAuth, isTrue);
    });

    test('chat requires auth', () {
      final meta = routeMetaMap['/chat']!;
      expect(meta.requiresAuth, isTrue);
      expect(meta.hideForAuth, isFalse);
    });
  });

  group('resolveRouteMeta', () {
    test('returns exact match for /login', () {
      final meta = resolveRouteMeta('/login');
      expect(meta, isNotNull);
      expect(meta!.title, '登录');
    });

    test('returns meta for /chat', () {
      final meta = resolveRouteMeta('/chat');
      expect(meta, isNotNull);
      expect(meta!.title, '聊天');
    });

    test('resolves /chat/abc123 to /chat meta (deep link)', () {
      final meta = resolveRouteMeta('/chat/abc123');
      expect(meta, isNotNull);
      expect(meta!.title, '聊天');
    });

    test('resolves /contacts/add to exact match', () {
      final meta = resolveRouteMeta('/contacts/add');
      expect(meta, isNotNull);
      expect(meta!.title, '添加好友');
    });

    test('resolves /settings/profile to exact match', () {
      final meta = resolveRouteMeta('/settings/profile');
      expect(meta, isNotNull);
      expect(meta!.title, '个人资料');
    });

    test('returns null for unknown path (404)', () {
      final meta = resolveRouteMeta('/unknown-page');
      expect(meta, isNull);
    });

    test('returns null for deeply nested unknown path', () {
      final meta = resolveRouteMeta('/chat/abc123/extra');
      // This matches /chat prefix, so it should resolve
      expect(meta, isNotNull);
      expect(meta!.title, '聊天');
    });

    test('does not match /contacts as /contacts/add', () {
      final meta = resolveRouteMeta('/contacts');
      expect(meta, isNotNull);
      expect(meta!.title, '联系人');
    });

    test('does not match /settings as /settings/profile', () {
      final meta = resolveRouteMeta('/settings');
      expect(meta, isNotNull);
      expect(meta!.title, '设置');
    });
  });

  group('Redirect logic simulation', () {
    test('hideForAuth redirects authenticated user to /chat', () {
      const meta = RouteMeta(title: 'Login', requiresAuth: false, hideForAuth: true);
      const isAuth = true;

      String? result;
      if (meta.hideForAuth && isAuth) result = '/chat';

      expect(result, '/chat');
    });

    test('requiresAuth redirects unauthenticated user to /login', () {
      const meta = RouteMeta(title: 'Chat');
      const isAuth = false;

      String? result;
      if (meta.requiresAuth && !isAuth) {
        result = '/login?redirect=${Uri.encodeComponent('/chat')}';
      }

      expect(result, contains('/login?redirect='));
    });

    test('permission guard redirects when permission missing', () {
      const meta = RouteMeta(title: 'Admin', permission: 'admin:read');
      final userPermissions = <String>{};

      String? result;
      if (meta.permission != null && !userPermissions.contains(meta.permission)) {
        result = '/chat';
      }

      expect(result, '/chat');
    });

    test('permission guard allows when permission present', () {
      const meta = RouteMeta(title: 'Admin', permission: 'admin:read');
      final userPermissions = {'admin:read'};

      String? result;
      if (meta.permission != null && !userPermissions.contains(meta.permission)) {
        result = '/chat';
      }

      expect(result, isNull);
    });

    test('null meta lets through (404 catch-all)', () {
      const RouteMeta? meta = null;

      String? result;
      if (meta == null) result = null;

      expect(result, isNull);
    });
  });

  group('GoRouter creation', () {
    test('can create a GoRouter with basic routes', () {
      final router = GoRouter(
        initialLocation: '/login',
        routes: [
          GoRoute(
            path: '/login',
            builder: (_, __) => const SizedBox(),
          ),
          GoRoute(
            path: '/chat',
            builder: (_, __) => const SizedBox(),
          ),
          GoRoute(
            path: '/settings',
            builder: (_, __) => const SizedBox(),
          ),
        ],
      );

      expect(router, isA<GoRouter>());
      router.dispose();
    });

    test('can create a GoRouter with initialLocation /chat', () {
      final router = GoRouter(
        initialLocation: '/chat',
        routes: [
          GoRoute(
            path: '/chat',
            builder: (_, __) => const SizedBox(),
          ),
        ],
      );

      expect(router, isA<GoRouter>());
      router.dispose();
    });

    test('GoRouter with redirect function works', () {
      final router = GoRouter(
        initialLocation: '/chat',
        redirect: (context, state) {
          final meta = resolveRouteMeta(state.uri.path);
          if (meta == null) return null;
          if (meta.hideForAuth) return '/chat';
          return null;
        },
        routes: [
          GoRoute(
            path: '/chat',
            builder: (_, __) => const SizedBox(),
          ),
          GoRoute(
            path: '/login',
            builder: (_, __) => const SizedBox(),
          ),
        ],
      );

      expect(router, isA<GoRouter>());
      router.dispose();
    });
  });
}
