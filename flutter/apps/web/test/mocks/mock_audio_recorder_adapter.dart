import 'package:im_core/core.dart';

class MockAudioRecorderAdapter implements AudioRecorderPort {
  bool _isRecording = false;
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
  Future<Result<void>> startRecording() async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    _isRecording = true;
    return const Success(null);
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    if (!_isRecording) {
      return const Failure(UnknownError('未在录音中'));
    }
    _isRecording = false;
    if (_mockFile != null) {
      return Success(_mockFile!);
    }
    return const Failure(UnknownError('无录音数据'));
  }

  @override
  Future<Result<void>> cancelRecording() async {
    _isRecording = false;
    return const Success(null);
  }

  @override
  Future<Result<bool>> isRecording() async {
    return Success(_isRecording);
  }
}
