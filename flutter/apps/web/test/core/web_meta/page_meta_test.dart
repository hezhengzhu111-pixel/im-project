import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/web_meta/page_meta.dart';

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
}
