import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../mocks/mock_file_picker_adapter.dart';

void main() {
  group('FilePickerPort', () {
    late MockFilePickerAdapter adapter;

    setUp(() {
      adapter = MockFilePickerAdapter();
    });

    test('pickImage 成功', () async {
      final mockFile = PickedFile(
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        bytes: Uint8List(100),
        size: 100,
      );
      adapter.setMockFile(mockFile);

      final result = await adapter.pickImage();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success).data.name, 'test.jpg');
    });

    test('pickImage 用户取消', () async {
      final result = await adapter.pickImage();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<OperationCancelled>());
    });

    test('pickImage 发生错误', () async {
      adapter.setMockError(const UnknownError('测试错误'));

      final result = await adapter.pickImage();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
    });

    test('pickFile 成功', () async {
      final mockFile = PickedFile(
        name: 'document.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List(200),
        size: 200,
      );
      adapter.setMockFile(mockFile);

      final result = await adapter.pickFile();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success).data.name, 'document.pdf');
    });

    test('pickFile 用户取消', () async {
      final result = await adapter.pickFile();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<OperationCancelled>());
    });
  });
}
