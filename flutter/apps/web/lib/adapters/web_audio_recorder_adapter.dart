import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;
import 'package:im_core/core.dart';

class WebAudioRecorderAdapter implements AudioRecorderPort {
  web.MediaRecorder? _recorder;
  web.MediaStream? _stream;
  final List<web.Blob> _chunks = [];
  bool _isRecording = false;

  @override
  Future<Result<void>> startRecording() async {
    if (_isRecording) {
      return const Failure(UnknownError('already_recording'));
    }

    try {
      final stream = await web.window.navigator.mediaDevices
          .getUserMedia(web.MediaStreamConstraints(audio: true))
          .toDart;

      _stream = stream;
      _recorder = web.MediaRecorder(stream);
      _chunks.clear();

      _recorder!.addEventListener(
        'dataavailable',
        (web.Event event) {
          final blobEvent = event as web.BlobEvent;
          final blob = blobEvent.data;
          if (blob != null && blob.size > 0) {
            _chunks.add(blob);
          }
        }.toJS,
      );

      _recorder!.start();
      _isRecording = true;
      return const Success(null);
    } catch (e) {
      _cleanup();
      if (e is web.DOMException && e.name == 'NotAllowedError') {
        return const Failure(PermissionDenied('microphone'));
      }
      return const Failure(
          UnknownError('recording_start_failed'));
    }
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    if (!_isRecording || _recorder == null) {
      return const Failure(UnknownError('not_recording'));
    }

    try {
      final completer = Completer<void>();

      void onStop(web.Event _) {
        if (!completer.isCompleted) {
          completer.complete();
        }
      }

      _recorder!.addEventListener('stop', onStop.toJS);
      _recorder!.stop();
      await completer.future;
      _recorder!.removeEventListener('stop', onStop.toJS);

      final mimeType = _recorder!.mimeType;
      final effectiveType =
          mimeType.isNotEmpty ? mimeType : 'audio/webm';

      final blob = web.Blob(
        _chunks.toJS,
        web.BlobPropertyBag(type: effectiveType),
      );

      final bytes = await _blobToUint8List(blob);

      _cleanup();

      return Success(PickedFile.fromBytes(
        name: 'voice_${DateTime.now().millisecondsSinceEpoch}.webm',
        mimeType: effectiveType,
        bytes: bytes,
      ));
    } catch (e) {
      _cleanup();
      return const Failure(
          UnknownError('recording_stop_failed'));
    }
  }

  @override
  Future<Result<void>> cancelRecording() async {
    if (!_isRecording) {
      return const Failure(UnknownError('not_recording'));
    }

    _cleanup();
    return const Success(null);
  }

  @override
  Future<Result<bool>> isRecording() async {
    return Success(_isRecording);
  }

  void _cleanup() {
    _isRecording = false;

    if (_recorder != null) {
      try {
        if (_recorder!.state != 'inactive') {
          _recorder!.stop();
        }
      } catch (_) {}
      _recorder = null;
    }

    if (_stream != null) {
      _stream!.getTracks().forEach((track) => track.stop());
      _stream = null;
    }

    _chunks.clear();
  }

  Future<Uint8List> _blobToUint8List(web.Blob blob) async {
    final buffer = await blob.arrayBuffer().toDart;
    return buffer.asUint8List();
  }
}
