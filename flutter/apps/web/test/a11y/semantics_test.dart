import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/platform_providers.dart';
import 'package:im_web/features/chat/presentation/widgets/message_input.dart';
import 'package:im_web/l10n/app_localizations.dart';

import '../mocks/mock_file_picker_adapter.dart';
import '../mocks/mock_audio_recorder_adapter.dart';

void main() {
  group('MessageInput Semantics', () {
    late MockFilePickerAdapter mockFilePicker;
    late MockAudioRecorderAdapter mockAudioRecorder;

    setUp(() {
      mockFilePicker = MockFilePickerAdapter();
      mockAudioRecorder = MockAudioRecorderAdapter();
    });

    Widget buildTestWidget({required Widget child}) {
      return ProviderScope(
        overrides: [
          filePickerPortProvider.overrideWithValue(mockFilePicker),
          audioRecorderPortProvider.overrideWithValue(mockAudioRecorder),
        ],
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: child,
          ),
        ),
      );
    }

    testWidgets('send button has semantic label', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          child: MessageInput(
            onSend: (_) {},
            onSendImage: (_) {},
            onSendFile: (_) {},
            onSendVoice: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      final sendButton = find.byIcon(Icons.send);
      expect(sendButton, findsOneWidget);

      final SemanticsNode sendNode = tester.getSemantics(sendButton);
      expect(sendNode.label, contains('Send'));
    });

    testWidgets('attachment button has semantic label', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          child: MessageInput(
            onSend: (_) {},
            onSendImage: (_) {},
            onSendFile: (_) {},
            onSendVoice: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      final attachButton = find.byIcon(Icons.add_circle_outline);
      expect(attachButton, findsOneWidget);

      final SemanticsNode attachNode = tester.getSemantics(attachButton);
      expect(attachNode.label, contains('Attach'));
    });

    testWidgets('voice button has semantic label', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          child: MessageInput(
            onSend: (_) {},
            onSendImage: (_) {},
            onSendFile: (_) {},
            onSendVoice: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      final voiceButton = find.byIcon(Icons.mic);
      expect(voiceButton, findsOneWidget);

      final SemanticsNode voiceNode = tester.getSemantics(voiceButton);
      expect(voiceNode.label, contains('Voice'));
    });
  });
}
