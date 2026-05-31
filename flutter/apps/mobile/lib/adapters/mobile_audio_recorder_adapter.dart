import 'dart:io';

import 'package:im_core/core.dart';
import 'package:record/record.dart';

/// Mobile audio recorder adapter using the record package.
class MobileAudioRecorderAdapter implements AudioRecorderPort {
  final _recorder = AudioRecorder();
  bool _isRecording = false;
  String? _outputPath;

  @override
  Future<Result<void>> startRecording() async {
    if (_isRecording) {
      return const Failure(UnknownError('already_recording'));
    }

    try {
      if (!await _recorder.hasPermission()) {
        return const Failure(PermissionDenied('microphone'));
      }

      // Use a temporary directory for the recording.
      final tempDir = Directory.systemTemp;
      final fileName = 'voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      _outputPath = '${tempDir.path}/$fileName';

      await _recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 128000,
          sampleRate: 44100,
        ),
        path: _outputPath!,
      );

      _isRecording = true;
      return const Success(null);
    } catch (e) {
      _cleanup();
      return const Failure(UnknownError('recording_start_failed'));
    }
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    if (!_isRecording) {
      return const Failure(UnknownError('not_recording'));
    }

    try {
      final path = await _recorder.stop();
      _isRecording = false;

      if (path == null || path.isEmpty) {
        _cleanup();
        return const Failure(UnknownError('recording_stop_failed'));
      }

      final file = File(path);
      if (!await file.exists()) {
        _cleanup();
        return const Failure(UnknownError('recording_file_not_found'));
      }

      final bytes = await file.readAsBytes();
      final name = path.split('/').last;

      // Clean up the temporary file after reading.
      try {
        await file.delete();
      } catch (_) {}

      _outputPath = null;

      return Success(PickedFile.fromBytes(
        name: name,
        mimeType: 'audio/aac',
        bytes: bytes,
      ));
    } catch (e) {
      _cleanup();
      return const Failure(UnknownError('recording_stop_failed'));
    }
  }

  @override
  Future<Result<void>> cancelRecording() async {
    if (!_isRecording) {
      return const Failure(UnknownError('not_recording'));
    }

    try {
      final path = await _recorder.stop();
      _cleanup();

      // Delete the partial recording file.
      if (path != null && path.isNotEmpty) {
        try {
          await File(path).delete();
        } catch (_) {}
      }

      return const Success(null);
    } catch (e) {
      _cleanup();
      return const Failure(UnknownError('recording_cancel_failed'));
    }
  }

  @override
  Future<Result<bool>> isRecording() async {
    return Success(_isRecording);
  }

  void _cleanup() {
    _isRecording = false;
    _outputPath = null;
  }
}
