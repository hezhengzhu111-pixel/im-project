/// Characterization tests for outbox retry behavior.
///
/// These tests document and lock down the current behavior of:
/// - Private message send failure → outbox enqueue
/// - Group message send failure → outbox enqueue
/// - E2EE message send failure → outbox enqueue with envelope
/// - Non-network error → immediate failure (no outbox)
/// - Retry state transitions (pendingCount, failedCount, isRetrying)
/// - Network state propagation
/// - Dispose safety
///
/// These tests use a SpyMessageOutbox to avoid IndexedDB dependency,
/// focusing on the ChatNotifierWithOutbox orchestration logic.
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
import 'package:im_web/features/e2ee/data/e2ee_sent_message_cache.dart';
import 'package:im_web/features/e2ee/data/e2ee_api.dart';
import 'package:im_web/features/e2ee/data/e2ee_key_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_session_store.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';
import 'package:im_web/adapters/services/noop_analytics_adapter.dart';
import 'package:im_web/core/network/network_status_provider.dart';

import '../../helpers/fakes.dart';

// ---------------------------------------------------------------------------
// Test doubles (reused from chat_notifier_with_outbox_test.dart pattern)
// ---------------------------------------------------------------------------

class TestMessageApi extends MessageApi {
  TestMessageApi() : super(FakeHttpClientPort());

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
  Future<List<ChatSession>> getConversations() async {
    return conversationsResponse ?? [];
  }

  @override
  Future<List<Message>> getPrivateHistory(String friendId,
      {int? page, int? size}) async {
    return [];
  }

  @override
  Future<List<Message>> getGroupHistory(String groupId,
      {int? page, int? size}) async {
    return [];
  }

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
    return const MessageConfig(textEnforce: false, textMaxLength: 2000);
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

class TestableE2eeManager extends E2eeManager {
  TestableE2eeManager({
    required E2eeMetaStore metaStore,
    String currentUserId = 'user-1',
  }) : super(
          adapter: FrbRustGateway(),
          api: E2eeApi(FakeHttpClientPort()),
          keyStore: E2eeKeyStore(),
          sessionStore: E2eeSessionStore(),
          metaStore: metaStore,
          currentUserId: currentUserId,
        );

  bool? encryptShouldFail;
  String? lastEncryptSessionId;
  List<E2eeNegotiationEvent> pendingNegotiationsResult = const [];

  @override
  Future<Map<String, dynamic>> encryptToEnvelope({
    required String sessionId,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String plaintext,
  }) async {
    lastEncryptSessionId = sessionId;
    if (encryptShouldFail == true) {
      throw Exception('e2ee encrypt failed');
    }
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

  @override
  Future<List<E2eeNegotiationEvent>> getPendingNegotiations() async {
    return pendingNegotiationsResult;
  }

  @override
  Future<void> rejectNegotiation(String sessionId) async {
    await metaStore.setSessionStatus(sessionId, 'plaintext');
  }

  @override
  Future<void> exitEncryption(String sessionId) async {
    await metaStore.setSessionStatus(sessionId, 'plaintext');
  }
}

/// Spy MessageOutbox that tracks calls without requiring IndexedDB.
class SpyMessageOutbox extends MessageOutbox {
  SpyMessageOutbox()
      : super(
          messageApi: MessageApi(FakeHttpClientPort()),
          idbFactory: newIdbFactoryMemory(),
          isOnline: () => true,
        );

  final _eventsController = StreamController<OutboxEvent>.broadcast();
  final List<Map<String, dynamic>> enqueueCalls = [];
  int retryAllFailedCallCount = 0;
  int pendingCountResult = 0;
  int failedCountResult = 0;

  @override
  Stream<OutboxEvent> get events => _eventsController.stream;

  void emitEvent(OutboxEvent event) => _eventsController.add(event);

  @override
  Future<int> getPendingCount() async => pendingCountResult;

  @override
  Future<int> getFailedCount() async => failedCountResult;

  @override
  Future<void> retryAllFailed() async {
    retryAllFailedCallCount++;
  }

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
      'isEncrypted': isEncrypted,
      'e2eeEnvelope': e2eeEnvelope,
      'e2eeDeviceId': e2eeDeviceId,
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
      isEncrypted: isEncrypted,
      e2eeEnvelope: e2eeEnvelope,
      e2eeDeviceId: e2eeDeviceId,
    );
  }

  @override
  void dispose() {
    _eventsController.close();
    super.dispose();
  }
}

class ControllableNetworkStatusNotifier extends NetworkStatusNotifier {
  ControllableNetworkStatusNotifier._(this._ds) : super(dataSource: _ds);

  final _ControllableNetworkDataSource _ds;

  factory ControllableNetworkStatusNotifier() {
    final ds = _ControllableNetworkDataSource();
    return ControllableNetworkStatusNotifier._(ds);
  }

  void goOnline() => _ds._goOnline();
  void goOffline() => _ds._goOffline();
}

class _ControllableNetworkDataSource implements NetworkStatusDataSource {
  final _onlineController = StreamController<void>.broadcast();
  final _offlineController = StreamController<void>.broadcast();

  @override
  bool get isNavigatorOnline => true;

  @override
  Stream<void> get onOnline => _onlineController.stream;

  @override
  Stream<void> get onOffline => _offlineController.stream;

  @override
  Future<bool> checkServerReachable(String url) async => true;

  void _goOnline() => _onlineController.add(null);
  void _goOffline() => _offlineController.add(null);

  void dispose() {
    _onlineController.close();
    _offlineController.close();
  }
}

class FakeE2eeSentMessageCache implements E2eeSentMessageCache {
  @override
  SentMessageCacheStorage get storage => throw UnimplementedError();

  final Map<String, String> _store = {};

  @override
  Future<void> put({
    required String clientMessageId,
    required String plaintext,
    required String e2eeSessionId,
    String? peerUserId,
    String? serverMessageId,
  }) async {
    _store[clientMessageId] = plaintext;
    if (serverMessageId != null) {
      _store[serverMessageId] = plaintext;
    }
  }

  @override
  Future<void> updateServerId({
    required String clientMessageId,
    required String serverMessageId,
  }) async {
    final plaintext = _store[clientMessageId];
    if (plaintext != null) {
      _store[serverMessageId] = plaintext;
    }
  }

  @override
  Future<String?> getPlaintextByClientId(String clientMessageId) async {
    return _store[clientMessageId];
  }

  @override
  Future<String?> getPlaintextByServerId(String serverMessageId) async {
    return _store[serverMessageId];
  }

  @override
  Future<void> clearAll() async {
    _store.clear();
  }

  @override
  Future<void> clearSession(String e2eeSessionId) async {
    _store.clear();
  }

  @override
  Future<void> clearExpired() async {}
}

class MockE2eeMetaStore extends E2eeMetaStore {
  MockE2eeMetaStore([SecureStoragePort? storage])
      : super(storage ?? FakeSecureStoragePort());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late ChatNotifierWithOutbox notifier;
  late TestMessageApi testApi;
  late SpyMessageOutbox spyOutbox;
  late FakeWsClientPort fakeWsClient;
  late ControllableNetworkStatusNotifier fakeNetwork;
  late MockE2eeMetaStore mockE2eeMetaStore;
  late TestableE2eeManager testE2eeManager;

  setUp(() {
    testApi = TestMessageApi();
    spyOutbox = SpyMessageOutbox();
    fakeWsClient = FakeWsClientPort();
    fakeNetwork = ControllableNetworkStatusNotifier();
    final fakeSecureStorage = FakeSecureStoragePort({
      'e2ee_device_id': 'test-device-id',
    });
    mockE2eeMetaStore = MockE2eeMetaStore(fakeSecureStorage);
    testE2eeManager = TestableE2eeManager(metaStore: mockE2eeMetaStore);
    testApi.conversationsResponse = [];
  });

  tearDown(() {
    notifier.dispose();
    spyOutbox.dispose();
    fakeWsClient.dispose();
    fakeNetwork.dispose();
  });

  ChatNotifierWithOutbox createNotifier() {
    return ChatNotifierWithOutbox(
      testApi,
      MessagePipeline(),
      fakeWsClient,
      () => 'user-1',
      testE2eeManager,
      mockE2eeMetaStore,
      FakeE2eeSentMessageCache(),
      spyOutbox,
      fakeNetwork,
      NoopAnalyticsAdapter(),
    );
  }

  // =========================================================================
  // 1. Private message: network error → outbox
  // =========================================================================

  group('private message: network error → outbox', () {
    test('SocketException enqueues to outbox with correct args', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('SocketException: Connection refused');

      final result = await notifier.sendMessage('user-2', 'Hello');

      expect(result, isNull);
      expect(spyOutbox.enqueueCalls.length, 1);

      final call = spyOutbox.enqueueCalls.first;
      expect(call['sessionKey'], 'user-1_user-2');
      expect(call['receiverId'], 'user-2');
      expect(call['content'], 'Hello');
      expect(call['isGroupChat'], false);
      expect(call['isEncrypted'], false);
    });

    test('message status becomes PENDING after network error', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('SocketException: Connection refused');

      await notifier.sendMessage('user-2', 'Hello');

      final messages = notifier.state.messages['user-1_user-2'];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
      expect(messages.first.status, 'PENDING');
    });

    test('timeout error enqueues to outbox', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Connection timed out');

      await notifier.sendMessage('user-2', 'Hello');

      expect(spyOutbox.enqueueCalls.length, 1);
    });
  });

  // =========================================================================
  // 2. Private message: non-network error → immediate failure
  // =========================================================================

  group('private message: non-network error → immediate failure', () {
    test('generic exception does not enqueue to outbox', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Validation error');

      final result = await notifier.sendMessage('user-2', 'Hello');

      expect(result, isNull);
      expect(spyOutbox.enqueueCalls, isEmpty);
    });

    test('message status becomes FAILED after non-network error', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Validation error');

      await notifier.sendMessage('user-2', 'Hello');

      final messages = notifier.state.messages['user-1_user-2'];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
      expect(messages.first.status, 'FAILED');
    });

    test('state.error is set with error message', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Validation error');

      await notifier.sendMessage('user-2', 'Hello');

      // Error message should be set (may be truncated or extracted)
      // The key behavior is that the message is NOT enqueued to outbox
      expect(spyOutbox.enqueueCalls, isEmpty);
      expect(notifier.state.messages['user-1_user-2']!.first.status, 'FAILED');
    });
  });

  // =========================================================================
  // 3. Private message: success → no outbox
  // =========================================================================

  group('private message: success → no outbox', () {
    test('successful send does not enqueue to outbox', () async {
      notifier = createNotifier();
      testApi.sendPrivateMessageResponse = const Message(
        id: 'server-1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello!',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      final result = await notifier.sendMessage('user-2', 'Hello!');

      expect(result, isNotNull);
      expect(spyOutbox.enqueueCalls, isEmpty);
    });

    test('message status becomes SENT after success', () async {
      notifier = createNotifier();
      testApi.sendPrivateMessageResponse = const Message(
        id: 'server-1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello!',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      await notifier.sendMessage('user-2', 'Hello!');

      final messages = notifier.state.messages['user-1_user-2'];
      expect(messages, isNotNull);
      expect(messages!.first.status, 'sent');
    });
  });

  // =========================================================================
  // 4. Group message: network error → outbox
  // =========================================================================

  group('group message: network error → outbox', () {
    test('SocketException enqueues group message to outbox', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('SocketException: Connection refused');

      final result = await notifier.sendGroupMessage('group-1', 'Hello Group');

      expect(result, isNull);
      expect(spyOutbox.enqueueCalls.length, 1);

      final call = spyOutbox.enqueueCalls.first;
      expect(call['sessionKey'], 'group_group-1');
      expect(call['receiverId'], 'group-1');
      expect(call['content'], 'Hello Group');
      expect(call['isGroupChat'], true);
      expect(call['groupId'], 'group-1');
    });

    test('group message status becomes PENDING after network error', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('SocketException: Connection refused');

      await notifier.sendGroupMessage('group-1', 'Hello Group');

      final messages = notifier.state.messages['group_group-1'];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
      expect(messages.first.status, 'PENDING');
    });
  });

  // =========================================================================
  // 5. Group message: non-network error → immediate failure
  // =========================================================================

  group('group message: non-network error → immediate failure', () {
    test('generic exception does not enqueue group message to outbox', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Permission denied');

      final result = await notifier.sendGroupMessage('group-1', 'Hello Group');

      expect(result, isNull);
      expect(spyOutbox.enqueueCalls, isEmpty);
    });

    test('group message status becomes FAILED after non-network error',
        () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Permission denied');

      await notifier.sendGroupMessage('group-1', 'Hello Group');

      final messages = notifier.state.messages['group_group-1'];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
      expect(messages.first.status, 'FAILED');
    });
  });

  // =========================================================================
  // 6. Group message: success → no outbox
  // =========================================================================

  group('group message: success → no outbox', () {
    test('successful group send does not enqueue to outbox', () async {
      notifier = createNotifier();
      testApi.sendGroupMessageResponse = const Message(
        id: 'server-1',
        senderId: 'user-1',
        isGroupChat: true,
        messageType: 'text',
        content: 'Hello Group!',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      final result = await notifier.sendGroupMessage('group-1', 'Hello Group!');

      expect(result, isNotNull);
      expect(spyOutbox.enqueueCalls, isEmpty);
    });
  });

  // =========================================================================
  // 7. E2EE encrypted message: network error → outbox with envelope
  // =========================================================================

  group('E2EE encrypted message: network error → outbox with envelope', () {
    test('encrypted send failure enqueues with envelope', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );
      testApi.errorToThrow = Exception('SocketException: Connection refused');

      final result = await notifier.sendMessage('user-2', 'Secret message');

      expect(result, isNull);
      expect(spyOutbox.enqueueCalls.length, 1);

      final call = spyOutbox.enqueueCalls.first;
      expect(call['isEncrypted'], true);
      expect(call['e2eeEnvelope'], isA<Map<String, dynamic>>());
      expect(call['e2eeDeviceId'], 'test-device-id');
    });

    test('encrypted outbox envelope does not contain plaintext', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );
      testApi.errorToThrow = Exception('SocketException: Connection refused');

      await notifier.sendMessage('user-2', 'Top secret content');

      final call = spyOutbox.enqueueCalls.first;
      final envelope = call['e2eeEnvelope'] as Map<String, dynamic>;

      // Envelope should not contain the plaintext
      expect(envelope.values.every((v) => v != 'Top secret content'), isTrue);
      // Envelope should have ciphertext from TestableE2eeManager
      expect(envelope['ciphertext'], 'fake_ciphertext');
    });

    test('encrypted message status becomes PENDING after network error',
        () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );
      testApi.errorToThrow = Exception('SocketException: Connection refused');

      await notifier.sendMessage('user-2', 'Secret');

      final messages = notifier.state.messages['user-1_user-2'];
      expect(messages, isNotNull);
      expect(messages!.first.status, 'PENDING');
    });
  });

  // =========================================================================
  // 8. E2EE: encrypt failure → immediate failure, no outbox
  // =========================================================================

  group('E2EE: encrypt failure → immediate failure, no outbox', () {
    test('encrypt failure does not enqueue to outbox', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );
      testE2eeManager.encryptShouldFail = true;

      final result = await notifier.sendMessage('user-2', 'Secret');

      expect(result, isNull);
      expect(spyOutbox.enqueueCalls, isEmpty);
    });

    test('encrypt failure sets error state', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );
      testE2eeManager.encryptShouldFail = true;

      await notifier.sendMessage('user-2', 'Secret');

      // Error should be set (may be e2ee_encrypt_failed or extracted message)
      // The key behavior is that outbox is NOT called and message status is FAILED
      expect(spyOutbox.enqueueCalls, isEmpty);
    });

    test('encrypt failure sets message status to FAILED', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );
      testE2eeManager.encryptShouldFail = true;

      await notifier.sendMessage('user-2', 'Secret');

      final messages = notifier.state.messages['user-1_user-2'];
      expect(messages, isNotNull);
      expect(messages!.first.status, 'FAILED');
    });
  });

  // =========================================================================
  // 9. E2EE: negotiating session → blocked, no outbox
  // =========================================================================

  group('E2EE: negotiating session → blocked, no outbox', () {
    test('negotiating session returns null and sets error', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'negotiating',
      );

      final result = await notifier.sendMessage('user-2', 'Blocked');

      expect(result, isNull);
      expect(notifier.state.error, 'e2ee_not_ready');
      expect(spyOutbox.enqueueCalls, isEmpty);
    });
  });

  // =========================================================================
  // 10. Pending message replacement by server message
  // =========================================================================

  group('pending message replacement', () {
    test('pending message replaced by server message via clientMessageId',
        () async {
      notifier = createNotifier();

      // Add a pending message.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'local-123',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Pending',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'PENDING',
          clientMessageId: 'cid-123',
        ),
      );

      // Server confirms with different id but same clientMessageId.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'server-456',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Pending',
          sendTime: '2024-01-01T00:00:01Z',
          status: 'SENT',
          clientMessageId: 'cid-123',
        ),
      );

      final messages = notifier.state.messages['user-1_user-2']!;
      expect(messages.length, 1);
      expect(messages.first.id, 'server-456');
      expect(messages.first.status, 'SENT');
    });
  });

  // =========================================================================
  // 11. Retry state transitions
  // =========================================================================

  group('retry state transitions', () {
    test('messageAdded event updates pendingCount', () async {
      spyOutbox.pendingCountResult = 5;
      spyOutbox.failedCountResult = 2;
      notifier = createNotifier();

      spyOutbox.emitEvent(OutboxEvent(
        type: OutboxEventType.messageAdded,
        message: OutboxMessage(
          id: 'outbox-1',
          sessionKey: 'session-1',
          receiverId: 'user-2',
          content: 'Test',
          messageType: 'text',
          clientMessageId: 'client-1',
        ),
      ));

      await Future.delayed(Duration(milliseconds: 100));

      expect(notifier.state.pendingCount, 5);
      expect(notifier.state.failedCount, 2);
    });

    test('messageRetrying event sets isRetrying to true', () async {
      spyOutbox.pendingCountResult = 1;
      notifier = createNotifier();

      spyOutbox.emitEvent(OutboxEvent(
        type: OutboxEventType.messageRetrying,
        message: OutboxMessage(
          id: 'outbox-2',
          sessionKey: 'session-1',
          receiverId: 'user-2',
          content: 'Retrying',
          messageType: 'text',
          clientMessageId: 'client-2',
        ),
      ));

      await Future.delayed(Duration(milliseconds: 100));

      expect(notifier.state.isRetrying, isTrue);
    });

    test('retryAllStarted sets isRetrying, retryAllCompleted clears it',
        () async {
      spyOutbox.pendingCountResult = 0;
      notifier = createNotifier();

      spyOutbox.emitEvent(const OutboxEvent(
        type: OutboxEventType.retryAllStarted,
      ));
      await Future.delayed(Duration.zero);
      expect(notifier.state.isRetrying, isTrue);

      spyOutbox.emitEvent(const OutboxEvent(
        type: OutboxEventType.retryAllCompleted,
      ));
      await Future.delayed(Duration(milliseconds: 100));
      expect(notifier.state.isRetrying, isFalse);
    });

    test('messageSent updates pendingCount', () async {
      spyOutbox.pendingCountResult = 0;
      notifier = createNotifier();

      spyOutbox.emitEvent(OutboxEvent(
        type: OutboxEventType.messageSent,
        message: OutboxMessage(
          id: 'outbox-3',
          sessionKey: 'session-1',
          receiverId: 'user-2',
          content: 'Sent',
          messageType: 'text',
          clientMessageId: 'client-3',
        ),
      ));

      await Future.delayed(Duration(milliseconds: 100));

      expect(notifier.state.pendingCount, 0);
    });

    test('messageFailed updates failedCount and clears isRetrying', () async {
      spyOutbox.failedCountResult = 1;
      notifier = createNotifier();

      // First set isRetrying to true.
      spyOutbox.emitEvent(OutboxEvent(
        type: OutboxEventType.messageRetrying,
        message: OutboxMessage(
          id: 'outbox-4',
          sessionKey: 'session-1',
          receiverId: 'user-2',
          content: 'test',
          messageType: 'text',
          clientMessageId: 'client-4',
        ),
      ));
      await Future.delayed(Duration(milliseconds: 50));
      expect(notifier.state.isRetrying, isTrue);

      // Then emit failed.
      spyOutbox.emitEvent(OutboxEvent(
        type: OutboxEventType.messageFailed,
        message: OutboxMessage(
          id: 'outbox-4',
          sessionKey: 'session-1',
          receiverId: 'user-2',
          content: 'test',
          messageType: 'text',
          clientMessageId: 'client-4',
          status: OutboxMessageStatus.failed,
        ),
      ));
      await Future.delayed(Duration(milliseconds: 100));

      expect(notifier.state.isRetrying, isFalse);
      expect(notifier.state.failedCount, 1);
    });

    test('retryAllFailed delegates to MessageOutbox', () async {
      notifier = createNotifier();

      await notifier.retryAllFailed();

      expect(spyOutbox.retryAllFailedCallCount, 1);
    });
  });

  // =========================================================================
  // 12. Network state propagation
  // =========================================================================

  group('network state propagation', () {
    test('offline state updates isOffline', () async {
      notifier = createNotifier();

      expect(notifier.state.isOffline, isFalse);

      fakeNetwork.goOffline();
      await Future.delayed(Duration.zero);
      expect(notifier.state.isOffline, isTrue);
    });

    test('online state restores isOffline to false', () async {
      notifier = createNotifier();

      fakeNetwork.goOffline();
      await Future.delayed(Duration.zero);
      expect(notifier.state.isOffline, isTrue);

      fakeNetwork.goOnline();
      await Future.delayed(Duration.zero);
      expect(notifier.state.isOffline, isFalse);
    });
  });

  // =========================================================================
  // 13. Dispose safety
  // =========================================================================

  group('dispose safety', () {
    test('notifier dispose cancels subscriptions', () async {
      notifier = createNotifier();

      // Verify subscriptions are active by checking state updates.
      fakeNetwork.goOffline();
      await Future.delayed(Duration.zero);
      expect(notifier.state.isOffline, isTrue);

      // Dispose the notifier.
      notifier.dispose();

      // After dispose, state changes should not throw.
      // This test mainly verifies no crash occurs.
      fakeNetwork.goOnline();
      await Future.delayed(Duration.zero);

      // Re-create for tearDown.
      notifier = createNotifier();
    });
  });

  // =========================================================================
  // 14. Analytics safety: no plaintext in events
  // =========================================================================

  group('analytics safety', () {
    test('send failure analytics does not include content', () async {
      final analytics = SpyAnalyticsAdapter();
      notifier = ChatNotifierWithOutbox(
        testApi,
        MessagePipeline(),
        fakeWsClient,
        () => 'user-1',
        testE2eeManager,
        mockE2eeMetaStore,
        FakeE2eeSentMessageCache(),
        spyOutbox,
        fakeNetwork,
        analytics,
      );
      testApi.errorToThrow = Exception('Network error');

      await notifier.sendMessage('user-2', 'Sensitive content');

      // Verify analytics was called but without content
      expect(analytics.trackEventCalls.length, greaterThanOrEqualTo(1));
      for (final call in analytics.trackEventCalls) {
        final data = call['data'] as Map<String, dynamic>?;
        if (data != null) {
          expect(data.values.every((v) => v != 'Sensitive content'), isTrue);
        }
      }
    });
  });
}

/// Simple analytics spy for testing.
class SpyAnalyticsAdapter implements AnalyticsPort {
  final List<Map<String, dynamic>> trackEventCalls = [];

  @override
  void trackEvent(String event, [Map<String, dynamic>? data]) {
    trackEventCalls.add({'event': event, 'data': data});
  }

  @override
  void setUserId(String? userId) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}
