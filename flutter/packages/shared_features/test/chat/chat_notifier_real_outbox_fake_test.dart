/// Glue test for ChatNotifier network recovery → outbox retry.
///
/// Uses a "real fake" [OutboxPort] implementation that tracks status
/// transitions and emits events, mirroring the contract of the production
/// WebOutboxPort and MobileMessageOutbox implementations.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart'
    show
        ChatNotifier,
        MessageApi,
        MessagePipeline,
        OutboxPort,
        OutboxMessage,
        OutboxEvent,
        OutboxEventType,
        OutboxMessageStatus,
        SendPrivateMessageRequest,
        SendGroupMessageRequest;

// ============================================================================
// Real Fake OutboxPort — implements the full retry contract in memory.
// ============================================================================

class _RealFakeOutboxPort implements OutboxPort {
  final _messages = <OutboxMessage>[];
  final _eventsController = StreamController<OutboxEvent>.broadcast();
  var _online = true;
  var _isRetrying = false;

  @override
  Stream<OutboxEvent> get events => _eventsController.stream;

  @override
  Future<int> getPendingCount() async =>
      _messages.where((m) => m.status == OutboxMessageStatus.pending).length;

  @override
  Future<int> getFailedCount() async =>
      _messages.where((m) => m.status == OutboxMessageStatus.failed).length;

  @override
  Future<void> enqueue(OutboxMessage message) async {
    _messages.add(message);
    _eventsController.add(const OutboxEvent(type: OutboxEventType.messageAdded));
  }

  @override
  Future<void> retryAllFailed(
    Future<Message?> Function(OutboxMessage message) sender,
  ) async {
    if (_isRetrying || !_online) return;
    _isRetrying = true;
    _eventsController.add(const OutboxEvent(
      type: OutboxEventType.retryAllStarted,
    ));
    try {
      final toRetry = _messages
          .where((m) =>
              m.status == OutboxMessageStatus.pending ||
              m.status == OutboxMessageStatus.failed)
          .toList();
      toRetry.sort((a, b) => (a.createdAt ?? '').compareTo(b.createdAt ?? ''));
      for (final msg in toRetry) {
        if (!_online) break;
        final retrying = msg.copyWith(
          status: OutboxMessageStatus.retrying,
          retryCount: msg.retryCount + 1,
          lastRetryAt: DateTime.now().toIso8601String(),
        );
        _updateMessage(retrying);
        _eventsController.add(const OutboxEvent(
          type: OutboxEventType.messageRetrying,
        ));
        try {
          final sent = await sender(retrying);
          if (sent != null) {
            _messages.removeWhere((m) => m.id == retrying.id);
            _eventsController.add(OutboxEvent(
              type: OutboxEventType.messageSent,
              message: sent,
            ));
          } else {
            _markFailed(retrying, 'send_returned_null');
          }
        } catch (e) {
          _markFailed(retrying, e.toString());
        }
      }
    } finally {
      _isRetrying = false;
      _eventsController.add(const OutboxEvent(
        type: OutboxEventType.retryAllCompleted,
      ));
    }
  }

  void _markFailed(OutboxMessage message, String error) {
    final failed = message.copyWith(
      status: OutboxMessageStatus.failed,
      lastError: error,
    );
    _updateMessage(failed);
    _eventsController.add(const OutboxEvent(
      type: OutboxEventType.messageFailed,
    ));
  }

  void _updateMessage(OutboxMessage updated) {
    final index = _messages.indexWhere((m) => m.id == updated.id);
    if (index != -1) {
      _messages[index] = updated;
    }
  }

  @override
  Future<void> clearAll() async => _messages.clear();

  void setOnline(bool value) => _online = value;

  void dispose() => _eventsController.close();
}

// ============================================================================
// Test doubles for ChatNotifier dependencies.
// ============================================================================

class _FakeMessageApi extends MessageApi {
  _FakeMessageApi() : super(_FakeHttpClientPort(), currentUserId: () => 'user-1');

  Message? sendPrivateMessageResponse;
  Exception? errorToThrow;

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    if (errorToThrow != null) throw errorToThrow!;
    return sendPrivateMessageResponse ?? _dummyMessage(request.clientMessageId ?? 'cid');
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    if (errorToThrow != null) throw errorToThrow!;
    return _dummyMessage(request.clientMessageId ?? 'cid');
  }

  Message _dummyMessage(String clientMessageId) => Message(
        id: 'server-$clientMessageId',
        senderId: 'user-1',
        receiverId: 'user-2',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'ack',
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
  }) async {
    final empty = <dynamic>[];
    return ApiResponse<T>(code: 200, message: 'ok', data: empty as T);
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError('post not needed for this test');
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError('put not needed for this test');
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError('delete not needed for this test');
  }
}

class _FakeWsClientPort implements WsClientPort {
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _connectionStateController =
      StreamController<WsConnectionState>.broadcast();
  var _connected = false;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState =>
      _connectionStateController.stream;

  @override
  bool get isConnected => _connected;

  @override
  String get wsBaseUrl => 'ws://localhost:8082/ws';

  @override
  Future<void> connect(String url) async {
    _connected = true;
    _connectionStateController.add(WsConnectionState.connected);
  }

  @override
  Future<void> disconnect() async {
    _connected = false;
    _connectionStateController.add(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    _connected = true;
    _connectionStateController.add(WsConnectionState.connected);
  }

  @override
  void send(Map<String, dynamic> message) {}

  void emitConnected() {
    _connected = true;
    _connectionStateController.add(WsConnectionState.connected);
  }

  void dispose() {
    _eventsController.close();
    _connectionStateController.close();
  }
}

// ============================================================================
// Tests
// ============================================================================

void main() {
  group('ChatNotifier with real-fake outbox', () {
    late _RealFakeOutboxPort outbox;
    late _FakeWsClientPort fakeWsClient;
    late _FakeMessageApi messageApi;
    late ChatNotifier notifier;

    setUp(() {
      outbox = _RealFakeOutboxPort();
      fakeWsClient = _FakeWsClientPort();
      messageApi = _FakeMessageApi();
    });

    tearDown(() {
      notifier.dispose();
      outbox.dispose();
      fakeWsClient.dispose();
    });

    ChatNotifier _createNotifier() {
      return ChatNotifier(
        messageApi,
        MessagePipeline(),
        fakeWsClient,
        () => 'user-1',
        outbox: outbox,
      );
    }

    test('WebSocket connected retries pending outbox messages', () async {
      await outbox.enqueue(OutboxMessage(
        id: 'pending-1',
        sessionKey: 'user-1_user-2',
        receiverId: 'user-2',
        content: 'hello',
        messageType: 'TEXT',
        clientMessageId: 'pending-1',
        status: OutboxMessageStatus.pending,
        createdAt: DateTime.now().toIso8601String(),
      ));

      notifier = _createNotifier();
      fakeWsClient.emitConnected();

      await Future<void>.delayed(const Duration(milliseconds: 100));

      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('WebSocket connected retries failed outbox messages', () async {
      await outbox.enqueue(OutboxMessage(
        id: 'failed-1',
        sessionKey: 'user-1_user-2',
        receiverId: 'user-2',
        content: 'hello',
        messageType: 'TEXT',
        clientMessageId: 'failed-1',
        status: OutboxMessageStatus.failed,
        retryCount: 1,
        createdAt: DateTime.now().toIso8601String(),
      ));

      notifier = _createNotifier();
      fakeWsClient.emitConnected();

      await Future<void>.delayed(const Duration(milliseconds: 100));

      expect(await outbox.getFailedCount(), 0);
      expect(await outbox.getPendingCount(), 0);
    });

    test('outbox sender success removes message and emits messageSent',
        () async {
      await outbox.enqueue(OutboxMessage(
        id: 'to-send-1',
        sessionKey: 'user-1_user-2',
        receiverId: 'user-2',
        content: 'hello',
        messageType: 'TEXT',
        clientMessageId: 'to-send-1',
        status: OutboxMessageStatus.pending,
        createdAt: DateTime.now().toIso8601String(),
      ));

      notifier = _createNotifier();
      final events = <OutboxEvent>[];
      final subscription = outbox.events.listen(events.add);

      await notifier.retryPendingOutboxIfNeeded();
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
      expect(
        events.map((e) => e.type),
        contains(OutboxEventType.messageSent),
      );
      expect(
        events.map((e) => e.type),
        contains(OutboxEventType.retryAllCompleted),
      );

      await subscription.cancel();
    });

    test('outbox sender failure keeps message failed and emits messageFailed',
        () async {
      messageApi.errorToThrow = Exception('network error');
      await outbox.enqueue(OutboxMessage(
        id: 'to-fail-1',
        sessionKey: 'user-1_user-2',
        receiverId: 'user-2',
        content: 'hello',
        messageType: 'TEXT',
        clientMessageId: 'to-fail-1',
        status: OutboxMessageStatus.pending,
        createdAt: DateTime.now().toIso8601String(),
      ));

      notifier = _createNotifier();
      final events = <OutboxEvent>[];
      final subscription = outbox.events.listen(events.add);

      await notifier.retryPendingOutboxIfNeeded();
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 1);
      expect(
        events.map((e) => e.type),
        contains(OutboxEventType.messageFailed),
      );
      expect(
        events.map((e) => e.type),
        contains(OutboxEventType.retryAllCompleted),
      );

      await subscription.cancel();
    });
  });
}
