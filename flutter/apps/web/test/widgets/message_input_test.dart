import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart' as shared;
import 'package:im_web/core/di/platform_providers.dart';
import 'package:im_web/core/di/third_party_providers.dart';
import 'package:im_web/core/network/network_providers.dart';
import 'package:im_web/core/network/network_status_provider.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/features/chat/presentation/chat_providers.dart';
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

class _FakeChatNotifier extends shared.ChatNotifier {
  _FakeChatNotifier()
      : super(
          shared.MessageApi(FakeHttpClientPort()),
          shared.MessagePipeline(),
          FakeWsClientPort(),
          () => 'test-user',
        );

  @override
  Future<void> loadSessions() async {}

  @override
  Future<void> loadPendingNegotiations() async {}

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
          int? duration,
          Map<String, dynamic>? extra}) async =>
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
          List<String>? mentionedUserIds,
          Map<String, dynamic>? extra}) async =>
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

  @override
  Future<void> logout() async {}
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

Widget _buildSubject({
  MockFilePickerAdapter? mockFilePicker,
  MockAudioRecorderAdapter? mockAudioRecorder,
}) {
  return ProviderScope(
    overrides: [
      filePickerPortProvider.overrideWithValue(
        mockFilePicker ?? MockFilePickerAdapter(),
      ),
      audioRecorderPortProvider.overrideWithValue(
        mockAudioRecorder ?? MockAudioRecorderAdapter(),
      ),
      networkStatusProvider.overrideWith((ref) => _FakeNetworkStatusNotifier()),
      chatStateProvider.overrideWith((ref) => _FakeChatNotifier()),
      httpClientProvider.overrideWithValue(_buildFakeHttpClient()),
      analyticsProvider.overrideWithValue(NoopAnalyticsPort()),
    ],
    child: MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: ThemeData(extensions: [GlassTheme.light]),
      home: Scaffold(
        body: MessageInput(
          onSend: (_, __) {},
          onSendImage: (_) {},
          onSendFile: (_) {},
          onSendVoice: (_) {},
        ),
      ),
    ),
  );
}

void main() {
  group('MessageInput', () {
    late MockFilePickerAdapter mockFilePicker;
    late MockAudioRecorderAdapter mockAudioRecorder;

    setUp(() {
      mockFilePicker = MockFilePickerAdapter();
      mockAudioRecorder = MockAudioRecorderAdapter();
    });

    // -----------------------------------------------------------------------
    // P0 止血：图片发送入口保留（已有完整上传链路）
    // -----------------------------------------------------------------------

    testWidgets('点击附件按钮展示菜单（仅图片选项）', (tester) async {
      final mockFile = PickedFile(
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        bytes: Uint8List(100),
        size: 100,
      );
      mockFilePicker.setMockFile(mockFile);

      await tester.pumpWidget(_buildSubject(
        mockFilePicker: mockFilePicker,
        mockAudioRecorder: mockAudioRecorder,
      ));

      // Open attachment menu
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      // Only image option should be present
      expect(find.byIcon(Icons.image), findsOneWidget);
      // File option should NOT be present (P0 止血)
      expect(find.byIcon(Icons.attach_file), findsNothing);
      expect(find.text('File'), findsNothing);

      // Tap the image option
      await tester.tap(find.byIcon(Icons.image));
      await tester.pumpAndSettle();
    });

    testWidgets('图片按钮触发文件选择', (tester) async {
      final mockFile = PickedFile(
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        bytes: Uint8List(100),
        size: 100,
      );
      mockFilePicker.setMockFile(mockFile);

      await tester.pumpWidget(_buildSubject(
        mockFilePicker: mockFilePicker,
        mockAudioRecorder: mockAudioRecorder,
      ));

      // Open attachment menu
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      // Tap the image option
      await tester.tap(find.byIcon(Icons.image));
      await tester.pumpAndSettle();
    });

    // -----------------------------------------------------------------------
    // P0 止血：语音发送入口已移除
    // -----------------------------------------------------------------------

    testWidgets('mic 按钮已移除（P0 止血）', (tester) async {
      await tester.pumpWidget(_buildSubject(
        mockFilePicker: mockFilePicker,
        mockAudioRecorder: mockAudioRecorder,
      ));

      // Mic button should NOT exist
      expect(find.byIcon(Icons.mic), findsNothing);
      // Stop icon should NOT exist
      expect(find.byIcon(Icons.stop), findsNothing);
    });

    // -----------------------------------------------------------------------
    // P0 止血：文件发送入口已移除
    // -----------------------------------------------------------------------

    testWidgets('附件菜单不含文件选项（P0 止血）', (tester) async {
      await tester.pumpWidget(_buildSubject(
        mockFilePicker: mockFilePicker,
        mockAudioRecorder: mockAudioRecorder,
      ));

      // Open attachment menu
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      // File option should NOT be present
      expect(find.byIcon(Icons.attach_file), findsNothing);
      expect(find.text('File'), findsNothing);
    });

    // -----------------------------------------------------------------------
    // 文本发送不受影响
    // -----------------------------------------------------------------------

    testWidgets('文本发送按钮存在且可用', (tester) async {
      await tester.pumpWidget(_buildSubject(
        mockFilePicker: mockFilePicker,
        mockAudioRecorder: mockAudioRecorder,
      ));

      // Send button should exist
      expect(find.byIcon(Icons.send), findsOneWidget);
      expect(find.byType(FilledButton), findsOneWidget);

      // Text field should exist
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('文本输入和发送可用', (tester) async {
      var sentText = '';
      var sentMentions = <String>[];

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
            theme: ThemeData(extensions: [GlassTheme.light]),
            home: Scaffold(
              body: MessageInput(
                onSend: (text, mentions) {
                  sentText = text;
                  sentMentions = mentions;
                },
                onSendImage: (_) {},
                onSendFile: (_) {},
                onSendVoice: (_) {},
              ),
            ),
          ),
        ),
      );

      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.tap(find.byType(FilledButton));
      await tester.pump();

      expect(sentText, 'Hello');
      expect(sentMentions, isEmpty);
    });
  });
}
