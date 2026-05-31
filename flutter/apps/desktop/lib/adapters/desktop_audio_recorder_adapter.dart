import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:im_core/core.dart';

class DesktopAudioRecorderAdapter implements AudioRecorderPort {
  String? _currentPath;
  bool _isRecording = false;

  @override
  Future<Result<void>> startRecording() async {
    try {
      final directory = await getTemporaryDirectory();
      _currentPath =
          '${directory.path}/recording_${DateTime.now().millisecondsSinceEpoch}.aac';
      _isRecording = true;
      // Desktop audio recording requires native implementation.
      // This adapter saves the path as a placeholder.
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError('recording_start_failed'));
    }
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    try {
      if (!_isRecording || _currentPath == null) {
        return const Failure(UnknownError('not_recording'));
      }
      _isRecording = false;
      final path = _currentPath!;
      _currentPath = null;

      // Read the recorded file bytes
      final file = File(path);
      if (!await file.exists()) {
        return const Failure(UnknownError('recording_file_not_found'));
      }
      final bytes = await file.readAsBytes();

      return Success(PickedFile.fromBytes(
        name: path.split('/').last,
        mimeType: 'audio/aac',
        bytes: bytes,
      ));
    } catch (e) {
      return Failure(UnknownError('recording_stop_failed'));
    }
  }

  @override
  Future<Result<void>> cancelRecording() async {
    try {
      if (_currentPath != null) {
        final file = File(_currentPath!);
        if (await file.exists()) {
          await file.delete();
        }
      }
      _isRecording = false;
      _currentPath = null;
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError('recording_cancel_failed'));
    }
  }

  @override
  Future<Result<bool>> isRecording() async => Success(_isRecording);
}
