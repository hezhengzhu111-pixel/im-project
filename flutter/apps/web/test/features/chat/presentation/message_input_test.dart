import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/platform_providers.dart';
import 'package:im_web/core/di/third_party_providers.dart';
import 'package:im_web/core/network/network_providers.dart';
import 'package:im_web/core/network/network_status_provider.dart';
import 'package:im_web/features/chat/data/file_api.dart';
import 'package:im_web/features/chat/presentation/chat_providers.dart';
import 'package:im_web/features/chat/presentation/chat_provider_with_outbox.dart';
import 'package:im_web/features/chat/presentation/widgets/message_input.dart';
import 'package:im_web/l10n/app_localizations.dart';

import '../../../helpers/fakes.dart';
import '../../../mocks/mock_audio_recorder_adapter.dart';
import '../../../mocks/mock_file_picker_adapter.dart';

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
  Future<void> loadGroupMessages(String groupId,
      {int? page, int? size}) async {}

  @override
  Future<Message?> sendMessage(String receiverId, String content,
          {String messageType = 'text',
          String? clientMessageId,
          String? mediaUrl,
          String? mediaName,
          int? mediaSize,
          String? thumbnailUrl,
          int? duration}) async =>
      null;

  @override
  Future<Message?> sendGroupMessage(String groupId, String content,
          {String messageType = 'text',
          String? clientMessageId,
          String? mediaUrl,
          String? mediaName,
          int? mediaSize,
          String? thumbnailUrl,
          int? duration,
          List<String>? mentionedUserIds}) async =>
      null;

  @override
  void addMessage(String sessionKey, Message message) {}

  @override
  Future<void> retryMessage(String sessionKey, String messageId) async {}

  @override
  Future<void> retryAllFailed() async {}

  @override
  Future<ChatSession?> getOrCreateSession(String targetId,
          {String? targetName, String? targetAvatar}) async =>
      null;

  @override
  String getGroupSessionKey(String groupId) => 'group_$groupId';

  @override
  Future<void> markRead(String conversationId) async {}

  @override
  E2eeNegotiationEvent? get pendingNegotiation => null;

  @override
  Map<String, E2eeNegotiationEvent> get pendingNegotiations => const {};

  @override
  E2eeNegotiationEvent? get activePendingNegotiation => null;

  @override
  E2eeNegotiationEvent? pendingNegotiationForSession(String sessionId) => null;

  @override
  void clearPendingNegotiation([String? sessionId]) {}

  @override
  Future<bool> acceptPendingNegotiation(String sessionId) async => false;

  @override
  Future<void> rejectPendingNegotiation(String sessionId) async {}

  @override
  Future<void> disableEncryptionForSession(String sessionId) async {}

  @override
  Future<bool> initiateEncryptionForSession(String sessionId) async => false;

  @override
  Future<void> loadMoreHistory(String sessionId, {int size = 20}) async {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late MockAudioRecorderAdapter mockRecorder;
  late MockFilePickerAdapter mockFilePicker;

  setUp(() {
    mockRecorder = MockAudioRecorderAdapter();
    mockFilePicker = MockFilePickerAdapter();
  });

  Widget buildSubject({
    void Function(String, List<String>)? onSend,
    void Function(UploadResult)? onSendImage,
    void Function(UploadResult)? onSendFile,
    void Function(UploadResult)? onSendVoice,
  }) {
    final fakeHttpClient = FakeHttpClientPort();
    fakeHttpClient.onPost = <T>(
      String path, {
      dynamic body,
      required T Function(Map<String, dynamic>) fromJson,
    }) async {
      return ApiResponse(
        code: 200,
        message: 'ok',
        data: fromJson({
          'url': 'https://example.com/uploaded',
          'name': 'upload.webm',
          'size': 100,
        }),
      );
    };

    return ProviderScope(
      overrides: [
        audioRecorderPortProvider.overrideWithValue(mockRecorder),
        filePickerPortProvider.overrideWithValue(mockFilePicker),
        // Override providers required by OutboxIndicator (child of MessageInput)
        networkStatusProvider
            .overrideWith((ref) => _FakeNetworkStatusNotifier()),
        chatStateProvider.overrideWith((ref) => _FakeChatNotifier()),
        // Override providers required by fileApiProvider (upload flow)
        httpClientProvider.overrideWithValue(fakeHttpClient),
        analyticsProvider.overrideWithValue(NoopAnalyticsPort()),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: MessageInput(
            onSend: onSend ?? (_, __) {},
            onSendImage: onSendImage ?? (_) {},
            onSendFile: onSendFile ?? (_) {},
            onSendVoice: onSendVoice ?? (_) {},
          ),
        ),
      ),
    );
  }

  group('MessageInput recording', () {
    testWidgets('点击 mic 调用 startRecording', (tester) async {
      await tester.pumpWidget(buildSubject());

      await tester.tap(find.byIcon(Icons.mic));
      await tester.pump();

      final result = await mockRecorder.isRecording();
      expect((result as Success).data, true);
    });

    testWidgets('录音中点击 stop 调用 stopRecording', (tester) async {
      final mockFile = PickedFile.fromBytes(
        name: 'voice.webm',
        mimeType: 'audio/webm',
        bytes: Uint8List(100),
      );
      mockRecorder.setMockFile(mockFile);

      await tester.pumpWidget(buildSubject(
        onSendVoice: (_) {},
      ));

      // Start recording
      await tester.tap(find.byIcon(Icons.mic));
      await tester.pump();

      // Stop recording
      await tester.tap(find.byIcon(Icons.stop));
      await tester.pump();

      final result = await mockRecorder.isRecording();
      expect((result as Success).data, false);
    });

    testWidgets('startRecording 失败展示 SnackBar', (tester) async {
      mockRecorder.setMockError(const UnknownError('already_recording'));

      await tester.pumpWidget(buildSubject());

      await tester.tap(find.byIcon(Icons.mic));
      await tester.pump(); // startRecording
      await tester.pump(); // SnackBar animation

      expect(find.byType(SnackBar), findsOneWidget);
    });

    testWidgets('file picker cancel 不触发上传', (tester) async {
      var uploadCalled = false;

      await tester.pumpWidget(buildSubject(
        onSendFile: (_) => uploadCalled = true,
      ));

      // Open attachment menu
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      // Tap the file option
      await tester.tap(find.text('File'));
      await tester.pumpAndSettle();

      // MockFilePickerAdapter returns OperationCancelled by default,
      // so onSendFile should NOT have been called
      expect(uploadCalled, false);
    });
  });
}
