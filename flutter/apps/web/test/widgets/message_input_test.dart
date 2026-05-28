import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/platform_providers.dart';
import 'package:im_web/features/chat/presentation/widgets/message_input.dart';
import '../mocks/mock_file_picker_adapter.dart';
import '../mocks/mock_audio_recorder_adapter.dart';

void main() {
  group('MessageInput', () {
    late MockFilePickerAdapter mockFilePicker;
    late MockAudioRecorderAdapter mockAudioRecorder;

    setUp(() {
      mockFilePicker = MockFilePickerAdapter();
      mockAudioRecorder = MockAudioRecorderAdapter();
    });

    testWidgets('点击图片按钮触发文件选择', (tester) async {
      final mockFile = PickedFile(
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        bytes: Uint8List(100),
        size: 100,
      );
      mockFilePicker.setMockFile(mockFile);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            filePickerPortProvider.overrideWithValue(mockFilePicker),
            audioRecorderPortProvider.overrideWithValue(mockAudioRecorder),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: MessageInput(
                onSend: (_) {},
                onSendImage: (_) {},
                onSendFile: (_) {},
                onSendVoice: (_) {},
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.image));
      await tester.pumpAndSettle();
    });

    testWidgets('点击附件按钮触发文件选择', (tester) async {
      final mockFile = PickedFile(
        name: 'document.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List(200),
        size: 200,
      );
      mockFilePicker.setMockFile(mockFile);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            filePickerPortProvider.overrideWithValue(mockFilePicker),
            audioRecorderPortProvider.overrideWithValue(mockAudioRecorder),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: MessageInput(
                onSend: (_) {},
                onSendImage: (_) {},
                onSendFile: (_) {},
                onSendVoice: (_) {},
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.attach_file));
      await tester.pumpAndSettle();
    });
  });
}
