import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/route_registry.dart';
import 'package:im_web/core/router/route_resolver.dart';

void main() {
  group('RouteEntry', () {
    test('constructs with required fields', () {
      const entry = RouteEntry(
        titleKey: 'seoLoginTitle',
        descriptionKey: 'seoLoginDescription',
      );
      expect(entry.titleKey, 'seoLoginTitle');
      expect(entry.descriptionKey, 'seoLoginDescription');
      expect(entry.requiresAuth, isTrue);
      expect(entry.hideForAuth, isFalse);
      expect(entry.permission, isNull);
      expect(entry.ogImage, isNull);
      expect(entry.ogType, isNull);
    });

    test('constructs with all fields', () {
      const entry = RouteEntry(
        titleKey: 'seoLoginTitle',
        requiresAuth: false,
        hideForAuth: true,
        permission: 'admin:read',
        descriptionKey: 'seoLoginDescription',
        ogImage: 'custom.png',
        ogType: 'article',
      );
      expect(entry.requiresAuth, isFalse);
      expect(entry.hideForAuth, isTrue);
      expect(entry.permission, 'admin:read');
      expect(entry.ogImage, 'custom.png');
      expect(entry.ogType, 'article');
    });
  });

  group('routeRegistry', () {
    test('contains all 12 routes', () {
      expect(routeRegistry.length, 12);
    });

    test('all entries have titleKey and descriptionKey', () {
      for (final entry in routeRegistry.values) {
        expect(entry.titleKey, isNotEmpty);
        expect(entry.descriptionKey, isNotEmpty);
      }
    });

    test('/login and /register have hideForAuth', () {
      expect(routeRegistry['/login']!.hideForAuth, isTrue);
      expect(routeRegistry['/register']!.hideForAuth, isTrue);
      expect(routeRegistry['/login']!.requiresAuth, isFalse);
      expect(routeRegistry['/register']!.requiresAuth, isFalse);
    });

    test('debug/gallery not in registry', () {
      expect(routeRegistry.containsKey('/debug/gallery'), isFalse);
    });

    test('all 12 expected routes exist', () {
      const expectedPaths = [
        '/login',
        '/register',
        '/chat',
        '/contacts',
        '/contacts/add',
        '/groups',
        '/groups/create',
        '/moments',
        '/moments/notifications',
        '/settings',
        '/settings/profile',
        '/settings/ai',
      ];
      for (final path in expectedPaths) {
        expect(routeRegistry.containsKey(path), isTrue,
            reason: 'Missing: $path');
      }
    });
  });

  group('routeMetaMap consistency', () {
    test('routeMetaMap keys match routeRegistry keys', () {
      expect(routeMetaMap.keys.toSet(), routeRegistry.keys.toSet());
    });

    test('routeMetaMap has same length as routeRegistry', () {
      expect(routeMetaMap.length, routeRegistry.length);
    });
  });
}
