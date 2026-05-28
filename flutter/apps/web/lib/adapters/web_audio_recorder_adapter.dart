import 'package:im_core/core.dart';

class WebAudioRecorderAdapter implements AudioRecorderPort {
  bool _isRecording = false;

  @override
  Future<Result<void>> startRecording() async {
    try {
      if (_isRecording) {
        return const Failure(UnknownError('already_recording'));
      }

      // 实际实现需要通过 dart:js_interop 使用 MediaRecorder API
      _isRecording = true;
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    try {
      if (!_isRecording) {
        return const Failure(UnknownError('not_recording'));
      }

      // 实际实现需要通过 dart:js_interop 停止 MediaRecorder 并获取音频数据
      _isRecording = false;
      return const Failure(UnknownError('not_implemented'));
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> cancelRecording() async {
    try {
      if (!_isRecording) {
        return const Failure(UnknownError('not_recording'));
      }

      _isRecording = false;
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<bool>> isRecording() async {
    return Success(_isRecording);
  }
}
