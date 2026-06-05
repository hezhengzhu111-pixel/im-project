import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_client_memory.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_pipeline.dart';
import 'package:im_web/features/chat/presentation/chat_provider_with_outbox.dart';
import 'package:im_web/features/chat/presentation/chat_state.dart';
import 'package:im_web/features/e2ee/data/e2ee_manager.dart';
import 'package:im_web/features/e2ee/data/e2ee_meta_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_sent_message_cache.dart';
import 'package:im_web/features/e2ee/data/e2ee_api.dart';
import 'package:im_web/features/e2ee/data/e2ee_key_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_session_store.dart';
import 'package:im_web/adapters/web_e2ee_adapter.dart';
import 'package:im_web/adapters/services/noop_analytics_adapter.dart';
import 'package:im_web/core/network/network_status_provider.dart';

import '../../helpers/fakes.dart';

/// Testable MessageApi that overrides methods
class TestMessageApi extends MessageApi {
  TestMessageApi() : super(FakeHttpClientPort());

  List<ChatSession>? conversationsResponse;
  List<Message>? privateHistoryResponse;
  Message? sendPrivateMessageResponse;
  Exception? errorToThrow;

  int getConversationsCallCount = 0;
  int getPrivateHistoryCallCount = 0;
  int sendPrivateMessageCallCount = 0;
  int markReadCallCount = 0;

  String? lastPrivateHistoryId;
  SendPrivateMessageRequest? lastSendRequest;
  String? lastMarkReadId;

  @override
  Future<List<ChatSession>> getConversations() async {
    getConversationsCallCount++;
    if (errorToThrow != null) throw errorToThrow!;
    return conversationsResponse!;
  }

  @override
  Future<List<Message>> getPrivateHistory(String friendId,
      {int? page, int? size}) async {
    getPrivateHistoryCallCount++;
    lastPrivateHistoryId = friendId;
    if (errorToThrow != null) throw errorToThrow!;
    return privateHistoryResponse!;
  }

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    sendPrivateMessageCallCount++;
    lastSendRequest = request;
    if (errorToThrow != null) throw errorToThrow!;
    return sendPrivateMessageResponse!;
  }

  @override
  Future<void> markRead(String conversationId) async {
    markReadCallCount++;
    lastMarkReadId = conversationId;
    if (errorToThrow != null) throw errorToThrow!;
  }

  @override
  Future<MessageConfig> getConfig() async {
    return const MessageConfig(textEnforce: true, textMaxLength: 2000);
  }
}

/// Mock E2eeMetaStore for testing
class MockE2eeMetaStore extends E2eeMetaStore {
  MockE2eeMetaStore() : super(FakeSecureStoragePort());
}

/// Minimal fake MessageOutbox for testing (no DB dependency)
class FakeMessageOutbox extends MessageOutbox {
  FakeMessageOutbox()
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
  }) async {
    final message = OutboxMessage(
      id: 'outbox_test_$clientMessageId',
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
    _eventsController.add(OutboxEvent(
      type: OutboxEventType.messageAdded,
      message: message,
    ));
    return message;
  }

  @override
  void dispose() {
    _eventsController.close();
    super.dispose();
  }
}

/// Fake NetworkStatusDataSource that always reports online
class _FakeNetworkDataSource implements NetworkStatusDataSource {
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

  void dispose() {
    _onlineController.close();
    _offlineController.close();
  }
}

/// Minimal fake NetworkStatusNotifier for testing
class FakeNetworkStatusNotifier extends NetworkStatusNotifier {
  FakeNetworkStatusNotifier() : super(dataSource: _FakeNetworkDataSource());
}

/// Fake E2eeSentMessageCache for testing.
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

void main() {
  late TestMessageApi mockApi;
  late ChatNotifierWithOutbox notifier;
  late FakeWsClientPort mockWsClient;
  late MockE2eeMetaStore mockE2eeMetaStore;
  late FakeMessageOutbox fakeOutbox;
  late FakeNetworkStatusNotifier fakeNetwork;

  setUp(() {
    mockApi = TestMessageApi();
    mockWsClient = FakeWsClientPort();
    mockE2eeMetaStore = MockE2eeMetaStore();
    fakeOutbox = FakeMessageOutbox();
    fakeNetwork = FakeNetworkStatusNotifier();
    final e2eeManager = E2eeManager(
      adapter: WebE2eeAdapter(),
      api: E2eeApi(FakeHttpClientPort()),
      keyStore: E2eeKeyStore(),
      sessionStore: E2eeSessionStore(),
      metaStore: mockE2eeMetaStore,
      currentUserId: 'test-user-id',
    );
    notifier = ChatNotifierWithOutbox(
      mockApi,
      MessagePipeline(),
      mockWsClient,
      () => 'test-user-id',
      e2eeManager,
      mockE2eeMetaStore,
      FakeE2eeSentMessageCache(),
      fakeOutbox,
      fakeNetwork,
      NoopAnalyticsAdapter(),
    );
  });

  tearDown(() {
    mockWsClient.dispose();
    fakeOutbox.dispose();
    fakeNetwork.dispose();
  });

  Message makeMessage(String id, {String? content}) {
    return Message(
      id: id,
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'text',
      content: content ?? 'Message $id',
      sendTime: '2024-01-01T00:00:00Z',
      status: 'sent',
    );
  }

  ChatSession makeSession(String id, {String? name, int unread = 0}) {
    return ChatSession(
      id: id,
      type: 'private',
      targetId: 'u2',
      targetName: name ?? 'Session $id',
      unreadCount: unread,
    );
  }

  group('ChatState', () {
    test('initial state has correct defaults', () {
      const state = ChatState();
      expect(state.sessions, isEmpty);
      expect(state.messages, isEmpty);
      expect(state.isLoading, isFalse);
      expect(state.activeSessionId, isNull);
      expect(state.error, isNull);
    });

    test('currentMessages returns messages for active session', () {
      final state = ChatState(
        activeSessionId: 's1',
        messages: {
          's1': [makeMessage('m1'), makeMessage('m2')],
        },
      );
      expect(state.currentMessages.length, 2);
    });

    test('currentMessages returns empty when no active session', () {
      final state = ChatState(
        messages: {
          's1': [makeMessage('m1')]
        },
      );
      expect(state.currentMessages, isEmpty);
    });

    test('copyWith preserves unmodified fields', () {
      const state = ChatState(isLoading: true, activeSessionId: 's1');
      final updated = state.copyWith(isLoading: false);
      expect(updated.isLoading, isFalse);
      expect(updated.activeSessionId, 's1');
    });
  });

  group('ChatNotifierWithOutbox - loadSessions', () {
    test('loads sessions successfully', () async {
      mockApi.conversationsResponse = [
        makeSession('s1', name: 'Alice'),
        makeSession('s2', name: 'Bob')
      ];
      await notifier.loadSessions();
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.sessions.length, 2);
      expect(notifier.state.sessions[0].targetName, 'Alice');
    });

    test('sets error on failure', () async {
      mockApi.errorToThrow = Exception('Network error');
      await notifier.loadSessions();
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.error, contains('Network error'));
    });
  });

  group('ChatNotifierWithOutbox - setActiveSession', () {
    test('sets active session id', () {
      notifier.setActiveSession('session-1');
      expect(notifier.state.activeSessionId, 'session-1_test-user-id');
    });
  });

  group('ChatNotifierWithOutbox - loadMessages', () {
    test('loads messages for a session', () async {
      mockApi.privateHistoryResponse = [makeMessage('m1'), makeMessage('m2')];
      await notifier.loadMessages('session-1');
      expect(notifier.state.messages['session-1_test-user-id']!.length, 2);
    });

    test('sets error on failure', () async {
      mockApi.errorToThrow = Exception('Load failed');
      await notifier.loadMessages('session-1');
      expect(notifier.state.error, contains('Load failed'));
    });
  });

  group('ChatNotifierWithOutbox - addMessage', () {
    test('adds message to session', () {
      notifier.addMessage('session-1', makeMessage('m1'));
      expect(notifier.state.messages['session-1_test-user-id']!.length, 1);
    });

    test('deduplicates messages by id', () {
      final msg = makeMessage('m1');
      notifier.addMessage('session-1', msg);
      notifier.addMessage('session-1', msg);
      expect(notifier.state.messages['session-1_test-user-id']!.length, 1);
    });
  });

  group('ChatNotifierWithOutbox - sendMessage', () {
    test('sends message and adds to session', () async {
      mockApi.sendPrivateMessageResponse = makeMessage('m1', content: 'Hello!');
      final result = await notifier.sendMessage('u2', 'Hello!');
      expect(result, isNotNull);
      expect(result!.content, 'Hello!');
      expect(notifier.state.messages['test-user-id_u2']!.length, 1);
    });

    test('returns null on failure', () async {
      mockApi.errorToThrow = Exception('Send failed');
      final result = await notifier.sendMessage('u2', 'Hello!');
      expect(result, isNull);
    });
  });

  group('ChatNotifierWithOutbox - markRead', () {
    test('calls markRead on the API', () async {
      await notifier.markRead('conv-1');
      expect(mockApi.markReadCallCount, 1);
      expect(mockApi.lastMarkReadId, 'conv-1');
    });

    test('private session uses conversationId for API markRead', () async {
      mockApi.conversationsResponse = [
        const ChatSession(
          id: 'test-user-id_u2',
          type: 'private',
          targetId: 'u2',
          targetName: 'User 2',
          unreadCount: 1,
          conversationId: 'server-conv-u2',
        ),
      ];
      await notifier.loadSessions();

      await notifier.markRead('test-user-id_u2');

      expect(mockApi.lastMarkReadId, 'server-conv-u2');
    });

    test('group session uses group target id for API markRead', () async {
      mockApi.conversationsResponse = [
        const ChatSession(
          id: 'group_g1',
          type: 'group',
          targetId: 'g1',
          targetName: 'Group 1',
          unreadCount: 1,
        ),
      ];
      await notifier.loadSessions();

      await notifier.markRead('group_g1');

      expect(mockApi.lastMarkReadId, 'group_g1');
    });

    test('does not throw on failure', () async {
      mockApi.errorToThrow = Exception('Mark read failed');
      await notifier.markRead('conv-1');
      expect(mockApi.markReadCallCount, 1);
    });
  });

  group('ChatNotifierWithOutbox - additional edge cases', () {
    test('loadSessions clears previous error', () async {
      mockApi.errorToThrow = Exception('First error');
      await notifier.loadSessions();
      expect(notifier.state.error, isNotNull);

      mockApi.errorToThrow = null;
      mockApi.conversationsResponse = [makeSession('s1')];
      await notifier.loadSessions();
      expect(notifier.state.error, isNull);
    });

    test('loadSessions replaces previous sessions', () async {
      mockApi.conversationsResponse = [makeSession('s1')];
      await notifier.loadSessions();
      expect(notifier.state.sessions.length, 1);

      mockApi.conversationsResponse = [makeSession('s2'), makeSession('s3')];
      await notifier.loadSessions();
      expect(notifier.state.sessions.length, 2);
    });

    test('loadMessages replaces messages for same session', () async {
      mockApi.privateHistoryResponse = [makeMessage('m1')];
      await notifier.loadMessages('s1');
      expect(notifier.state.messages['s1_test-user-id']!.length, 1);

      mockApi.privateHistoryResponse = [makeMessage('m2'), makeMessage('m3')];
      await notifier.loadMessages('s1');
      expect(notifier.state.messages['s1_test-user-id']!.length, 2);
    });

    test('addMessage preserves messages in other sessions', () {
      notifier.addMessage('s1', makeMessage('m1'));
      notifier.addMessage('s2', makeMessage('m2'));
      notifier.addMessage('s1', makeMessage('m3'));

      expect(notifier.state.messages['s1_test-user-id']!.length, 2);
      expect(notifier.state.messages['s2_test-user-id']!.length, 1);
    });

    test('setActiveSession with null resets active session', () {
      notifier.setActiveSession('s1');
      expect(notifier.state.activeSessionId, 's1_test-user-id');

      notifier.setActiveSession('s2');
      expect(notifier.state.activeSessionId, 's2_test-user-id');
    });
  });

  group('SendPrivateMessageRequest', () {
    test('toJson includes required fields', () {
      const request = SendPrivateMessageRequest(
        receiverId: 'u2',
        content: 'Hello!',
      );
      final json = request.toJson();

      expect(json['receiverId'], 'u2');
      expect(json['content'], 'Hello!');
      expect(json['messageType'], 'TEXT');
    });

    test('toJson excludes null clientMessageId', () {
      const request = SendPrivateMessageRequest(
        receiverId: 'u2',
        content: 'Hi',
      );
      final json = request.toJson();

      expect(json.containsKey('clientMessageId'), isFalse);
    });

    test('toJson includes non-null clientMessageId', () {
      const request = SendPrivateMessageRequest(
        receiverId: 'u2',
        content: 'Hi',
        clientMessageId: 'client-1',
      );
      final json = request.toJson();

      expect(json['clientMessageId'], 'client-1');
    });

    test('default messageType is TEXT', () {
      const request = SendPrivateMessageRequest(
        receiverId: 'u2',
        content: 'Hello',
      );
      expect(request.messageType, 'TEXT');
    });
  });
}
