import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../mocks/mock_clipboard_adapter.dart';

void main() {
  group('ClipboardPort', () {
    late MockClipboardAdapter adapter;

    setUp(() {
      adapter = MockClipboardAdapter();
    });

    test('copy 成功', () async {
      final result = await adapter.copy('测试文本');

      expect(result, isA<Success<void>>());
    });

    test('paste 成功', () async {
      adapter.setClipboardContent('剪贴板内容');

      final result = await adapter.paste();

      expect(result, isA<Success<String?>>());
      expect((result as Success).data, '剪贴板内容');
    });

    test('paste 空剪贴板', () async {
      final result = await adapter.paste();

      expect(result, isA<Success<String?>>());
      expect((result as Success).data, '');
    });

    test('copy 发生错误', () async {
      adapter.setMockError(const UnknownError('测试错误'));

      final result = await adapter.copy('测试文本');

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
    });
  });
}
