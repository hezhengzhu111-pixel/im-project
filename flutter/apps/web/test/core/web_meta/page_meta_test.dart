import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';
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

  group('metaForPath with canonicalOverride', () {
    test('/chat/abc123 normalizes to /chat canonical', () {
      final meta = metaForPath('/chat/abc123', null);
      expect(meta.canonicalPath, '/chat');
      expect(meta.title, 'seoChatTitle');
    });

    test('/settings/ai keeps its own canonical', () {
      final meta = metaForPath('/settings/ai', null);
      expect(meta.canonicalPath, '/settings/ai');
    });

    test('unknown route returns fallback', () {
      final meta = metaForPath('/unknown/path', null);
      expect(meta.title, 'IM - Secure Messaging');
      expect(meta.canonicalPath, '/');
    });
  });

  group('fallbackMetaForLocale (legacy appFallbackMeta)', () {
    test('returns English meta when l10n is null (replaces old appFallbackMeta)', () {
      final meta = fallbackMetaForLocale(null);
      expect(meta.title, 'IM - Secure Messaging');
      expect(meta.canonicalPath, '/');
      expect(meta.og?.type, 'website');
      expect(meta.twitter?.card, 'summary');
    });
  });

  group('fallbackMetaForLocale', () {
    test('returns English meta when l10n is null', () {
      final meta = fallbackMetaForLocale(null);
      expect(meta.title, 'IM - Secure Messaging');
      expect(meta.description, contains('end-to-end'));
      expect(meta.canonicalPath, '/');
      expect(meta.og?.title, meta.title);
      expect(meta.og?.description, meta.description);
      expect(meta.og?.type, 'website');
      expect(meta.twitter?.card, 'summary');
      expect(meta.twitter?.title, meta.title);
      expect(meta.twitter?.description, meta.description);
    });

    test('returns Chinese meta for zh locale', () {
      final l10n = lookupAppLocalizations(const Locale('zh'));
      final meta = fallbackMetaForLocale(l10n);
      expect(meta.title, 'IM - 安全即时通讯');
      expect(meta.description, contains('端到端加密'));
      expect(meta.og?.title, meta.title);
      expect(meta.twitter?.title, meta.title);
    });

    test('returns English meta for en locale', () {
      final l10n = lookupAppLocalizations(const Locale('en'));
      final meta = fallbackMetaForLocale(l10n);
      expect(meta.title, 'IM - Secure Messaging');
      expect(meta.description, contains('end-to-end'));
    });
  });

  group('index.html validation', () {
    test('does not contain hardcoded Chinese descriptions', () {
      final content = File('web/index.html').readAsStringSync();
      expect(content, isNot(contains('安全即时通讯')));
      expect(content, isNot(contains('端到端加密')));
    });

    test('does not contain localhost', () {
      final content = File('web/index.html').readAsStringSync();
      expect(content, isNot(contains('localhost')));
    });

    test('html lang is en', () {
      final content = File('web/index.html').readAsStringSync();
      expect(content, contains('<html lang="en"'));
    });
  });
}
