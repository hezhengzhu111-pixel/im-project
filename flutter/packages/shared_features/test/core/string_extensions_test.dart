import 'package:flutter_test/flutter_test.dart';
import 'package:im_shared_features/src/core/string_extensions.dart';

void main() {
  group('SafeSubstring', () {
    test('safeFirstCharUpper returns upper-case first character', () {
      expect('alice'.safeFirstCharUpper(), 'A');
      expect('Bob'.safeFirstCharUpper(), 'B');
      expect('  charlie  '.safeFirstCharUpper(), 'C');
    });

    test('safeFirstCharUpper returns fallback for empty or whitespace string', () {
      expect(''.safeFirstCharUpper(), '?');
      expect('   '.safeFirstCharUpper(), '?');
      expect(''.safeFirstCharUpper(fallback: '#'), '#');
    });

    test('safeFirstCharUpper handles CJK characters', () {
      expect('你好'.safeFirstCharUpper(), '你');
    });

    test('safeFirstCharUpper does not crash on emoji-leading string', () {
      // Emoji are represented as surrogate pairs in Dart; substring(0,1)
      // returns a lone surrogate. The helper does not crash and callers that
      // render the result should handle malformed sequences gracefully.
      expect(() => '🎉party'.safeFirstCharUpper(), returnsNormally);
    });
  });
}
