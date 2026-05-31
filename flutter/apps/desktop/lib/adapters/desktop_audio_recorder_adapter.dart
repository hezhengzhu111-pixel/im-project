import 'package:im_core/core.dart';

/// Desktop audio recorder adapter.
///
/// This is a placeholder implementation for the framework skeleton.
/// Replace with `record` or `flutter_sound` for production use.
class DesktopAudioRecorderAdapter implements AudioRecorderPort {
  @override
  Future<Result<void>> startRecording() async {
    return const Failure(UnknownError('audio_recorder_not_implemented'));
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    return const Failure(UnknownError('audio_recorder_not_implemented'));
  }

  @override
  Future<Result<void>> cancelRecording() async {
    return const Failure(UnknownError('audio_recorder_not_implemented'));
  }

  @override
  Future<Result<bool>> isRecording() async => const Success(false);
}
