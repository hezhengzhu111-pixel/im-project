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

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/// Testable MessageApi that tracks calls and can simulate failures.
class TestMessageApi extends MessageApi {
  TestMessageApi() : super(FakeHttpClientPort());

  List<ChatSession>? conversationsResponse;
  List<Message>? privateHistoryResponse;
  List<Message>? groupHistoryResponse;
  Message? sendPrivateMessageResponse;
  Message? sendGroupMessageResponse;
  Message? sendPrivateEncryptedResponse;
  Exception? errorToThrow;

  int getConversationsCallCount = 0;
  int sendPrivateMessageCallCount = 0;
  int sendGroupMessageCallCount = 0;
  int sendPrivateEncryptedCallCount = 0;
  int markReadCallCount = 0;
  String? lastMarkReadConversationId;

  SendPrivateMessageRequest? lastSendPrivateRequest;
  SendGroupMessageRequest? lastSendGroupRequest;
  Map<String, dynamic>? lastEncryptedArgs;

  @override
  Future<List<ChatSession>> getConversations() async {
    getConversationsCallCount++;
    if (errorToThrow != null) throw errorToThrow!;
    return conversationsResponse ?? [];
  }

  @override
  Future<List<Message>> getPrivateHistory(String friendId,
      {int? page, int? size}) async {
    if (errorToThrow != null) throw errorToThrow!;
    return privateHistoryResponse ?? [];
  }

  @override
  Future<List<Message>> getGroupHistory(String groupId,
      {int? page, int? size}) async {
    if (errorToThrow != null) throw errorToThrow!;
    return groupHistoryResponse ?? [];
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
  Future<void> markRead(String conversationId) async {
    markReadCallCount++;
    lastMarkReadConversationId = conversationId;
  }

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

/// Testable E2eeManager that overrides encrypt/decrypt to avoid WASM dependency.
///
/// Uses real E2eeManager constructor (with real adapter + empty stores) but
/// overrides encryptToEnvelope to return a fake envelope without touching crypto.
class TestableE2eeManager extends E2eeManager {
  TestableE2eeManager({
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

  String? lastRespondSessionId;
  Map<String, dynamic>? lastRespondPayload;
  bool respondResult = true;
  String? lastInitiateSessionId;
  String? lastInitiatePeerId;
  String? lastEncryptSessionId;
  bool initiateResult = true;
  List<E2eeNegotiationEvent> pendingNegotiationsResult = const [];

  @override
  Future<bool> initiateNegotiation(String sessionId, String peerId) async {
    lastInitiateSessionId = sessionId;
    lastInitiatePeerId = peerId;
    return initiateResult;
  }

  @override
  Future<bool> respondToNegotiation(
    String sessionId,
    Map<String, dynamic> requestPayload,
  ) async {
    lastRespondSessionId = sessionId;
    lastRespondPayload = requestPayload;
    return respondResult;
  }

  @override
  Future<Map<String, dynamic>> encryptToEnvelope({
    required String sessionId,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String plaintext,
  }) async {
    lastEncryptSessionId = sessionId;
    // Return a fake envelope containing no trace of the plaintext.
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

/// Spy MessageOutbox that tracks enqueue and retryAllFailed calls
/// without requiring IndexedDB.
class SpyMessageOutbox extends MessageOutbox {
  SpyMessageOutbox()
      : super(
          messageApi: MessageApi(FakeHttpClientPort()),
          idbFactory: newIdbFactoryMemory(),
          isOnline: () => true,
        );

  final _eventsController = StreamController<OutboxEvent>.broadcast();

  /// Recorded enqueue calls (as argument maps).
  final List<Map<String, dynamic>> enqueueCalls = [];

  /// Number of times retryAllFailed was called.
  int retryAllFailedCallCount = 0;

  /// Configurable return values for count methods.
  int pendingCountResult = 0;
  int failedCountResult = 0;

  @override
  Stream<OutboxEvent> get events => _eventsController.stream;

  /// Emit an event to listeners (test helper).
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

/// Controllable NetworkStatusNotifier that exposes goOnline/goOffline methods.
class ControllableNetworkStatusNotifier extends NetworkStatusNotifier {
  ControllableNetworkStatusNotifier._(this._ds) : super(dataSource: _ds);

  final _ControllableNetworkDataSource _ds;

  factory ControllableNetworkStatusNotifier() {
    final ds = _ControllableNetworkDataSource();
    return ControllableNetworkStatusNotifier._(ds);
  }

  /// Simulate the browser going online.
  void goOnline() => _ds._goOnline();

  /// Simulate the browser going offline.
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

/// Mock E2eeMetaStore backed by FakeSecureStorage.
///
/// Accepts an optional pre-seeded [SecureStoragePort] so callers can inject
/// values (e.g. device ID) before the notifier tries to call getOrCreateDeviceId.
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
    // Pre-seed device ID to avoid calling the buggy _generateUuid in tests.
    final fakeSecureStorage = FakeSecureStoragePort({
      'e2ee_device_id': 'test-device-id',
    });
    mockE2eeMetaStore = MockE2eeMetaStore(fakeSecureStorage);
    testE2eeManager = TestableE2eeManager(metaStore: mockE2eeMetaStore);

    // Default: return empty sessions so loadSessions doesn't fail.
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
      spyOutbox,
      fakeNetwork,
      NoopAnalyticsAdapter(),
    );
  }

  // =========================================================================
  // Step 3: Send private message enqueues to outbox on failure
  // =========================================================================

  group('send private message enqueues to outbox on failure', () {
    test('calls outbox.enqueue with correct args when API throws', () async {
      notifier = createNotifier();

      // Simulate network failure.
      testApi.errorToThrow = Exception('Network error');

      final result = await notifier.sendMessage('user-2', 'Hello');

      // Message was not sent successfully.
      expect(result, isNull);

      // Verify outbox.enqueue was called once.
      expect(spyOutbox.enqueueCalls.length, 1);

      final call = spyOutbox.enqueueCalls.first;
      expect(call['sessionKey'], 'user-1_user-2');
      expect(call['receiverId'], 'user-2');
      expect(call['content'], 'Hello');
      expect(call['messageType'], 'TEXT');
      expect(call['clientMessageId'], isNotNull);
      expect(call['isGroupChat'], false);
      expect(call['isEncrypted'], false);
    });

    test('marks message status as PENDING in UI state', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Network error');

      await notifier.sendMessage('user-2', 'Hello');

      // The pending message should be in the state with status PENDING.
      final messages = notifier.state.messages['user-1_user-2'];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
      expect(messages.first.status, 'PENDING');
    });
  });

  // =========================================================================
  // Step 4: Send group message enqueues to outbox on failure
  // =========================================================================

  group('send group message enqueues to outbox on failure', () {
    test('calls outbox.enqueue with correct group args when API throws',
        () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Network error');

      final result = await notifier.sendGroupMessage('group-1', 'Hello Group');

      expect(result, isNull);

      expect(spyOutbox.enqueueCalls.length, 1);

      final call = spyOutbox.enqueueCalls.first;
      expect(call['sessionKey'], 'group_group-1');
      expect(call['receiverId'], 'group-1');
      expect(call['content'], 'Hello Group');
      expect(call['messageType'], 'TEXT');
      expect(call['isGroupChat'], true);
      expect(call['groupId'], 'group-1');
    });

    test('marks group message status as PENDING in UI state', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('Network error');

      await notifier.sendGroupMessage('group-1', 'Hello Group');

      final messages = notifier.state.messages['group_group-1'];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
      expect(messages.first.status, 'PENDING');
    });
  });

  // =========================================================================
  // Step 5: Network state changes update UI
  // =========================================================================

  group('network state changes', () {
    test('network restoration updates isOffline state', () async {
      notifier = createNotifier();

      // Initially online.
      expect(notifier.state.isOffline, isFalse);

      // Simulate going offline.
      fakeNetwork.goOffline();
      // Allow stream listener to process.
      await Future.delayed(Duration.zero);
      expect(notifier.state.isOffline, isTrue);

      // Simulate going back online.
      fakeNetwork.goOnline();
      await Future.delayed(Duration.zero);
      expect(notifier.state.isOffline, isFalse);
    });

    test('retryAllFailed delegates to outbox', () async {
      notifier = createNotifier();

      await notifier.retryAllFailed();

      expect(spyOutbox.retryAllFailedCallCount, 1);
    });
  });

  // =========================================================================
  // Step 6: Outbox events update UI state
  // =========================================================================

  group('outbox events update UI state', () {
    test('messageAdded event triggers pending count update', () async {
      spyOutbox.pendingCountResult = 3;
      spyOutbox.failedCountResult = 1;
      notifier = createNotifier();

      // Emit a messageAdded event from the outbox.
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

      // Allow async _updateOutboxCounts to complete.
      await Future.delayed(Duration(milliseconds: 100));

      expect(notifier.state.pendingCount, 3);
      expect(notifier.state.failedCount, 1);
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

    test('messageFailed event sets isRetrying to false', () async {
      spyOutbox.failedCountResult = 1;
      notifier = createNotifier();

      // First set isRetrying to true.
      spyOutbox.emitEvent(OutboxEvent(
        type: OutboxEventType.messageRetrying,
        message: OutboxMessage(
          id: 'outbox-3',
          sessionKey: 'session-1',
          receiverId: 'user-2',
          content: 'test',
          messageType: 'text',
          clientMessageId: 'client-3',
        ),
      ));
      await Future.delayed(Duration(milliseconds: 50));
      expect(notifier.state.isRetrying, isTrue);

      // Then emit a failed event.
      spyOutbox.emitEvent(OutboxEvent(
        type: OutboxEventType.messageFailed,
        message: OutboxMessage(
          id: 'outbox-3',
          sessionKey: 'session-1',
          receiverId: 'user-2',
          content: 'test',
          messageType: 'text',
          clientMessageId: 'client-3',
          status: OutboxMessageStatus.failed,
        ),
      ));
      await Future.delayed(Duration(milliseconds: 100));

      expect(notifier.state.isRetrying, isFalse);
      expect(notifier.state.failedCount, 1);
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
  });

  // =========================================================================
  // Step 7: E2EE message security
  // =========================================================================

  group('E2EE message does not leak plaintext', () {
    test(
        'encrypted session sends via sendPrivateEncrypted, not sendPrivateMessage',
        () async {
      notifier = createNotifier();

      // Pre-seed: device ID and remote device ID for the session.
      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );

      final result = await notifier.sendMessage('user-2', 'Secret message');

      // Should have succeeded.
      expect(result, isNotNull);

      // Must NOT have used the plaintext API.
      expect(testApi.sendPrivateMessageCallCount, 0);

      // Must have used the encrypted API.
      expect(testApi.sendPrivateEncryptedCallCount, 1);
      expect(testApi.lastEncryptedArgs, isNotNull);
      expect(testApi.lastEncryptedArgs!['receiverId'], 'user-2');
      expect(testApi.lastEncryptedArgs!['messageType'], 'TEXT');
      expect(testApi.lastEncryptedArgs!['e2eeEnvelope'], isA<Map>());
      expect(testApi.lastEncryptedArgs!['e2eeDeviceId'], isNotEmpty);
    });

    test('encrypted session sends envelope, not plaintext content', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );

      await notifier.sendMessage('user-2', 'Top secret');

      // The encrypted envelope should come from TestableE2eeManager, not
      // contain the plaintext.
      final envelope = testApi.lastEncryptedArgs!['e2eeEnvelope'] as Map;
      expect(envelope['ciphertext'], 'fake_ciphertext');
      // Ensure no field contains the plaintext.
      expect(
        envelope.values.every((v) => v != 'Top secret'),
        isTrue,
      );
    });

    test('reverse participant uses the same canonical E2EE session id',
        () async {
      notifier = ChatNotifierWithOutbox(
        testApi,
        MessagePipeline(),
        fakeWsClient,
        () => 'user-2',
        testE2eeManager,
        mockE2eeMetaStore,
        spyOutbox,
        fakeNetwork,
        NoopAnalyticsAdapter(),
      );

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );

      final result = await notifier.sendMessage('user-1', 'Reverse secret');

      expect(result, isNotNull);
      expect(testApi.sendPrivateMessageCallCount, 0);
      expect(testApi.sendPrivateEncryptedCallCount, 1);
      expect(testE2eeManager.lastEncryptSessionId, 'p_user-1_user-2');
    });

    test('plaintext session sends via sendPrivateMessage', () async {
      notifier = createNotifier();

      // Default session status is 'plaintext'.
      final result = await notifier.sendMessage('user-2', 'Plain message');

      expect(result, isNotNull);

      // Must have used the plaintext API.
      expect(testApi.sendPrivateMessageCallCount, 1);
      expect(testApi.lastSendPrivateRequest, isNotNull);
      expect(testApi.lastSendPrivateRequest!.content, 'Plain message');

      // Must NOT have used the encrypted API.
      expect(testApi.sendPrivateEncryptedCallCount, 0);
    });

    test('negotiating session returns null and sets error', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'negotiating',
      );

      final result = await notifier.sendMessage('user-2', 'Blocked message');

      expect(result, isNull);
      expect(notifier.state.error, 'e2ee_not_ready');

      // Neither API should have been called.
      expect(testApi.sendPrivateMessageCallCount, 0);
      expect(testApi.sendPrivateEncryptedCallCount, 0);

      // Outbox should NOT have been called.
      expect(spyOutbox.enqueueCalls, isEmpty);
    });

    test('encrypted API failure queues retry with envelope', () async {
      notifier = createNotifier();

      await mockE2eeMetaStore.setSessionStatus(
        'p_user-1_user-2',
        'encrypted',
      );
      await mockE2eeMetaStore.setRemoteDeviceId(
        'p_user-1_user-2',
        'device-remote-1',
      );
      testApi.errorToThrow = Exception('Network error');

      final result = await notifier.sendMessage('user-2', 'Secret message');

      expect(result, isNull);
      expect(testApi.sendPrivateMessageCallCount, 0);
      expect(testApi.sendPrivateEncryptedCallCount, 1);
      expect(spyOutbox.enqueueCalls.length, 1);

      final call = spyOutbox.enqueueCalls.first;
      expect(call['isEncrypted'], true);
      expect(call['e2eeEnvelope'], isA<Map<String, dynamic>>());
      expect(call['e2eeDeviceId'], 'test-device-id');
      expect(
        (call['e2eeEnvelope'] as Map<String, dynamic>).values,
        isNot(contains('Secret message')),
      );
    });
  });

  // =========================================================================
  // E2EE negotiation state regression tests
  // =========================================================================

  group('E2EE negotiation state', () {
    test('caches requests per session and exposes the active session request',
        () async {
      notifier = createNotifier();
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
        const ChatSession(
          id: 'user-1_user-3',
          type: 'private',
          targetId: 'user-3',
          targetName: 'User 3',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();
      notifier.setActiveSession('user-1_user-2');

      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.e2eeNegotiation,
        data: {
          'action': 'request',
          'sessionId': 'p_user-2_user-1',
          'requesterId': 'user-2',
          'requesterName': 'User 2',
          'requestPayloadJson': '{"senderDeviceId":"device-2"}',
        },
      ));
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.e2eeNegotiation,
        data: {
          'action': 'request',
          'sessionId': 'p_user-3_user-1',
          'requesterId': 'user-3',
          'requesterName': 'User 3',
          'requestPayloadJson': '{"senderDeviceId":"device-3"}',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      expect(notifier.state.pendingNegotiations.length, 2);
      expect(
        notifier.activePendingNegotiation?.sessionId,
        'p_user-2_user-1',
      );
      expect(
        notifier.pendingNegotiationForSession('user-1_user-3')?.sessionId,
        'p_user-3_user-1',
      );
    });

    test('accepted event removes only the matching pending negotiation',
        () async {
      notifier = createNotifier();

      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.e2eeNegotiation,
        data: {
          'action': 'request',
          'sessionId': 'session-a',
          'requesterId': 'user-2',
        },
      ));
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.e2eeNegotiation,
        data: {
          'action': 'request',
          'sessionId': 'session-b',
          'requesterId': 'user-3',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.e2eeNegotiation,
        data: {
          'action': 'accepted',
          'sessionId': 'session-a',
          'requesterId': 'user-2',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      expect(notifier.state.pendingNegotiations.keys, ['session-b']);
      expect(
        await mockE2eeMetaStore.getSessionStatus('session-a'),
        'encrypted',
      );
      expect(
        await mockE2eeMetaStore.getSessionStatus('session-b'),
        'negotiating',
      );
    });

    test('loadSessions syncs server pending negotiations into session cache',
        () async {
      notifier = createNotifier();
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'custom-session-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      testE2eeManager.pendingNegotiationsResult = const [
        E2eeNegotiationEvent(
          sessionId: 'p_user-2_user-1',
          action: E2eeNegotiationAction.request,
          requesterId: 'user-2',
          requesterName: 'User 2',
          targetUserId: 'user-1',
          requestPayloadJson: '{"senderDeviceId":"device-2"}',
        ),
      ];

      await notifier.loadSessions();

      expect(notifier.state.pendingNegotiations.keys, ['custom-session-2']);
      expect(
        notifier.pendingNegotiationForSession('custom-session-2')?.sessionId,
        'p_user-2_user-1',
      );
      expect(
        await mockE2eeMetaStore.getSessionStatus('p_user-2_user-1'),
        'negotiating',
      );
    });

    test('rejected and disabled events clear only their own session state',
        () async {
      notifier = createNotifier();

      for (final sessionId in ['session-a', 'session-b', 'session-c']) {
        fakeWsClient.addEvent(FakeWsEvent(
          type: WsMessageType.e2eeNegotiation,
          data: {
            'action': 'request',
            'sessionId': sessionId,
            'requesterId': 'peer',
          },
        ));
      }
      await Future.delayed(Duration(milliseconds: 50));

      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.e2eeNegotiation,
        data: {
          'action': 'rejected',
          'sessionId': 'session-a',
          'requesterId': 'peer',
        },
      ));
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.e2eeNegotiation,
        data: {
          'action': 'disabled',
          'sessionId': 'session-b',
          'requesterId': 'peer',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      expect(notifier.state.pendingNegotiations.keys, ['session-c']);
      expect(
        await mockE2eeMetaStore.getSessionStatus('session-a'),
        'plaintext',
      );
      expect(
        await mockE2eeMetaStore.getSessionStatus('session-b'),
        'plaintext',
      );
      expect(
        await mockE2eeMetaStore.getSessionStatus('session-c'),
        'negotiating',
      );
    });

    test('acceptPendingNegotiation responds with cached payload', () async {
      notifier = createNotifier();

      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.e2eeNegotiation,
        data: {
          'action': 'request',
          'sessionId': 'session-a',
          'requesterId': 'user-2',
          'requestPayloadJson': '{"senderDeviceId":"device-2"}',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      final accepted = await notifier.acceptPendingNegotiation('session-a');

      expect(accepted, isTrue);
      expect(testE2eeManager.lastRespondSessionId, 'session-a');
      expect(testE2eeManager.lastRespondPayload?['senderUserId'], 'user-2');
      expect(notifier.state.pendingNegotiations, isEmpty);
      expect(
        await mockE2eeMetaStore.getSessionStatus('session-a'),
        'encrypted',
      );
    });

    test('initiateEncryptionForSession uses canonical E2EE session id',
        () async {
      notifier = createNotifier();
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'custom-session-1',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();

      final started =
          await notifier.initiateEncryptionForSession('custom-session-1');

      expect(started, isTrue);
      expect(testE2eeManager.lastInitiateSessionId, 'p_user-1_user-2');
      expect(testE2eeManager.lastInitiatePeerId, 'user-2');
      expect(
        await mockE2eeMetaStore.getSessionStatus('p_user-1_user-2'),
        'negotiating',
      );
    });

    test('initiateEncryptionForSession refuses group E2EE', () async {
      notifier = createNotifier();
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'group_group-1',
          type: 'group',
          targetId: 'group-1',
          targetName: 'Group 1',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      await notifier.loadSessions();

      final started =
          await notifier.initiateEncryptionForSession('group_group-1');

      expect(started, isFalse);
      expect(notifier.state.error, 'group_e2ee_unavailable');
      expect(testE2eeManager.lastInitiateSessionId, isNull);
    });
  });

  // =========================================================================
  // Additional edge cases
  // =========================================================================

  group('additional outbox integration edge cases', () {
    test('sendMessage success does not enqueue to outbox', () async {
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

    test('sendGroupMessage success does not enqueue to outbox', () async {
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

    test('pending message is added to state before outbox enqueue', () async {
      notifier = createNotifier();
      testApi.errorToThrow = Exception('fail');

      await notifier.sendMessage('user-2', 'Queued msg');

      // The message should be visible in state even though send failed.
      final messages = notifier.state.messages['user-1_user-2'];
      expect(messages, isNotNull);
      expect(messages!.any((m) => m.content == 'Queued msg'), isTrue);
    });
  });

  // =========================================================================
  // Session key routing regression tests (Codex-C1)
  // =========================================================================

  group('session key routing', () {
    test(
        'private chat: message routes to session by id even when id != targetId',
        () async {
      notifier = createNotifier();

      // Load sessions with a custom session id that differs from the
      // auto-generated key pattern (user-1_user-2).
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'custom-session-1',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();

      // Push an incoming message from user-2 via WebSocket.
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.message,
        data: {
          'id': 'msg-from-user2',
          'senderId': 'user-2',
          'receiverId': 'user-1',
          'isGroupChat': false,
          'messageType': 'text',
          'content': 'Hello from user-2',
          'sendTime': '2024-01-01T00:00:00Z',
          'status': 'sent',
        },
      ));
      await Future.delayed(Duration.zero);

      // Message must be stored under the session's custom id.
      expect(notifier.state.messages['custom-session-1'], isNotNull);
      expect(notifier.state.messages['custom-session-1']!.length, 1);
      expect(
        notifier.state.messages['custom-session-1']!.first.content,
        'Hello from user-2',
      );

      // Must NOT create a separate entry under the auto-generated key.
      expect(notifier.state.messages['user-1_user-2'], isNull);
    });

    test('group chat: message routes to session by id even when id != groupId',
        () async {
      notifier = createNotifier();

      // Load sessions with a custom group session id that differs from
      // the auto-generated key pattern (group_group-1).
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'custom-group-session',
          type: 'group',
          targetId: 'group-1',
          targetName: 'Test Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      await notifier.loadSessions();

      // Push an incoming group message via WebSocket.
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.message,
        data: {
          'id': 'group-msg-1',
          'senderId': 'user-3',
          'isGroupChat': true,
          'groupId': 'group-1',
          'messageType': 'text',
          'content': 'Hello group',
          'sendTime': '2024-01-01T00:00:00Z',
          'status': 'sent',
        },
      ));
      await Future.delayed(Duration.zero);

      // Message must be stored under the session's custom id.
      expect(notifier.state.messages['custom-group-session'], isNotNull);
      expect(notifier.state.messages['custom-group-session']!.length, 1);
      expect(
        notifier.state.messages['custom-group-session']!.first.content,
        'Hello group',
      );

      // Must NOT create a separate entry under the auto-generated key.
      expect(notifier.state.messages['group_group-1'], isNull);
    });
  });

  // =========================================================================
  // Pending message replacement regression test (Codex-C1)
  // =========================================================================

  group('pending message replacement', () {
    test('pending message is replaced by server message via clientMessageId',
        () async {
      notifier = createNotifier();

      // Add a pending message (simulating a failed send that's in the outbox).
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'local-123',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Pending message',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'PENDING',
          clientMessageId: 'local-123',
        ),
      );

      expect(notifier.state.messages['user-1_user-2']!.length, 1);
      expect(
        notifier.state.messages['user-1_user-2']!.first.status,
        'PENDING',
      );

      // Server confirms with a different id but same clientMessageId.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'server-456',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Pending message',
          sendTime: '2024-01-01T00:00:01Z',
          status: 'SENT',
          clientMessageId: 'local-123',
        ),
      );

      final messages = notifier.state.messages['user-1_user-2']!;

      // Must NOT duplicate — still exactly one message.
      expect(messages.length, 1);

      // Must be the server version.
      expect(messages.first.id, 'server-456');
      expect(messages.first.status, 'SENT');
    });

    test('pending message is replaced by server message with matching id',
        () async {
      notifier = createNotifier();

      // Add a pending message.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-789',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Original content',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENDING',
          clientMessageId: 'msg-789',
        ),
      );

      // Server returns same id with updated status.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-789',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Original content',
          sendTime: '2024-01-01T00:00:01Z',
          status: 'SENT',
          clientMessageId: 'msg-789',
        ),
      );

      final messages = notifier.state.messages['user-1_user-2']!;

      expect(messages.length, 1);
      expect(messages.first.status, 'SENT');
    });
  });

  // =========================================================================
  // Read receipt readerId/userId protection
  // =========================================================================

  group('read receipt readerId/userId protection', () {
    test('readerId == currentUserId does not update messages', () async {
      notifier = createNotifier();

      // Add a message sent by current user (user-1).
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-1',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Hello',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      );

      // Emit read receipt where readerId is the current user (self-read).
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.readReceipt,
        data: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-1',
          'messageId': 'msg-1',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      // Message should NOT be updated to READ.
      final messages = notifier.state.messages['user-1_user-2']!;
      expect(messages.first.status, 'SENT');
    });

    test('missing readerId/userId does not update messages', () async {
      notifier = createNotifier();

      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-2',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Hello',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      );

      // Emit read receipt without readerId or userId.
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.readReceipt,
        data: {
          'sessionId': 'user-1_user-2',
          'messageId': 'msg-2',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      final messages = notifier.state.messages['user-1_user-2']!;
      expect(messages.first.status, 'SENT');
    });

    test('readerId is other user: messageId updates only specified message',
        () async {
      notifier = createNotifier();

      // Add two messages sent by current user.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-a',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Msg A',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      );
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-b',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Msg B',
          sendTime: '2024-01-01T00:00:01Z',
          status: 'SENT',
        ),
      );

      // Read receipt from other user for only msg-a.
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.readReceipt,
        data: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageId': 'msg-a',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      final messages = notifier.state.messages['user-1_user-2']!;
      expect(messages[0].status, 'READ'); // msg-a
      expect(messages[1].status, 'SENT'); // msg-b unchanged
    });

    test('readerId is other user: messageIds updates only specified messages',
        () async {
      notifier = createNotifier();

      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-x',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Msg X',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      );
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-y',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Msg Y',
          sendTime: '2024-01-01T00:00:01Z',
          status: 'SENT',
        ),
      );
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-z',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Msg Z',
          sendTime: '2024-01-01T00:00:02Z',
          status: 'SENT',
        ),
      );

      // Read receipt from other user for msg-x and msg-z only.
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.readReceipt,
        data: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageIds': ['msg-x', 'msg-z'],
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      final messages = notifier.state.messages['user-1_user-2']!;
      expect(messages[0].status, 'READ'); // msg-x
      expect(messages[1].status, 'SENT'); // msg-y unchanged
      expect(messages[2].status, 'READ'); // msg-z
    });

    test('readerId is other user: lastReadMessageId updates own messages up to target',
        () async {
      notifier = createNotifier();

      // Add messages: own, other, own, own.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-1',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Own 1',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      );
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-2',
          senderId: 'user-2',
          receiverId: 'user-1',
          isGroupChat: false,
          messageType: 'text',
          content: 'Other 1',
          sendTime: '2024-01-01T00:00:01Z',
          status: 'SENT',
        ),
      );
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-3',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Own 2',
          sendTime: '2024-01-01T00:00:02Z',
          status: 'SENT',
        ),
      );
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-4',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Own 3',
          sendTime: '2024-01-01T00:00:03Z',
          status: 'SENT',
        ),
      );

      // lastReadMessageId = msg-3 (other user read up to msg-3).
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.readReceipt,
        data: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'lastReadMessageId': 'msg-3',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      final messages = notifier.state.messages['user-1_user-2']!;
      expect(messages[0].status, 'READ'); // msg-1 (own, before target)
      expect(messages[1].status, 'SENT'); // msg-2 (other's message, not ours)
      expect(messages[2].status, 'READ'); // msg-3 (own, at target)
      expect(messages[3].status, 'SENT'); // msg-4 (own, after target)
    });

    test('does not affect other sessions', () async {
      notifier = createNotifier();

      // Add messages in two sessions.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-session1',
          senderId: 'user-1',
          receiverId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Session 1',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      );
      notifier.addMessage(
        'user-1_user-3',
        const Message(
          id: 'msg-session2',
          senderId: 'user-1',
          receiverId: 'user-3',
          isGroupChat: false,
          messageType: 'text',
          content: 'Session 2',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      );

      // Read receipt for session 1 only.
      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.readReceipt,
        data: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageId': 'msg-session1',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      // Session 1 message should be READ.
      final s1 = notifier.state.messages['user-1_user-2']!;
      expect(s1.first.status, 'READ');

      // Session 2 message should remain SENT.
      final s2 = notifier.state.messages['user-1_user-3']!;
      expect(s2.first.status, 'SENT');
    });

    test('does not mark other user messages as READ', () async {
      notifier = createNotifier();

      // Message sent by other user.
      notifier.addMessage(
        'user-1_user-2',
        const Message(
          id: 'msg-other',
          senderId: 'user-2',
          receiverId: 'user-1',
          isGroupChat: false,
          messageType: 'text',
          content: 'From other',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      );

      fakeWsClient.addEvent(FakeWsEvent(
        type: WsMessageType.readReceipt,
        data: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageId': 'msg-other',
        },
      ));
      await Future.delayed(Duration(milliseconds: 50));

      final messages = notifier.state.messages['user-1_user-2']!;
      expect(messages.first.status, 'SENT'); // not changed to READ
    });
  });
}
