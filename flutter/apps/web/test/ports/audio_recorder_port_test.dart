import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../mocks/mock_audio_recorder_adapter.dart';

void main() {
  group('AudioRecorderPort', () {
    late MockAudioRecorderAdapter adapter;

    setUp(() {
      adapter = MockAudioRecorderAdapter();
    });

    test('startRecording 成功', () async {
      final result = await adapter.startRecording();

      expect(result, isA<Success<void>>());
    });

    test('startRecording 失败', () async {
      adapter.setMockError(const UnknownError('already_recording'));

      final result = await adapter.startRecording();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
      expect(
        ((result as Failure).error as UnknownError).message,
        'already_recording',
      );
    });

    test('stopRecording 成功', () async {
      final mockFile = PickedFile.fromBytes(
        name: 'voice.webm',
        mimeType: 'audio/webm',
        bytes: Uint8List(100),
      );
      adapter.setMockFile(mockFile);
      await adapter.startRecording();

      final result = await adapter.stopRecording();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success).data.name, 'voice.webm');
    });

    test('stopRecording 未录音返回 Failure', () async {
      final result = await adapter.stopRecording();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
    });

    test('stopRecording 失败', () async {
      await adapter.startRecording();
      adapter.setMockError(const UnknownError('recording_stop_failed'));

      final result = await adapter.stopRecording();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
    });

    test('cancelRecording 成功', () async {
      await adapter.startRecording();

      final result = await adapter.cancelRecording();

      expect(result, isA<Success<void>>());
    });

    test('isRecording 返回正确状态', () async {
      var result = await adapter.isRecording();
      expect((result as Success).data, false);

      await adapter.startRecording();
      result = await adapter.isRecording();
      expect((result as Success).data, true);

      await adapter.cancelRecording();
      result = await adapter.isRecording();
      expect((result as Success).data, false);
    });
  });
}
