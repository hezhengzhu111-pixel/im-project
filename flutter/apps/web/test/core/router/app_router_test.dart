import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/route_meta.dart';
import 'package:im_web/core/router/route_names.dart';
import 'package:im_web/core/router/route_resolver.dart';
import 'package:im_web/core/router/route_registry.dart';

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
      expect(RouteNames.forbidden, 'forbidden');
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
        RouteNames.forbidden,
      ];
      expect(names.toSet().length, names.length);
    });
  });

  group('Debug routes', () {
    test('debug/gallery not in routeRegistry (release-safe)', () {
      expect(routeRegistry.containsKey('/debug/gallery'), isFalse);
    });
  });

  group('routeMetaMap', () {
    test('contains all expected routes including /forbidden', () {
      expect(routeMetaMap.length, 13);
      expect(routeMetaMap.containsKey('/login'), isTrue);
      expect(routeMetaMap.containsKey('/chat'), isTrue);
      expect(routeMetaMap.containsKey('/settings'), isTrue);
      expect(routeMetaMap.containsKey('/forbidden'), isTrue);
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

    test('/forbidden does not require auth', () {
      final meta = routeMetaMap['/forbidden']!;
      expect(meta.requiresAuth, isFalse);
    });
  });

  group('resolveRouteMeta', () {
    test('returns exact match for /login', () {
      final meta = resolveRouteMeta('/login');
      expect(meta, isNotNull);
      expect(meta!.title, 'seoLoginTitle');
    });

    test('returns meta for /chat', () {
      final meta = resolveRouteMeta('/chat');
      expect(meta, isNotNull);
      expect(meta!.title, 'seoChatTitle');
    });

    test('resolves /chat/abc123 to /chat meta (deep link)', () {
      final meta = resolveRouteMeta('/chat/abc123');
      expect(meta, isNotNull);
      expect(meta!.title, 'seoChatTitle');
    });

    test('returns meta for /forbidden', () {
      final meta = resolveRouteMeta('/forbidden');
      expect(meta, isNotNull);
      expect(meta!.title, 'seoForbiddenTitle');
    });

    test('returns null for unknown path (404)', () {
      final meta = resolveRouteMeta('/unknown-page');
      expect(meta, isNull);
    });

    test('does not match /contacts as /contacts/add', () {
      final meta = resolveRouteMeta('/contacts');
      expect(meta, isNotNull);
      expect(meta!.title, 'seoContactsTitle');
    });
  });

  group('Redirect logic simulation', () {
    test('requiresAuth redirects unauthenticated user with redirect param',
        () {
      const meta = RouteMeta(title: 'Chat');
      const isAuth = false;
      const originalPath = '/chat/session123';

      String? result;
      if (meta.requiresAuth && !isAuth) {
        result =
            '/login?redirect=${Uri.encodeComponent(originalPath)}';
      }

      expect(result, contains('/login?redirect='));
      expect(result, contains(Uri.encodeComponent(originalPath)));
    });

    test('redirect parameter is preserved in login URL', () {
      const targetPath = '/settings/profile';
      final encoded = Uri.encodeComponent(targetPath);
      final loginUrl = '/login?redirect=$encoded';

      final uri = Uri.parse(loginUrl);
      expect(uri.queryParameters['redirect'], targetPath);
    });

    test('permission guard redirects to /forbidden when permission missing',
        () {
      const meta = RouteMeta(title: 'Admin', permission: 'admin:read');
      final userPermissions = <String>{};

      String? result;
      if (meta.permission != null &&
          !userPermissions.contains(meta.permission)) {
        result = '/forbidden';
      }

      expect(result, '/forbidden');
    });

    test('permission guard allows when permission present', () {
      const meta = RouteMeta(title: 'Admin', permission: 'admin:read');
      final userPermissions = {'admin:read'};

      String? result;
      if (meta.permission != null &&
          !userPermissions.contains(meta.permission)) {
        result = '/forbidden';
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

  group('Meta updates with route changes', () {
    test('meta differs between /chat and /settings', () {
      final chatMeta = resolveRouteMeta('/chat')!;
      final settingsMeta = resolveRouteMeta('/settings')!;
      expect(chatMeta.title, isNot(equals(settingsMeta.title)));
    });

    test('/forbidden meta resolves independently', () {
      final forbiddenMeta = resolveRouteMeta('/forbidden')!;
      final chatMeta = resolveRouteMeta('/chat')!;
      expect(forbiddenMeta.title, isNot(equals(chatMeta.title)));
    });
  });
}
