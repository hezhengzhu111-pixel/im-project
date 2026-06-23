import 'package:flutter_test/flutter_test.dart';
import 'package:im_shared_features/chat.dart';

void main() {
  group('FileSizeFormatter', () {
    test('returns empty for null', () {
      expect(FileSizeFormatter.format(null), '');
    });

    test('returns empty for negative', () {
      expect(FileSizeFormatter.format(-1), '');
    });

    test('formats bytes', () {
      expect(FileSizeFormatter.format(0), '0 B');
      expect(FileSizeFormatter.format(512), '512 B');
      expect(FileSizeFormatter.format(1023), '1023 B');
    });

    test('formats kilobytes with one decimal', () {
      expect(FileSizeFormatter.format(1024), '1.0 KB');
      expect(FileSizeFormatter.format(1536), '1.5 KB');
      expect(FileSizeFormatter.format(1024 * 1024 - 1), '1024.0 KB');
    });

    test('formats megabytes with one decimal', () {
      expect(FileSizeFormatter.format(1024 * 1024), '1.0 MB');
      expect(FileSizeFormatter.format(20 * 1024 * 1024), '20.0 MB');
      expect(FileSizeFormatter.format(1024 * 1024 * 1024 - 1), '1024.0 MB');
    });

    test('formats gigabytes with one decimal', () {
      expect(FileSizeFormatter.format(1024 * 1024 * 1024), '1.0 GB');
      expect(FileSizeFormatter.format(2 * 1024 * 1024 * 1024), '2.0 GB');
    });
  });
}
