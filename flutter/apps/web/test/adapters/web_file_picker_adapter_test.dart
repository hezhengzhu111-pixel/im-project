import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/adapters/web_file_picker_adapter.dart';

void main() {
  group('WebFilePickerAdapter', () {
    late WebFilePickerAdapter adapter;

    setUp(() {
      adapter = WebFilePickerAdapter();
    });

    test('pickImage 返回 Result 类型', () async {
      final result = await adapter.pickImage();
      expect(result, isA<Result<PickedFile>>());
    });

    test('pickFile 返回 Result 类型', () async {
      final result = await adapter.pickFile();
      expect(result, isA<Result<PickedFile>>());
    });
  });
}
