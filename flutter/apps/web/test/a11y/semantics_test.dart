import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/platform_providers.dart';
import 'package:im_web/core/di/third_party_providers.dart';
import 'package:im_web/core/network/network_providers.dart';
import 'package:im_web/core/network/network_status_provider.dart';
import 'package:im_web/features/chat/presentation/chat_providers.dart';
import 'package:im_web/features/chat/presentation/chat_provider_with_outbox.dart';
import 'package:im_web/features/chat/presentation/widgets/message_input.dart';
import 'package:im_web/l10n/app_localizations.dart';

import '../helpers/fakes.dart';
import '../mocks/mock_file_picker_adapter.dart';
import '../mocks/mock_audio_recorder_adapter.dart';

// ---------------------------------------------------------------------------
// Fake StateNotifiers needed by OutboxIndicator's provider chain
// ---------------------------------------------------------------------------

class _FakeNetworkStatusNotifier extends StateNotifier<NetworkState>
    implements NetworkStatusNotifier {
  _FakeNetworkStatusNotifier() : super(const NetworkState());

  @override
  Future<void> checkConnectivity() async {}

  @override
  Future<void> forceCheck() async {}

  @override
  Stream<NetworkState> get stateChanges => const Stream.empty();
}

class _FakeChatNotifier extends StateNotifier<ChatStateWithOutbox>
    implements ChatNotifierWithOutbox {
  _FakeChatNotifier() : super(const ChatStateWithOutbox());

  @override
  Future<void> loadSessions() async {}

  @override
  void setActiveSession(String? sessionId) {}

  @override
  Future<void> loadMessages(String targetId, {int? page, int? size}) async {}

  @override
  Future<void> loadGroupMessages(String groupId, {int? page, int? size}) async {}

  @override
  Future<Message?> sendMessage(String receiverId, String content,
          {String messageType = 'text', String? clientMessageId}) async =>
      null;

  @override
  Future<Message?> sendGroupMessage(String groupId, String content,
          {String messageType = 'text', String? clientMessageId}) async =>
      null;

  @override
  void addMessage(String sessionKey, Message message) {}

  @override
  Future<void> retryMessage(String sessionKey, String messageId) async {}

  @override
  Future<void> retryAllFailed() async {}

  @override
  Future<ChatSession?> getOrCreateSession(String targetId) async => null;

  @override
  Future<void> markRead(String conversationId) async {}

  @override
  E2eeNegotiationEvent? get pendingNegotiation => null;

  @override
  void clearPendingNegotiation() {}
}

void main() {
  group('MessageInput Semantics', () {
    late MockFilePickerAdapter mockFilePicker;
    late MockAudioRecorderAdapter mockAudioRecorder;

    setUp(() {
      mockFilePicker = MockFilePickerAdapter();
      mockAudioRecorder = MockAudioRecorderAdapter();
    });

    Widget buildTestWidget({required Widget child}) {
      final fakeHttpClient = FakeHttpClientPort();
      return ProviderScope(
        overrides: [
          filePickerPortProvider.overrideWithValue(mockFilePicker),
          audioRecorderPortProvider.overrideWithValue(mockAudioRecorder),
          networkStatusProvider
              .overrideWith((ref) => _FakeNetworkStatusNotifier()),
          chatStateProvider.overrideWith((ref) => _FakeChatNotifier()),
          httpClientProvider.overrideWithValue(fakeHttpClient),
          analyticsProvider.overrideWithValue(NoopAnalyticsPort()),
        ],
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
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

      // Verify the send button icon exists
      expect(find.byIcon(Icons.send), findsOneWidget);

      // Verify it has the correct semantic label
      final sendButton = find.bySemanticsLabel('Send message');
      expect(sendButton, findsOneWidget);
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

      // Verify the attachment button icon exists
      expect(find.byIcon(Icons.add_circle_outline), findsOneWidget);

      // Verify it has the correct semantic label
      final attachButton = find.bySemanticsLabel('Add attachment');
      expect(attachButton, findsOneWidget);
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

      // Verify the voice button icon exists
      expect(find.byIcon(Icons.mic), findsOneWidget);

      // Verify it has the correct semantic label
      final voiceButton = find.bySemanticsLabel('Voice input');
      expect(voiceButton, findsOneWidget);
    });
  });
}
