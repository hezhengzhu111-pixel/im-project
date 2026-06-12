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

/// Testable MessageApi that returns configurable responses.
class _TestMessageApi extends MessageApi {
  _TestMessageApi() : super(FakeHttpClientPort());

  List<ChatSession>? conversationsResponse;
  List<Message>? privateHistoryResponse;
  List<Message>? groupHistoryResponse;

  int getConversationsCallCount = 0;
  int getPrivateHistoryCallCount = 0;
  int getGroupHistoryCallCount = 0;

  String? lastPrivateHistoryId;
  String? lastGroupHistoryId;

  @override
  Future<List<ChatSession>> getConversations() async {
    getConversationsCallCount++;
    return conversationsResponse ?? [];
  }

  @override
  Future<List<Message>> getPrivateHistory(String friendId,
      {int? page, int? size}) async {
    getPrivateHistoryCallCount++;
    lastPrivateHistoryId = friendId;
    return privateHistoryResponse ?? [];
  }

  @override
  Future<List<Message>> getGroupHistory(String groupId,
      {int? page, int? size}) async {
    getGroupHistoryCallCount++;
    lastGroupHistoryId = groupId;
    return groupHistoryResponse ?? [];
  }

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    return const Message(
      id: 'server-1',
      senderId: 'user-1',
      isGroupChat: false,
      messageType: 'text',
      content: '',
      sendTime: '2024-01-01T00:00:00Z',
      status: 'sent',
    );
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    return const Message(
      id: 'server-g1',
      senderId: 'user-1',
      isGroupChat: true,
      messageType: 'text',
      content: '',
      sendTime: '2024-01-01T00:00:00Z',
      status: 'sent',
    );
  }

  @override
  Future<void> markRead(String conversationId) async {}
}

/// Spy MessageOutbox.
class _SpyMessageOutbox extends MessageOutbox {
  _SpyMessageOutbox()
      : super(
          messageApi: MessageApi(FakeHttpClientPort()),
          idbFactory: newIdbFactoryMemory(),
          isOnline: () => true,
        );

  @override
  Future<int> getPendingCount() async => 0;
  @override
  Future<int> getFailedCount() async => 0;
  @override
  Future<void> retryAllFailed() async {}
  @override
  Stream<OutboxEvent> get events => const Stream.empty();
  @override
  void dispose() {}
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

/// Fake NetworkStatusNotifier.
class _FakeNetworkStatusNotifier extends NetworkStatusNotifier {
  _FakeNetworkStatusNotifier() : super(dataSource: _FakeNetworkDataSource());
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

/// Fake E2eeSentMessageCache for testing.
class _FakeE2eeSentMessageCache implements E2eeSentMessageCache {
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

void main() {
  late _TestMessageApi testApi;
  late ChatNotifierWithOutbox notifier;
  late FakeWsClientPort fakeWsClient;
  late _MockE2eeMetaStore mockE2eeMetaStore;

  setUp(() {
    testApi = _TestMessageApi();
    fakeWsClient = FakeWsClientPort();
    mockE2eeMetaStore = _MockE2eeMetaStore(FakeSecureStoragePort({
      'e2ee_device_id': 'test-device-id',
    }));
    final e2eeManager = _TestableE2eeManager(metaStore: mockE2eeMetaStore);

    testApi.conversationsResponse = [];

    notifier = ChatNotifierWithOutbox(
      testApi,
      MessagePipeline(),
      fakeWsClient,
      () => 'user-1',
      e2eeManager,
      mockE2eeMetaStore,
      _FakeE2eeSentMessageCache(),
      _SpyMessageOutbox(),
      _FakeNetworkStatusNotifier(),
      NoopAnalyticsAdapter(),
    );
  });

  tearDown(() {
    notifier.dispose();
    fakeWsClient.dispose();
  });

  // =========================================================================
  // 1. Canonical session id: setActiveSession + loadMessages
  // =========================================================================

  group('canonical session id deep link', () {
    test('setActiveSession with canonical session id finds session', () async {
      // Load sessions with a canonical id (server-generated).
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();

      // setActiveSession with the canonical session id.
      notifier.setActiveSession('user-1_user-2');

      // activeSessionId should match the canonical id.
      expect(notifier.state.activeSessionId, 'user-1_user-2');

      // Session should be findable.
      final session = notifier.state.sessions
          .where((s) => s.id == notifier.state.activeSessionId)
          .firstOrNull;
      expect(session, isNotNull);
      expect(session!.targetId, 'user-2');
    });

    test('loadMessages after setActiveSession loads messages into session',
        () async {
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();

      testApi.privateHistoryResponse = [
        const Message(
          id: 'msg-1',
          senderId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Hello from user-2',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'sent',
        ),
      ];

      // Simulate ChatPage._openDeepLinkedSession flow.
      notifier.setActiveSession('user-1_user-2');
      final activeSessionId = notifier.state.activeSessionId;
      final session = notifier.state.sessions
          .where((s) => s.id == activeSessionId)
          .firstOrNull;
      expect(session, isNotNull);

      await notifier.loadMessages(session!.targetId);

      // Messages should be stored under the canonical session key.
      final messages = notifier.state.messages['user-1_user-2'];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
      expect(messages.first.content, 'Hello from user-2');
    });

    test('group canonical session id deep link loads group messages', () async {
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'group_group-1',
          type: 'group',
          targetId: 'group-1',
          targetName: 'Test Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      await notifier.loadSessions();

      testApi.groupHistoryResponse = [
        const Message(
          id: 'gmsg-1',
          senderId: 'user-3',
          isGroupChat: true,
          groupId: 'group-1',
          messageType: 'text',
          content: 'Hello group',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'sent',
        ),
      ];

      notifier.setActiveSession('group_group-1');
      final activeSessionId = notifier.state.activeSessionId;
      final session = notifier.state.sessions
          .where((s) => s.id == activeSessionId)
          .firstOrNull;
      expect(session, isNotNull);

      final isGroup =
          session!.conversationType == 'group' || session.type == 'group';
      expect(isGroup, isTrue);

      if (isGroup) {
        await notifier.loadGroupMessages(session.targetId);
      }

      final messages = notifier.state.messages['group_group-1'];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
      expect(messages.first.content, 'Hello group');
    });
  });

  // =========================================================================
  // 2. Raw targetId: normalization finds canonical session
  // =========================================================================

  group('raw targetId deep link normalization', () {
    test('setActiveSession with raw targetId normalizes to canonical key',
        () async {
      // Server returns a session with canonical id.
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();

      // setActiveSession with raw targetId (not the canonical session id).
      notifier.setActiveSession('user-2');

      // Should normalize to the canonical session key.
      expect(notifier.state.activeSessionId, 'user-1_user-2');
    });

    test('raw targetId normalization still loads messages', () async {
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();

      testApi.privateHistoryResponse = [
        const Message(
          id: 'msg-1',
          senderId: 'user-2',
          isGroupChat: false,
          messageType: 'text',
          content: 'Hello',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'sent',
        ),
      ];

      // Simulate ChatPage._openDeepLinkedSession with raw targetId.
      notifier.setActiveSession('user-2');
      final activeSessionId = notifier.state.activeSessionId;
      final session = notifier.state.sessions
          .where((s) => s.id == activeSessionId)
          .firstOrNull;
      expect(session, isNotNull);

      await notifier.loadMessages(session!.targetId);

      final messages = notifier.state.messages[activeSessionId];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
    });

    test('setActiveSession does not crash with unknown targetId', () {
      // No sessions loaded - setActiveSession with unknown id.
      notifier.setActiveSession('unknown-user');

      // Should not crash. activeSessionId should be set (normalized).
      expect(notifier.state.activeSessionId, isNotNull);
    });
  });

  // =========================================================================
  // 3. Raw groupId: normalization finds canonical group session
  // =========================================================================

  group('raw groupId deep link normalization', () {
    test('setActiveSession with raw groupId normalizes to group_session key',
        () async {
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'group_group-1',
          type: 'group',
          targetId: 'group-1',
          targetName: 'Test Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      await notifier.loadSessions();

      // setActiveSession with raw groupId.
      notifier.setActiveSession('group-1');

      // Should normalize to the canonical group session key.
      expect(notifier.state.activeSessionId, 'group_group-1');
    });

    test('setActiveSession with group_ prefix normalizes correctly', () async {
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'group_group-1',
          type: 'group',
          targetId: 'group-1',
          targetName: 'Test Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      await notifier.loadSessions();

      // setActiveSession with 'group_' prefix.
      notifier.setActiveSession('group_group-1');

      // Should find the session directly (exact match).
      expect(notifier.state.activeSessionId, 'group_group-1');
    });

    test('raw groupId normalization still loads group messages', () async {
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'group_group-1',
          type: 'group',
          targetId: 'group-1',
          targetName: 'Test Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      await notifier.loadSessions();

      testApi.groupHistoryResponse = [
        const Message(
          id: 'gmsg-1',
          senderId: 'user-3',
          isGroupChat: true,
          groupId: 'group-1',
          messageType: 'text',
          content: 'Hello group',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'sent',
        ),
      ];

      // Simulate ChatPage._openDeepLinkedSession with raw groupId.
      notifier.setActiveSession('group-1');
      final activeSessionId = notifier.state.activeSessionId;
      final session = notifier.state.sessions
          .where((s) => s.id == activeSessionId)
          .firstOrNull;
      expect(session, isNotNull);

      final isGroup =
          session!.conversationType == 'group' || session.type == 'group';
      if (isGroup) {
        await notifier.loadGroupMessages(session.targetId);
      }

      final messages = notifier.state.messages[activeSessionId];
      expect(messages, isNotNull);
      expect(messages!.length, 1);
    });

    test('setActiveSession does not crash with unknown groupId', () {
      notifier.setActiveSession('unknown-group');
      expect(notifier.state.activeSessionId, isNotNull);
    });
  });

  // =========================================================================
  // 4. Session lookup resilience
  // =========================================================================

  group('session lookup resilience', () {
    test('setActiveSession with conversationId normalizes correctly', () async {
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationId: 'server-conv-123',
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();

      // setActiveSession with conversationId.
      notifier.setActiveSession('server-conv-123');

      // Should find the session via conversationId match.
      expect(notifier.state.activeSessionId, 'user-1_user-2');
    });

    test('loadSessions then setActiveSession preserves local session',
        () async {
      // Pre-populate with a local session.
      testApi.conversationsResponse = [];
      await notifier.loadSessions();

      // Set active session (creates a local entry in state).
      notifier.setActiveSession('user-1_user-2');
      expect(notifier.state.activeSessionId, 'user-1_user-2');

      // Reload sessions - the local session should be preserved.
      testApi.conversationsResponse = [
        const ChatSession(
          id: 'user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      await notifier.loadSessions();

      // Session should still be findable.
      final session = notifier.state.sessions
          .where((s) => s.id == 'user-1_user-2')
          .firstOrNull;
      expect(session, isNotNull);
    });
  });
}
