/// Tests for the shared ChatNotifier outbox state machine fixes.
///
/// Covers:
/// - stable unique clientMessageId generation
/// - in-flight deduplication by clientMessageId (not content)
/// - private/group message failure enqueues to outbox for retryable errors
/// - manual retry re-enqueues via the outbox
/// - retryPendingOutboxIfNeeded triggers on pending OR failed messages
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';

class _FakeMessageApi extends MessageApi {
  _FakeMessageApi() : super(_FakeHttpClientPort());

  final _config = const MessageConfig(textEnforce: false, textMaxLength: 2000);

  Exception? privateException;
  Exception? groupException;
  Message? privateResponse;
  Message? groupResponse;

  int sendPrivateMessageCallCount = 0;
  int sendGroupMessageCallCount = 0;
  SendPrivateMessageRequest? lastPrivateRequest;
  SendGroupMessageRequest? lastGroupRequest;

  @override
  Future<MessageConfig> getConfig() async => _config;

  @override
  Future<List<ChatSession>> getConversations() async => [];

  @override
  Future<List<Message>> getPrivateHistory(
    String friendId, {
    int? page,
    int? size,
    String? deviceId,
  }) async => [];

  @override
  Future<List<Message>> getGroupHistory(
    String groupId, {
    int? page,
    int? size,
  }) async => [];

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    sendPrivateMessageCallCount++;
    lastPrivateRequest = request;
    if (privateException != null) throw privateException!;
    return privateResponse ?? _dummyMessage(request.clientMessageId);
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    sendGroupMessageCallCount++;
    lastGroupRequest = request;
    if (groupException != null) throw groupException!;
    return groupResponse ?? _dummyMessage(request.clientMessageId, isGroupChat: true);
  }

  Message _dummyMessage(String? clientMessageId, {bool isGroupChat = false}) => Message(
        id: 'server-id',
        senderId: 'u1',
        receiverId: isGroupChat ? '' : 'u2',
        isGroupChat: isGroupChat,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: DateTime.now().toIso8601String(),
        status: 'SENT',
        clientMessageId: clientMessageId,
      );
}

class _FakeHttpClientPort implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();
}

class _FakeWsClient implements WsClientPort {
  final _events = StreamController<WsEvent>.broadcast();
  final _state = StreamController<WsConnectionState>.broadcast();

  @override
  Stream<WsEvent> get events => _events.stream;
  @override
  Stream<WsConnectionState> get connectionState => _state.stream;
  @override
  bool get isConnected => true;
  @override
  String get wsBaseUrl => 'ws://localhost';
  @override
  Future<void> connect(String url) async {}
  @override
  Future<void> disconnect() async {}
  @override
  Future<void> reconnect() async {}
  @override
  void send(Map<String, dynamic> message) {}
  @override
  void dispose() {}
}

class _RecordingOutboxPort implements OutboxPort {
  final _events = StreamController<OutboxEvent>.broadcast();
  final List<OutboxMessage> enqueued = [];
  int pendingCountValue = 0;
  int failedCountValue = 0;
  int retryAllFailedCallCount = 0;

  @override
  Stream<OutboxEvent> get events => _events.stream;

  @override
  Future<int> getPendingCount() async => pendingCountValue;

  @override
  Future<int> getFailedCount() async => failedCountValue;

  @override
  Future<void> enqueue(OutboxMessage message) async {
    enqueued.add(message);
    _events.add(const OutboxEvent(type: OutboxEventType.messageAdded));
  }

  @override
  Future<void> retryAllFailed(
    Future<Message?> Function(OutboxMessage message) sender,
  ) async {
    retryAllFailedCallCount++;
  }

  @override
  Future<void> clearAll() async {}

  void dispose() => _events.close();
}

void main() {
  group('ChatNotifier outbox state machine', () {
    late _FakeMessageApi messageApi;
    late _FakeWsClient wsClient;
    late _RecordingOutboxPort outbox;
    late ChatNotifier notifier;

    setUp(() {
      messageApi = _FakeMessageApi();
      wsClient = _FakeWsClient();
      outbox = _RecordingOutboxPort();
      notifier = ChatNotifier(
        messageApi,
        MessagePipeline(),
        wsClient,
        () => 'u1',
        outbox: outbox,
      );
    });

    tearDown(() {
      notifier.dispose();
      outbox.dispose();
    });

    test('generates stable unique clientMessageId per message', () async {
      messageApi.privateResponse = messageApi._dummyMessage(null);
      await notifier.sendMessage('u2', 'hi');

      final cid = messageApi.lastPrivateRequest?.clientMessageId;
      expect(cid, isNotNull);
      expect(cid, startsWith('local_'));
      expect(cid!.split('_').length, greaterThanOrEqualTo(4));
    });

    test('two rapid sends get different clientMessageIds', () async {
      await notifier.sendMessage('u2', 'same content');
      final cid1 = messageApi.lastPrivateRequest?.clientMessageId;

      await notifier.sendMessage('u2', 'same content');
      final cid2 = messageApi.lastPrivateRequest?.clientMessageId;

      expect(cid1, isNotNull);
      expect(cid2, isNotNull);
      expect(cid1, isNot(equals(cid2)));
    });

    test('identical content does not dedupe across different messages', () async {
      await notifier.sendMessage('u2', 'duplicate');
      await notifier.sendMessage('u2', 'duplicate');

      expect(messageApi.sendPrivateMessageCallCount, 2);
    });

    test('retryable private send failure enqueues outbox and marks PENDING',
        () async {
      messageApi.privateException = Exception('SocketException: connection refused');
      await notifier.sendMessage('u2', 'retry me');

      expect(outbox.enqueued, hasLength(1));
      final outboxMsg = outbox.enqueued.first;
      expect(outboxMsg.isGroupChat, isFalse);
      expect(outboxMsg.clientMessageId, isNotNull);

      final sessionKey = notifier.state.messages.keys.first;
      final local = notifier.state.messages[sessionKey]!.first;
      expect(local.status, 'PENDING');
    });

    test('retryable group send failure enqueues group outbox and marks PENDING',
        () async {
      messageApi.groupException = Exception('network error');
      await notifier.sendGroupMessage('g1', 'group retry');

      expect(outbox.enqueued, hasLength(1));
      final outboxMsg = outbox.enqueued.first;
      expect(outboxMsg.isGroupChat, isTrue);
      expect(outboxMsg.groupId, 'g1');

      final sessionKey = notifier.state.messages.keys.first;
      final local = notifier.state.messages[sessionKey]!.first;
      expect(local.status, 'PENDING');
    });

    test('non-retryable private send failure does not enqueue outbox', () async {
      messageApi.privateException = Exception('HTTP 403 forbidden');
      await notifier.sendMessage('u2', 'no retry');

      expect(outbox.enqueued, isEmpty);
      final sessionKey = notifier.state.messages.keys.first;
      final local = notifier.state.messages[sessionKey]!.first;
      expect(local.status, 'FAILED');
    });

    test('retryMessage re-enqueues failed private message to outbox', () async {
      messageApi.privateException = Exception('SocketException');
      await notifier.sendMessage('u2', 'manual retry');
      final cid = outbox.enqueued.first.clientMessageId;
      outbox.enqueued.clear();

      await notifier.retryMessage('u2', cid);

      expect(outbox.enqueued, hasLength(1));
      expect(outbox.enqueued.first.clientMessageId, cid);
      final sessionKey = notifier.state.messages.keys.first;
      expect(notifier.state.messages[sessionKey]!.first.status, 'PENDING');
    });

    test('retryPendingOutboxIfNeeded triggers on failedCount > 0', () async {
      outbox.pendingCountValue = 0;
      outbox.failedCountValue = 2;

      await notifier.retryPendingOutboxIfNeeded();

      expect(outbox.retryAllFailedCallCount, 1);
    });

    test('retryPendingOutboxIfNeeded triggers on pendingCount > 0', () async {
      outbox.pendingCountValue = 1;
      outbox.failedCountValue = 0;

      await notifier.retryPendingOutboxIfNeeded();

      expect(outbox.retryAllFailedCallCount, 1);
    });

    test('retryPendingOutboxIfNeeded skips when both counts are zero', () async {
      outbox.pendingCountValue = 0;
      outbox.failedCountValue = 0;

      await notifier.retryPendingOutboxIfNeeded();

      expect(outbox.retryAllFailedCallCount, 0);
    });
  });
}
