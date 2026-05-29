import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/chat/data/message_config.dart';

void main() {
  group('splitTextByCodePoints', () {
    test('returns single element when text is shorter than maxLen', () {
      final result = splitTextByCodePoints('Hello', 2000);
      expect(result, ['Hello']);
    });

    test('returns single element when text equals maxLen', () {
      final text = 'a' * 2000;
      final result = splitTextByCodePoints(text, 2000);
      expect(result, [text]);
    });

    test('splits text exceeding maxLen into chunks', () {
      final text = 'a' * 5000;
      final result = splitTextByCodePoints(text, 2000);
      expect(result.length, 3);
      expect(result[0].length, 2000);
      expect(result[1].length, 2000);
      expect(result[2].length, 1000);
      expect(result.join(), text);
    });

    test('handles empty string', () {
      final result = splitTextByCodePoints('', 2000);
      expect(result, ['']);
    });

    test('correctly splits emoji (multi-code-unit characters)', () {
      // 🎉🎉🎉 = 3 code points, each is 2 UTF-16 code units
      final text = '🎉' * 3;
      final result = splitTextByCodePoints(text, 2);
      expect(result.length, 2);
      expect(result[0], '🎉🎉');
      expect(result[1], '🎉');
    });

    test('handles mixed CJK and ASCII', () {
      final text = '你好世界Hello';
      final result = splitTextByCodePoints(text, 4);
      expect(result.length, 3);
      expect(result[0], '你好世界');
      expect(result[1], 'Hell');
      expect(result[2], 'o');
      expect(result.join(), text);
    });

    test('handles single character maxLen', () {
      final result = splitTextByCodePoints('ABC', 1);
      expect(result, ['A', 'B', 'C']);
    });
  });
}
