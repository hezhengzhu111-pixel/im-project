import 'package:im_core/core.dart';

class MockShareAdapter implements SharePort {
  bool _isAvailable = true;
  FailureError? _mockError;

  void setAvailable(bool available) {
    _isAvailable = available;
    _mockError = null;
  }

  void setMockError(FailureError error) {
    _mockError = error;
  }

  @override
  Future<Result<bool>> isAvailable() async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    return Success(_isAvailable);
  }

  @override
  Future<Result<void>> shareText(String text) async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    if (!_isAvailable) {
      return const Failure(UnsupportedCapability('share'));
    }
    return const Success(null);
  }

  @override
  Future<Result<void>> shareFile({required String filePath, String? mimeType}) async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    return const Failure(UnsupportedCapability('share_file'));
  }
}
