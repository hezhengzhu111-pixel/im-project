import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_client_memory.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_pipeline.dart';
import 'package:im_web/features/chat/presentation/chat_provider_with_outbox.dart';
import 'package:im_web/features/e2ee/data/e2ee_manager.dart';
import 'package:im_web/features/e2ee/data/e2ee_meta_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_api.dart';
import 'package:im_web/features/e2ee/data/e2ee_key_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_session_store.dart';
import 'package:im_web/adapters/web_e2ee_adapter.dart';
import 'package:im_web/adapters/services/noop_analytics_adapter.dart';
import 'package:im_web/core/network/network_status_provider.dart';

import '../../helpers/fakes.dart';

/// Testable MessageApi that records request details.
class _TestMessageApi extends MessageApi {
  _TestMessageApi() : super(FakeHttpClientPort());

  List<ChatSession>? conversationsResponse;
  Message? sendPrivateMessageResponse;
  Message? sendGroupMessageResponse;
  Message? sendPrivateEncryptedResponse;
  Exception? errorToThrow;

  int sendPrivateMessageCallCount = 0;
  int sendGroupMessageCallCount = 0;
  int sendPrivateEncryptedCallCount = 0;

  SendPrivateMessageRequest? lastSendPrivateRequest;
  SendGroupMessageRequest? lastSendGroupRequest;
  Map<String, dynamic>? lastEncryptedArgs;

  @override
  Future<List<ChatSession>> getConversations() async =>
      conversationsResponse ?? [];

  @override
  Future<List<Message>> getPrivateHistory(String friendId,
          {int? page, int? size}) async =>
      [];

  @override
  Future<List<Message>> getGroupHistory(String groupId,
          {int? page, int? size}) async =>
      [];

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    sendPrivateMessageCallCount++;
    lastSendPrivateRequest = request;
    if (errorToThrow != null) throw errorToThrow!;
    return sendPrivateMessageResponse ?? _dummyMessage();
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    sendGroupMessageCallCount++;
    lastSendGroupRequest = request;
    if (errorToThrow != null) throw errorToThrow!;
    return sendGroupMessageResponse ?? _dummyMessage();
  }

  @override
  Future<Message> sendPrivateEncrypted({
    required String receiverId,
    required String clientMessageId,
    required String messageType,
    required Map<String, dynamic> e2eeEnvelope,
    required String e2eeDeviceId,
  }) async {
    sendPrivateEncryptedCallCount++;
    lastEncryptedArgs = {
      'receiverId': receiverId,
      'clientMessageId': clientMessageId,
      'messageType': messageType,
      'e2eeEnvelope': e2eeEnvelope,
      'e2eeDeviceId': e2eeDeviceId,
    };
    if (errorToThrow != null) throw errorToThrow!;
    return sendPrivateEncryptedResponse ?? _dummyMessage();
  }

  @override
  Future<void> markRead(String conversationId) async {}

  @override
  Future<MessageConfig> getConfig() async {
    return const MessageConfig(textEnforce: true, textMaxLength: 2000);
  }

  Message _dummyMessage() {
    return const Message(
      id: 'server-msg-1',
      senderId: 'user-1',
      isGroupChat: false,
      messageType: 'text',
      content: '',
      sendTime: '2024-01-01T00:00:00Z',
      status: 'sent',
    );
  }
}

/// Spy MessageOutbox that records enqueue calls.
class _SpyMessageOutbox extends MessageOutbox {
  _SpyMessageOutbox()
      : super(
          messageApi: MessageApi(FakeHttpClientPort()),
          idbFactory: newIdbFactoryMemory(),
          isOnline: () => true,
        );

  final _eventsController = StreamController<OutboxEvent>.broadcast();
  final List<Map<String, dynamic>> enqueueCalls = [];

  @override
  Stream<OutboxEvent> get events => _eventsController.stream;

  @override
  Future<int> getPendingCount() async => 0;

  @override
  Future<int> getFailedCount() async => 0;

  @override
  Future<void> retryAllFailed() async {}

  @override
  Future<OutboxMessage> enqueue({
    required String sessionKey,
    required String receiverId,
    required String content,
    String messageType = 'text',
    required String clientMessageId,
    bool isGroupChat = false,
    String? groupId,
    bool isEncrypted = false,
    Map<String, dynamic>? e2eeEnvelope,
    String? e2eeDeviceId,
  }) async {
    enqueueCalls.add({
      'sessionKey': sessionKey,
      'receiverId': receiverId,
      'content': content,
      'messageType': messageType,
      'clientMessageId': clientMessageId,
      'isGroupChat': isGroupChat,
      'groupId': groupId,
    });
    return OutboxMessage(
      id: 'outbox_spy_$clientMessageId',
      sessionKey: sessionKey,
      receiverId: receiverId,
      content: content,
      messageType: messageType,
      clientMessageId: clientMessageId,
      isGroupChat: isGroupChat,
      groupId: groupId,
      status: OutboxMessageStatus.pending,
      createdAt: DateTime.now(),
    );
  }

  @override
  void dispose() {
    _eventsController.close();
    super.dispose();
  }
}

/// Mock E2eeMetaStore backed by FakeSecureStorage.
class _MockE2eeMetaStore extends E2eeMetaStore {
  _MockE2eeMetaStore([SecureStoragePort? storage])
      : super(storage ?? FakeSecureStoragePort());
}

/// Testable E2eeManager that overrides crypto to avoid WASM dependency.
class _TestableE2eeManager extends E2eeManager {
  _TestableE2eeManager({
    required E2eeMetaStore metaStore,
    String currentUserId = 'user-1',
  }) : super(
          adapter: WebE2eeAdapter(),
          api: E2eeApi(FakeHttpClientPort()),
          keyStore: E2eeKeyStore(),
          sessionStore: E2eeSessionStore(),
          metaStore: metaStore,
          currentUserId: currentUserId,
        );

  @override
  Future<Map<String, dynamic>> encryptToEnvelope({
    required String sessionId,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String plaintext,
  }) async {
    return {
      'ciphertext': 'fake_ciphertext',
      'sessionId': sessionId,
      'senderDeviceId': senderDeviceId,
      'recipientDeviceId': recipientDeviceId,
    };
  }

  @override
  Future<String> decryptEnvelope({
    required String sessionId,
    required Map<String, dynamic> envelope,
  }) async {
    return 'fake_plaintext';
  }
}

/// Fake NetworkStatusNotifier.
class _FakeNetworkStatusNotifier extends NetworkStatusNotifier {
  _FakeNetworkStatusNotifier()
      : super(dataSource: _FakeNetworkDataSource());
}

class _FakeNetworkDataSource implements NetworkStatusDataSource {
  @override
  bool get isNavigatorOnline => true;
  @override
  Stream<void> get onOnline => const Stream.empty();
  @override
  Stream<void> get onOffline => const Stream.empty();
  @override
  Future<bool> checkServerReachable(String url) async => true;
}

void main() {
  late _TestMessageApi testApi;
  late ChatNotifierWithOutbox notifier;
  late _SpyMessageOutbox spyOutbox;
  late FakeWsClientPort fakeWsClient;
  late _MockE2eeMetaStore mockE2eeMetaStore;

  setUp(() {
    testApi = _TestMessageApi();
    spyOutbox = _SpyMessageOutbox();
    fakeWsClient = FakeWsClientPort();
    mockE2eeMetaStore = _MockE2eeMetaStore(FakeSecureStoragePort({
      'e2ee_device_id': 'test-device-id',
    }));
    final e2eeManager = _TestableE2eeManager(metaStore: mockE2eeMetaStore);

    notifier = ChatNotifierWithOutbox(
      testApi,
      MessagePipeline(),
      fakeWsClient,
      () => 'user-1',
      e2eeManager,
      mockE2eeMetaStore,
      spyOutbox,
      _FakeNetworkStatusNotifier(),
      NoopAnalyticsAdapter(),
    );
  });

  tearDown(() {
    notifier.dispose();
    spyOutbox.dispose();
    fakeWsClient.dispose();
  });

  // =========================================================================
  // 1. sendMessage defaults messageType to TEXT
  // =========================================================================

  group('sendMessage default messageType', () {
    test('sendMessage without explicit messageType sends TEXT', () async {
      testApi.sendPrivateMessageResponse = const Message(
        id: 'server-1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      final result = await notifier.sendMessage('user-2', 'Hello');

      expect(result, isNotNull);
      expect(testApi.sendPrivateMessageCallCount, 1);
      expect(testApi.lastSendPrivateRequest, isNotNull);
      expect(testApi.lastSendPrivateRequest!.messageType, 'TEXT');
    });

    test('sendMessage with explicit messageType passes it through', () async {
      testApi.sendPrivateMessageResponse = const Message(
        id: 'server-1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      final result = await notifier.sendMessage(
        'user-2',
        '',
        messageType: 'IMAGE',
        mediaUrl: 'https://example.com/img.png',
      );

      expect(result, isNotNull);
      expect(testApi.lastSendPrivateRequest!.messageType, 'IMAGE');
    });
  });

  // =========================================================================
  // 2. sendGroupMessage defaults messageType to TEXT
  // =========================================================================

  group('sendGroupMessage default messageType', () {
    test('sendGroupMessage without explicit messageType sends TEXT', () async {
      testApi.sendGroupMessageResponse = const Message(
        id: 'server-g1',
        senderId: 'user-1',
        isGroupChat: true,
        messageType: 'TEXT',
        content: 'Hello group',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      final result = await notifier.sendGroupMessage('group-1', 'Hello group');

      expect(result, isNotNull);
      expect(testApi.sendGroupMessageCallCount, 1);
      expect(testApi.lastSendGroupRequest, isNotNull);
      expect(testApi.lastSendGroupRequest!.messageType, 'TEXT');
    });

    test('sendGroupMessage with explicit messageType passes it through',
        () async {
      testApi.sendGroupMessageResponse = const Message(
        id: 'server-g2',
        senderId: 'user-1',
        isGroupChat: true,
        messageType: 'FILE',
        content: '',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      final result = await notifier.sendGroupMessage(
        'group-1',
        '',
        messageType: 'FILE',
        mediaUrl: 'https://example.com/doc.pdf',
      );

      expect(result, isNotNull);
      expect(testApi.lastSendGroupRequest!.messageType, 'FILE');
    });
  });

  // =========================================================================
  // 3. SendPrivateMessageRequest default messageType
  // =========================================================================

  group('SendPrivateMessageRequest', () {
    test('default messageType is TEXT', () {
      const request = SendPrivateMessageRequest(
        receiverId: 'u2',
        content: 'Hello',
      );
      expect(request.messageType, 'TEXT');
    });

    test('toJson uses default TEXT when not specified', () {
      const request = SendPrivateMessageRequest(
        receiverId: 'u2',
        content: 'Hello',
      );
      final json = request.toJson();
      expect(json['messageType'], 'TEXT');
    });

    test('toJson uses explicit messageType', () {
      const request = SendPrivateMessageRequest(
        receiverId: 'u2',
        content: '',
        messageType: 'IMAGE',
      );
      final json = request.toJson();
      expect(json['messageType'], 'IMAGE');
    });
  });

  // =========================================================================
  // 4. SendGroupMessageRequest default messageType
  // =========================================================================

  group('SendGroupMessageRequest', () {
    test('default messageType is TEXT', () {
      const request = SendGroupMessageRequest(
        groupId: 'g1',
        content: 'Hello',
      );
      expect(request.messageType, 'TEXT');
    });

    test('toJson uses default TEXT when not specified', () {
      const request = SendGroupMessageRequest(
        groupId: 'g1',
        content: 'Hello',
      );
      final json = request.toJson();
      expect(json['messageType'], 'TEXT');
    });

    test('toJson uses explicit messageType', () {
      const request = SendGroupMessageRequest(
        groupId: 'g1',
        content: '',
        messageType: 'VOICE',
      );
      final json = request.toJson();
      expect(json['messageType'], 'VOICE');
    });
  });

  // =========================================================================
  // 5. Media message types remain uppercase
  // =========================================================================

  group('media message types stay uppercase', () {
    test('IMAGE messageType passes through sendPrivateMessage as uppercase',
        () async {
      testApi.sendPrivateMessageResponse = const Message(
        id: 'server-img',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      await notifier.sendMessage(
        'user-2',
        '',
        messageType: 'IMAGE',
        mediaUrl: 'https://example.com/photo.jpg',
      );

      expect(testApi.lastSendPrivateRequest!.messageType, 'IMAGE');
    });

    test('FILE messageType passes through sendGroupMessage as uppercase',
        () async {
      testApi.sendGroupMessageResponse = const Message(
        id: 'server-file',
        senderId: 'user-1',
        isGroupChat: true,
        messageType: 'FILE',
        content: '',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      await notifier.sendGroupMessage(
        'group-1',
        '',
        messageType: 'FILE',
        mediaUrl: 'https://example.com/doc.pdf',
      );

      expect(testApi.lastSendGroupRequest!.messageType, 'FILE');
    });

    test('VOICE messageType passes through sendPrivateMessage as uppercase',
        () async {
      testApi.sendPrivateMessageResponse = const Message(
        id: 'server-voice',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'VOICE',
        content: '',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      await notifier.sendMessage(
        'user-2',
        '',
        messageType: 'VOICE',
        mediaUrl: 'https://example.com/voice.opus',
      );

      expect(testApi.lastSendPrivateRequest!.messageType, 'VOICE');
    });

    test('IMAGE on outbox enqueue preserves uppercase', () async {
      testApi.errorToThrow = Exception('Network error');

      await notifier.sendMessage(
        'user-2',
        '',
        messageType: 'IMAGE',
        mediaUrl: 'https://example.com/img.png',
      );

      expect(spyOutbox.enqueueCalls.length, 1);
      expect(spyOutbox.enqueueCalls.first['messageType'], 'IMAGE');
    });

    test('VOICE on outbox enqueue preserves uppercase', () async {
      testApi.errorToThrow = Exception('Network error');

      await notifier.sendGroupMessage(
        'group-1',
        '',
        messageType: 'VOICE',
        mediaUrl: 'https://example.com/voice.opus',
      );

      expect(spyOutbox.enqueueCalls.length, 1);
      expect(spyOutbox.enqueueCalls.first['messageType'], 'VOICE');
    });
  });
}
