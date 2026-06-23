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
  group('Desktop file picker port', () {
    late _MockFilePickerAdapter adapter;

    setUp(() => adapter = _MockFilePickerAdapter());

    test('pickFile success returns picked file', () async {
      adapter.nextResult = Success(PickedFile(
        name: 'report.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List(100),
        size: 100,
      ));

      final result = await adapter.pickFile();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success<PickedFile>).data.name, 'report.pdf');
    });

    test('pickFile cancel returns OperationCancelled failure', () async {
      final result = await adapter.pickFile();

      expect(result, isA<Failure<PickedFile>>());
      expect((result as Failure<PickedFile>).error, isA<OperationCancelled>());
    });

    test('pickImage success returns picked image', () async {
      adapter.nextResult = Success(PickedFile(
        name: 'photo.png',
        mimeType: 'image/png',
        bytes: Uint8List(200),
        size: 200,
      ));

      final result = await adapter.pickImage();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success<PickedFile>).data.name, 'photo.png');
    });

    test('pickImage cancel does not throw', () async {
      final result = await adapter.pickImage();

      expect(result, isA<Failure<PickedFile>>());
    });
  });
}
