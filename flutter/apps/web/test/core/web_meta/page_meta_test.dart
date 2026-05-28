import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/web_meta/page_meta.dart';
import 'package:im_web/core/web_meta/web_meta_defaults.dart';

void main() {
  group('PageMeta', () {
    test('constructs with required fields', () {
      const meta = PageMeta(title: 'Test Title', description: 'Test Desc');
      expect(meta.title, 'Test Title');
      expect(meta.description, 'Test Desc');
      expect(meta.canonicalPath, isNull);
      expect(meta.og, isNull);
      expect(meta.twitter, isNull);
    });

    test('constructs with all fields', () {
      const og = OgMeta(
        title: 'OG Title',
        description: 'OG Desc',
        image: 'https://example.com/image.png',
        type: 'article',
      );
      const twitter = TwitterMeta(
        card: 'summary_large_image',
        title: 'Twitter Title',
        description: 'Twitter Desc',
        image: 'https://example.com/tw.png',
      );
      const meta = PageMeta(
        title: 'Title',
        description: 'Desc',
        canonicalPath: '/test',
        og: og,
        twitter: twitter,
      );
      expect(meta.canonicalPath, '/test');
      expect(meta.og?.type, 'article');
      expect(meta.twitter?.card, 'summary_large_image');
    });
  });

  group('metaForPath', () {
    test('returns correct meta for /login (no l10n, falls back to key)', () {
      final meta = metaForPath('/login', null);
      expect(meta.title, 'seoLoginTitle');
      expect(meta.description, 'seoLoginDescription');
      expect(meta.canonicalPath, '/login');
      expect(meta.og?.title, 'seoLoginTitle');
      expect(meta.og?.type, 'website');
      expect(meta.twitter?.card, 'summary');
    });

    test('returns correct meta for /chat', () {
      final meta = metaForPath('/chat', null);
      expect(meta.title, 'seoChatTitle');
      expect(meta.description, 'seoChatDescription');
      expect(meta.canonicalPath, '/chat');
    });

    test('returns correct meta for /settings', () {
      final meta = metaForPath('/settings', null);
      expect(meta.title, 'seoSettingsTitle');
      expect(meta.canonicalPath, '/settings');
    });

    test('returns appFallbackMeta for unknown routes', () {
      final meta = metaForPath('/unknown', null);
      expect(meta.title, appFallbackMeta.title);
      expect(meta.description, appFallbackMeta.description);
    });

    test('returns appFallbackMeta for empty path', () {
      final meta = metaForPath('', null);
      expect(meta.title, appFallbackMeta.title);
    });

    test('canonical does not contain localhost', () {
      for (final path in [
        '/login', '/register', '/chat', '/contacts', '/contacts/add',
        '/groups', '/groups/create', '/moments', '/moments/notifications',
        '/settings', '/settings/profile', '/settings/ai',
      ]) {
        final meta = metaForPath(path, null);
        expect(meta.canonicalPath, isNot(contains('localhost')),
            reason: 'Path $path has localhost in canonical');
      }
    });

    test('all routes have canonicalPath matching path', () {
      for (final path in [
        '/login', '/register', '/chat', '/contacts', '/contacts/add',
        '/groups', '/groups/create', '/moments', '/moments/notifications',
        '/settings', '/settings/profile', '/settings/ai',
      ]) {
        final meta = metaForPath(path, null);
        expect(meta.canonicalPath, path);
      }
    });

    test('all routes have og and twitter meta', () {
      for (final path in [
        '/login', '/register', '/chat', '/contacts', '/contacts/add',
        '/groups', '/groups/create', '/moments', '/moments/notifications',
        '/settings', '/settings/profile', '/settings/ai',
      ]) {
        final meta = metaForPath(path, null);
        expect(meta.og, isNotNull, reason: 'Path $path missing og');
        expect(meta.twitter, isNotNull, reason: 'Path $path missing twitter');
        expect(meta.twitter?.card, 'summary');
      }
    });
  });

  group('appFallbackMeta', () {
    test('has default values', () {
      expect(appFallbackMeta.title, 'IM - 安全即时通讯');
      expect(appFallbackMeta.canonicalPath, '/');
      expect(appFallbackMeta.og?.type, 'website');
      expect(appFallbackMeta.twitter?.card, 'summary');
    });
  });
}
