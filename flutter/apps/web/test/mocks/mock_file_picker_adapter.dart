import 'package:im_core/core.dart';

class MockFilePickerAdapter implements FilePickerPort {
  PickedFile? _mockFile;
  FailureError? _mockError;

  void setMockFile(PickedFile file) {
    _mockFile = file;
    _mockError = null;
  }

  void setMockError(FailureError error) {
    _mockError = error;
    _mockFile = null;
  }

  @override
  Future<Result<PickedFile>> pickImage({ImageSource source = ImageSource.gallery}) async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    if (_mockFile != null) {
      return Success(_mockFile!);
    }
    return const Failure(OperationCancelled());
  }

  @override
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions}) async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    if (_mockFile != null) {
      return Success(_mockFile!);
    }
    return const Failure(OperationCancelled());
  }
}
