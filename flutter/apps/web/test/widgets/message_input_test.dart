import 'dart:typed_data';
import 'package:flutter/material.dart';
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
          {String messageType = 'text', String? clientMessageId, String? mediaUrl, String? mediaName, int? mediaSize, String? thumbnailUrl, int? duration}) async =>
      null;

  @override
  Future<Message?> sendGroupMessage(String groupId, String content,
          {String messageType = 'text', String? clientMessageId, String? mediaUrl, String? mediaName, int? mediaSize, String? thumbnailUrl, int? duration}) async =>
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
  void clearPendingNegotiation() {}
}

FakeHttpClientPort _buildFakeHttpClient() {
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
  return fakeHttpClient;
}

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
            networkStatusProvider
                .overrideWith((ref) => _FakeNetworkStatusNotifier()),
            chatStateProvider.overrideWith((ref) => _FakeChatNotifier()),
            httpClientProvider.overrideWithValue(_buildFakeHttpClient()),
            analyticsProvider.overrideWithValue(NoopAnalyticsPort()),
          ],
          child: MaterialApp(
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
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

      // Open attachment menu
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      // Tap the image option
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
            networkStatusProvider
                .overrideWith((ref) => _FakeNetworkStatusNotifier()),
            chatStateProvider.overrideWith((ref) => _FakeChatNotifier()),
            httpClientProvider.overrideWithValue(_buildFakeHttpClient()),
            analyticsProvider.overrideWithValue(NoopAnalyticsPort()),
          ],
          child: MaterialApp(
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
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

      // Open attachment menu
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      // Tap the file option
      await tester.tap(find.byIcon(Icons.attach_file));
      await tester.pumpAndSettle();
    });
  });
}
