import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_web/features/chat/presentation/chat_provider.dart';

/// Mock HttpClientPort for testing
class MockHttpClient implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(String path, {Map<String, dynamic>? queryParameters, required T Function(Map<String, dynamic> p1) fromJson}) async {
    throw UnimplementedError();
  }

  @override
  Future<ApiResponse<T>> post<T>(String path, {body, required T Function(Map<String, dynamic> p1) fromJson}) async {
    throw UnimplementedError();
  }

  @override
  Future<ApiResponse<T>> put<T>(String path, {body, required T Function(Map<String, dynamic> p1) fromJson}) async {
    throw UnimplementedError();
  }

  @override
  Future<ApiResponse<T>> delete<T>(String path, {Map<String, dynamic>? queryParameters, required T Function(Map<String, dynamic> p1) fromJson}) async {
    throw UnimplementedError();
  }
}

/// Testable MessageApi that overrides methods
class TestMessageApi extends MessageApi {
  TestMessageApi() : super(MockHttpClient());

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
  Future<List<Message>> getPrivateHistory(String friendId, {int? page, int? size}) async {
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
}

void main() {
  late TestMessageApi mockApi;
  late ChatNotifier notifier;

  setUp(() {
    mockApi = TestMessageApi();
    notifier = ChatNotifier(mockApi);
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
        messages: {'s1': [makeMessage('m1')]},
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

  group('ChatNotifier - loadSessions', () {
    test('loads sessions successfully', () async {
      mockApi.conversationsResponse = [makeSession('s1', name: 'Alice'), makeSession('s2', name: 'Bob')];
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

  group('ChatNotifier - setActiveSession', () {
    test('sets active session id', () {
      notifier.setActiveSession('session-1');
      expect(notifier.state.activeSessionId, 'session-1');
    });
  });

  group('ChatNotifier - loadMessages', () {
    test('loads messages for a session', () async {
      mockApi.privateHistoryResponse = [makeMessage('m1'), makeMessage('m2')];
      await notifier.loadMessages('session-1');
      expect(notifier.state.messages['session-1']!.length, 2);
    });

    test('sets error on failure', () async {
      mockApi.errorToThrow = Exception('Load failed');
      await notifier.loadMessages('session-1');
      expect(notifier.state.error, contains('Load failed'));
    });
  });

  group('ChatNotifier - addMessage', () {
    test('adds message to session', () {
      notifier.addMessage('session-1', makeMessage('m1'));
      expect(notifier.state.messages['session-1']!.length, 1);
    });

    test('deduplicates messages by id', () {
      final msg = makeMessage('m1');
      notifier.addMessage('session-1', msg);
      notifier.addMessage('session-1', msg);
      expect(notifier.state.messages['session-1']!.length, 1);
    });
  });

  group('ChatNotifier - sendMessage', () {
    test('sends message and adds to session', () async {
      mockApi.sendPrivateMessageResponse = makeMessage('m1', content: 'Hello!');
      final result = await notifier.sendMessage('u2', 'Hello!');
      expect(result, isNotNull);
      expect(result!.content, 'Hello!');
      expect(notifier.state.messages['u2']!.length, 1);
    });

    test('returns null on failure', () async {
      mockApi.errorToThrow = Exception('Send failed');
      final result = await notifier.sendMessage('u2', 'Hello!');
      expect(result, isNull);
    });
  });

  group('ChatNotifier - markRead', () {
    test('calls markRead on the API', () async {
      await notifier.markRead('conv-1');
      expect(mockApi.markReadCallCount, 1);
      expect(mockApi.lastMarkReadId, 'conv-1');
    });
  });
}
