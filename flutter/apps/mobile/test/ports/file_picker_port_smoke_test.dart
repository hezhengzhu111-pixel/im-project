import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';

class _MockFilePickerAdapter implements FilePickerPort {
  Result<PickedFile>? nextResult;

  @override
  Future<Result<PickedFile>> pickImage(
      {ImageSource source = ImageSource.gallery}) async {
    return nextResult ?? const Failure(OperationCancelled());
  }

  @override
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions}) async {
    return nextResult ?? const Failure(OperationCancelled());
  }
}

void main() {
  group('Mobile file picker provider smoke', () {
    late _MockFilePickerAdapter adapter;

    setUp(() => adapter = _MockFilePickerAdapter());

    test('pickImage returns file on success', () async {
      adapter.nextResult = Success(PickedFile(
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        bytes: Uint8List(100),
        size: 100,
      ));

      final result = await adapter.pickImage();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success<PickedFile>).data.name, 'photo.jpg');
    });

    test('pickFile returns file on success', () async {
      adapter.nextResult = Success(PickedFile(
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List(100),
        size: 100,
      ));

      final result = await adapter.pickFile();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success<PickedFile>).data.name, 'doc.pdf');
    });

    test('cancel returns OperationCancelled', () async {
      final result = await adapter.pickFile();

      expect(result, isA<Failure<PickedFile>>());
      expect((result as Failure<PickedFile>).error, isA<OperationCancelled>());
    });
  });
}
