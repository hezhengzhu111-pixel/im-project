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

  group('OgMeta', () {
    test('constructs with no fields', () {
      const og = OgMeta();
      expect(og.title, isNull);
      expect(og.description, isNull);
      expect(og.image, isNull);
      expect(og.type, isNull);
    });
  });

  group('TwitterMeta', () {
    test('constructs with no fields', () {
      const twitter = TwitterMeta();
      expect(twitter.card, isNull);
      expect(twitter.title, isNull);
      expect(twitter.description, isNull);
      expect(twitter.image, isNull);
    });
  });

  group('metaForPath', () {
    test('returns correct meta for known routes', () {
      final loginMeta = metaForPath('/login');
      expect(loginMeta.title, '登录 - IM');
      expect(loginMeta.description, '安全即时通讯，端到端加密登录');
      expect(loginMeta.canonicalPath, '/login');

      final chatMeta = metaForPath('/chat');
      expect(chatMeta.title, '聊天 - IM');
      expect(chatMeta.description, '与好友安全聊天，端到端加密');
    });

    test('returns appFallbackMeta for unknown routes', () {
      final unknownMeta = metaForPath('/unknown');
      expect(unknownMeta.title, appFallbackMeta.title);
      expect(unknownMeta.description, appFallbackMeta.description);
    });

    test('returns appFallbackMeta for empty path', () {
      final emptyMeta = metaForPath('');
      expect(emptyMeta.title, appFallbackMeta.title);
    });

    test('covers all 12 routes', () {
      expect(pageMetaMap.length, 12);
      expect(pageMetaMap.containsKey('/login'), isTrue);
      expect(pageMetaMap.containsKey('/register'), isTrue);
      expect(pageMetaMap.containsKey('/chat'), isTrue);
      expect(pageMetaMap.containsKey('/contacts'), isTrue);
      expect(pageMetaMap.containsKey('/contacts/add'), isTrue);
      expect(pageMetaMap.containsKey('/groups'), isTrue);
      expect(pageMetaMap.containsKey('/groups/create'), isTrue);
      expect(pageMetaMap.containsKey('/moments'), isTrue);
      expect(pageMetaMap.containsKey('/moments/notifications'), isTrue);
      expect(pageMetaMap.containsKey('/settings'), isTrue);
      expect(pageMetaMap.containsKey('/settings/profile'), isTrue);
      expect(pageMetaMap.containsKey('/settings/ai'), isTrue);
    });
  });
}
