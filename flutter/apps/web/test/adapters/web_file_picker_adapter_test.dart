import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/adapters/web_file_picker_adapter.dart';

void main() {
  group('WebFilePickerAdapter', () {
    late WebFilePickerAdapter adapter;

    setUp(() {
      adapter = WebFilePickerAdapter();
    });

    // WebFilePickerAdapter uses FilePicker.platform.pickFiles() which relies on
    // dart:js_interop and hangs on non-web platforms. Only test on web.
    test('pickImage returns Result type', () async {
      if (!kIsWeb) {
        // Skip on non-web: the file_picker plugin hangs on VM.
        return;
      }
      final result = await adapter.pickImage();
      expect(result, isA<Result>());
    });

    test('pickFile returns Result type', () async {
      if (!kIsWeb) {
        return;
      }
      final result = await adapter.pickFile();
      expect(result, isA<Result>());
    });
  });
}
