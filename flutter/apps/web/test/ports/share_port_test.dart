import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../mocks/mock_share_adapter.dart';

void main() {
  group('SharePort', () {
    late MockShareAdapter adapter;

    setUp(() {
      adapter = MockShareAdapter();
    });

    test('isAvailable 支持分享', () async {
      adapter.setAvailable(true);

      final result = await adapter.isAvailable();

      expect(result, isA<Success<bool>>());
      expect((result as Success).data, true);
    });

    test('isAvailable 不支持分享', () async {
      adapter.setAvailable(false);

      final result = await adapter.isAvailable();

      expect(result, isA<Success<bool>>());
      expect((result as Success).data, false);
    });

    test('shareText 成功', () async {
      adapter.setAvailable(true);

      final result = await adapter.shareText('分享文本');

      expect(result, isA<Success<void>>());
    });

    test('shareText 不支持分享', () async {
      adapter.setAvailable(false);

      final result = await adapter.shareText('分享文本');

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnsupportedCapability>());
    });

    test('shareFile 不支持文件分享', () async {
      final result = await adapter.shareFile(filePath: '/path/to/file');

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnsupportedCapability>());
    });
  });
}
