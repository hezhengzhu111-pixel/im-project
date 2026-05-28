import 'package:im_core/core.dart';

class MockClipboardAdapter implements ClipboardPort {
  String _clipboardContent = '';
  FailureError? _mockError;

  void setClipboardContent(String content) {
    _clipboardContent = content;
    _mockError = null;
  }

  void setMockError(FailureError error) {
    _mockError = error;
  }

  @override
  Future<Result<void>> copy(String text) async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    _clipboardContent = text;
    return const Success(null);
  }

  @override
  Future<Result<String?>> paste() async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    return Success(_clipboardContent);
  }
}
