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
// Test doubles
// ---------------------------------------------------------------------------

/// MessageApi spy that makes real HTTP calls through FakeHttpClientPort
/// so we can inspect the exact paths sent to the backend.
class SpyMessageApi extends MessageApi {
  SpyMessageApi(this._fakeHttp) : super(_fakeHttp);

  final FakeHttpClientPort _fakeHttp;

  List<ChatSession>? conversationsResponse;

  int markReadCallCount = 0;
  String? lastMarkReadConversationId;

  @override
  Future<List<ChatSession>> getConversations() async {
    return conversationsResponse ?? [];
  }

  @override
  Future<void> markRead(String conversationId) async {
    markReadCallCount++;
    lastMarkReadConversationId = conversationId;
    // Make the real HTTP call so FakeHttpClientPort records the path.
    await _fakeHttp.post<void>(
      '/api/message/read/$conversationId',
      fromJson: (_) {},
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

/// Fake E2eeSentMessageCache for testing.
class FakeE2eeSentMessageCache implements E2eeSentMessageCache {
  @override
  SentMessageCacheStorage get storage => throw UnimplementedError();

  @override
  Future<void> put({
    required String clientMessageId,
    required String plaintext,
    required String e2eeSessionId,
    String? peerUserId,
    String? serverMessageId,
  }) async {}

  @override
  Future<void> updateServerId({
    required String clientMessageId,
    required String serverMessageId,
  }) async {}

  @override
  Future<String?> getPlaintextByClientId(String clientMessageId) async => null;

  @override
  Future<String?> getPlaintextByServerId(String serverMessageId) async => null;

  @override
  Future<void> clearAll() async {}

  @override
  Future<void> clearSession(String e2eeSessionId) async {}

  @override
  Future<void> clearExpired() async {}
}

class SpyMessageOutbox extends MessageOutbox {
  SpyMessageOutbox()
      : super(
          messageApi: MessageApi(FakeHttpClientPort()),
          idbFactory: newIdbFactoryMemory(),
          isOnline: () => true,
        );

  final _eventsController = StreamController<OutboxEvent>.broadcast();

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
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? thumbnailUrl,
    int? duration,
  }) async {
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
      e2eeDeviceId: e2eeDeviceId,
      mediaUrl: mediaUrl,
      mediaName: mediaName,
      mediaSize: mediaSize,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
    );
  }

  @override
  void dispose() {
    _eventsController.close();
    super.dispose();
  }
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
  late FakeHttpClientPort fakeHttp;
  late SpyMessageApi spyApi;
  late SpyMessageOutbox spyOutbox;
  late FakeWsClientPort fakeWsClient;
  setUp(() {
    fakeHttp = FakeHttpClientPort();
    spyApi = SpyMessageApi(fakeHttp);
    spyOutbox = SpyMessageOutbox();
    fakeWsClient = FakeWsClientPort();

    // Default: return empty sessions.
    spyApi.conversationsResponse = [];
  });

  tearDown(() {
    notifier.dispose();
    spyOutbox.dispose();
    fakeWsClient.dispose();
  });

  ChatNotifierWithOutbox createNotifier() {
    final fakeSecureStorage = FakeSecureStoragePort({
      'e2ee_device_id': 'test-device-id',
    });
    final mockE2eeMetaStore = MockE2eeMetaStore(fakeSecureStorage);
    final testE2eeManager = TestableE2eeManager(metaStore: mockE2eeMetaStore);

    return ChatNotifierWithOutbox(
      spyApi,
      MessagePipeline(),
      fakeWsClient,
      () => 'current-user',
      testE2eeManager,
      mockE2eeMetaStore,
      FakeE2eeSentMessageCache(),
      spyOutbox,
      NetworkStatusNotifier(),
      NoopAnalyticsAdapter(),
    );
  }

  /// Load sessions into the notifier so _readConversationIdForSessionKey
  /// can resolve them.
  Future<void> loadSessions(List<ChatSession> sessions) async {
    spyApi.conversationsResponse = sessions;
    await notifier.loadSessions();
    // Clear recorded HTTP requests from loadSessions.
    fakeHttp.requests.clear();
    spyApi.markReadCallCount = 0;
    spyApi.lastMarkReadConversationId = null;
  }

  /// Extract the conversationId from the last recorded markRead HTTP request.
  String? lastHttpMarkReadId() {
    final markReadRequests = fakeHttp.requests
        .where((r) => r.$1 == 'POST' && r.$2.startsWith('/api/message/read/'))
        .toList();
    if (markReadRequests.isEmpty) return null;
    final path = markReadRequests.last.$2;
    return path.replaceFirst('/api/message/read/', '');
  }

  // =========================================================================
  // 1. Private chat: canonical session key != backend conversationId
  //    → markRead uses conversationId
  // =========================================================================

  group(
      'markRead: private chat uses conversationId when canonical key != conversationId',
      () {
    test('markRead sends backend conversationId, not canonical session key',
        () async {
      notifier = createNotifier();

      await loadSessions([
        const ChatSession(
          id: 'current-user_other-user',
          type: 'private',
          targetId: 'other-user',
          targetName: 'Other User',
          conversationId: 'server-conv-abc',
          unreadCount: 0,
        ),
      ]);

      // Call markRead with the canonical session key.
      await notifier.markRead('current-user_other-user');

      // The API must receive the backend conversationId, NOT the canonical
      // session key.
      expect(spyApi.lastMarkReadConversationId, 'server-conv-abc');
      expect(lastHttpMarkReadId(), 'server-conv-abc');
    });

    test('markRead via setActiveSession uses conversationId', () async {
      notifier = createNotifier();

      await loadSessions([
        const ChatSession(
          id: 'current-user_other-user',
          type: 'private',
          targetId: 'other-user',
          targetName: 'Other User',
          conversationId: 'server-conv-xyz',
          unreadCount: 5,
        ),
      ]);

      // setActiveSession triggers markRead internally.
      notifier.setActiveSession('current-user_other-user');

      // Allow async markRead to complete.
      await Future.delayed(const Duration(milliseconds: 50));

      expect(spyApi.lastMarkReadConversationId, 'server-conv-xyz');
      expect(lastHttpMarkReadId(), 'server-conv-xyz');
    });
  });

  // =========================================================================
  // 2. Private chat: no conversationId → markRead uses targetId
  // =========================================================================

  group('markRead: private chat falls back to targetId when no conversationId',
      () {
    test('markRead sends targetId when conversationId is null', () async {
      notifier = createNotifier();

      await loadSessions([
        const ChatSession(
          id: 'current-user_fallback-user',
          type: 'private',
          targetId: 'fallback-user',
          targetName: 'Fallback User',
          // conversationId is null.
          unreadCount: 0,
        ),
      ]);

      await notifier.markRead('current-user_fallback-user');

      expect(spyApi.lastMarkReadConversationId, 'fallback-user');
      expect(lastHttpMarkReadId(), 'fallback-user');
    });
  });

  // =========================================================================
  // 3. Group chat: markRead uses `group_${targetId}`
  // =========================================================================

  group('markRead: group chat uses group_\${targetId}', () {
    test('markRead sends group_targetId for group session', () async {
      notifier = createNotifier();

      await loadSessions([
        const ChatSession(
          id: 'group_my-group',
          type: 'group',
          targetId: 'my-group',
          targetName: 'My Group',
          unreadCount: 0,
        ),
      ]);

      await notifier.markRead('group_my-group');

      expect(spyApi.lastMarkReadConversationId, 'group_my-group');
      expect(lastHttpMarkReadId(), 'group_my-group');
    });

    test('markRead sends group_targetId even when session has conversationId',
        () async {
      notifier = createNotifier();

      await loadSessions([
        const ChatSession(
          id: 'group_special',
          type: 'group',
          targetId: 'special',
          targetName: 'Special Group',
          conversationId: 'server-group-conv-1',
          unreadCount: 0,
        ),
      ]);

      await notifier.markRead('group_special');

      // Group chats always use "group_${targetId}", ignoring conversationId.
      expect(spyApi.lastMarkReadConversationId, 'group_special');
      expect(lastHttpMarkReadId(), 'group_special');
    });

    test('markRead via setActiveSession sends group_targetId', () async {
      notifier = createNotifier();

      await loadSessions([
        const ChatSession(
          id: 'group_g2',
          type: 'group',
          targetId: 'g2',
          targetName: 'Group 2',
          unreadCount: 3,
        ),
      ]);

      notifier.setActiveSession('group_g2');
      await Future.delayed(const Duration(milliseconds: 50));

      expect(spyApi.lastMarkReadConversationId, 'group_g2');
      expect(lastHttpMarkReadId(), 'group_g2');
    });
  });

  // =========================================================================
  // 4. Sorted private session key must NOT be passed to backend
  // =========================================================================

  group('markRead: sorted private session key not sent to backend', () {
    test('canonical key with reversed user order resolves to conversationId',
        () async {
      notifier = createNotifier();

      // The canonical key sorts user IDs alphabetically: 'aaa' < 'zzz'.
      // The conversationId from the server is different.
      await loadSessions([
        const ChatSession(
          id: 'aaa_zzz',
          type: 'private',
          targetId: 'zzz',
          targetName: 'Z User',
          conversationId: 'conv-from-server',
          unreadCount: 0,
        ),
      ]);

      await notifier.markRead('aaa_zzz');

      // Backend must receive the server-assigned conversationId,
      // NOT the sorted session key 'aaa_zzz'.
      expect(spyApi.lastMarkReadConversationId, 'conv-from-server');
      expect(lastHttpMarkReadId(), 'conv-from-server');
      expect(spyApi.lastMarkReadConversationId, isNot('aaa_zzz'));
    });

    test('canonical key with non-alphabetical order resolves to conversationId',
        () async {
      notifier = createNotifier();

      // Simulate a session where the canonical key is sorted differently
      // from how the user might naturally refer to the conversation.
      await loadSessions([
        const ChatSession(
          id: 'alice_bob',
          type: 'private',
          targetId: 'bob',
          targetName: 'Bob',
          conversationId: 'server-assigned-id',
          unreadCount: 0,
        ),
      ]);

      await notifier.markRead('alice_bob');

      // Must NOT send the sorted key 'alice_bob' to the backend.
      expect(spyApi.lastMarkReadConversationId, 'server-assigned-id');
      expect(spyApi.lastMarkReadConversationId, isNot('alice_bob'));
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  group('markRead: edge cases', () {
    test('markRead with unknown session key extracts targetId from key',
        () async {
      notifier = createNotifier();

      // No sessions loaded — fallback path.
      await notifier.markRead('current-user_unknown-target');

      // The fallback extracts the non-current-user part.
      expect(spyApi.lastMarkReadConversationId, 'unknown-target');
    });

    test('markRead with group_ prefix but no matching session uses key as-is',
        () async {
      notifier = createNotifier();

      // No sessions loaded, but key starts with 'group_'.
      await notifier.markRead('group_orphan');

      expect(spyApi.lastMarkReadConversationId, 'group_orphan');
    });

    test('markRead is resilient to API errors', () async {
      notifier = createNotifier();

      await loadSessions([
        const ChatSession(
          id: 'current-user_err-user',
          type: 'private',
          targetId: 'err-user',
          targetName: 'Error User',
          conversationId: 'conv-err',
          unreadCount: 0,
        ),
      ]);

      // Configure the fake HTTP client to throw.
      fakeHttp.onPost = <T>(String path,
          {dynamic body,
          required T Function(Map<String, dynamic>) fromJson}) async {
        throw Exception('Network error');
      };

      // Should not throw.
      await notifier.markRead('current-user_err-user');

      // The spy still recorded the call before the HTTP layer threw.
      expect(spyApi.markReadCallCount, 1);
      expect(spyApi.lastMarkReadConversationId, 'conv-err');
    });
  });
}
