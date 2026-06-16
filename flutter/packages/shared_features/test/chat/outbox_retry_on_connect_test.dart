/// Characterization test for network recovery → outbox retry glue.
///
/// Verifies that ChatNotifier triggers outbox.retryAllFailed when the
/// WebSocket connection recovers (WsConnectionState.connected) and there
/// are pending outbox messages.
///
/// Uses a fake OutboxPort to record retryAllFailed calls — no real
/// network, no real E2EE, no real encryption.

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
        OutboxEvent;

// ============================================================================
// Fake OutboxPort — records retryAllFailed calls.
// ============================================================================

class _FakeOutboxPort implements OutboxPort {
  int retryAllFailedCallCount = 0;
  int pendingCountValue = 0;
  int failedCountValue = 0;

  final _eventsController = StreamController<OutboxEvent>.broadcast();

  @override
  Stream<OutboxEvent> get events => _eventsController.stream;

  @override
  Future<int> getPendingCount() async => pendingCountValue;

  @override
  Future<int> getFailedCount() async => failedCountValue;

  @override
  Future<void> enqueue(OutboxMessage message) async {
    // no-op for this test
  }

  @override
  Future<void> retryAllFailed(
    Future<Message?> Function(OutboxMessage message) sender,
  ) async {
    retryAllFailedCallCount++;
  }

  @override
  Future<void> clearAll() async {}

  void dispose() {
    _eventsController.close();
  }
}

// ============================================================================
// Fake WsClientPort — fully controllable connection state.
// ============================================================================

class _FakeWsClientPort implements WsClientPort {
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _connectionStateController =
      StreamController<WsConnectionState>.broadcast();

  bool _connected = false;

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
    _connected = false;
    _connectionStateController.add(WsConnectionState.reconnecting);
    _connected = true;
    _connectionStateController.add(WsConnectionState.connected);
  }

  @override
  void send(Map<String, dynamic> message) {}

  /// Trigger a connected event to simulate network recovery.
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
// Fake HttpClientPort — minimal, returns empty lists.
// ============================================================================

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

// ============================================================================
// Tests
// ============================================================================

void main() {
  group('Network recovery → outbox retry glue', () {
    late _FakeOutboxPort fakeOutbox;
    late _FakeWsClientPort fakeWsClient;
    late _FakeHttpClientPort fakeHttpClient;
    late MessageApi messageApi;
    late ChatNotifier notifier;

    setUp(() {
      fakeOutbox = _FakeOutboxPort();
      fakeWsClient = _FakeWsClientPort();
      fakeHttpClient = _FakeHttpClientPort();
      messageApi = MessageApi(fakeHttpClient, currentUserId: () => 'user-1');
    });

    tearDown(() {
      notifier.dispose();
      fakeOutbox.dispose();
      fakeWsClient.dispose();
    });

    ChatNotifier _createNotifier({OutboxPort? outbox}) {
      return ChatNotifier(
        messageApi,
        MessagePipeline(),
        fakeWsClient,
        () => 'user-1',
        outbox: outbox,
      );
    }

    // -----------------------------------------------------------------------
    // 1. retryAllFailed NOT called before connected
    // -----------------------------------------------------------------------
    test('retryAllFailed not called before WebSocket connected', () async {
      notifier = _createNotifier(outbox: fakeOutbox);
      fakeOutbox.pendingCountValue = 3;

      // Before any connected event, retryAllFailed should not be called.
      expect(fakeOutbox.retryAllFailedCallCount, 0);
    });

    // -----------------------------------------------------------------------
    // 2. connected triggers retryAllFailed (pendingCount > 0)
    // -----------------------------------------------------------------------
    test('connected triggers retryAllFailed when pendingCount > 0', () async {
      fakeOutbox.pendingCountValue = 5;
      notifier = _createNotifier(outbox: fakeOutbox);

      // Trigger WebSocket connected.
      fakeWsClient.emitConnected();

      // Allow async processing.
      await Future<void>.delayed(const Duration(milliseconds: 200));

      expect(fakeOutbox.retryAllFailedCallCount, 1);
    });

    // -----------------------------------------------------------------------
    // 3. pendingCount == 0 does NOT trigger retry
    // -----------------------------------------------------------------------
    test('connected does NOT retry when pendingCount is 0', () async {
      fakeOutbox.pendingCountValue = 0;
      notifier = _createNotifier(outbox: fakeOutbox);

      fakeWsClient.emitConnected();

      await Future<void>.delayed(const Duration(milliseconds: 200));

      expect(fakeOutbox.retryAllFailedCallCount, 0);
    });

    // -----------------------------------------------------------------------
    // 4. retryPendingOutboxIfNeeded direct call with pendingCount > 0
    // -----------------------------------------------------------------------
    test('retryPendingOutboxIfNeeded triggers retry with pending messages',
        () async {
      fakeOutbox.pendingCountValue = 3;
      notifier = _createNotifier(outbox: fakeOutbox);

      await notifier.retryPendingOutboxIfNeeded();

      expect(fakeOutbox.retryAllFailedCallCount, 1);
    });

    // -----------------------------------------------------------------------
    // 5. retryPendingOutboxIfNeeded direct call with pendingCount == 0
    // -----------------------------------------------------------------------
    test('retryPendingOutboxIfNeeded skips retry when no pending messages',
        () async {
      fakeOutbox.pendingCountValue = 0;
      notifier = _createNotifier(outbox: fakeOutbox);

      await notifier.retryPendingOutboxIfNeeded();

      expect(fakeOutbox.retryAllFailedCallCount, 0);
    });

    // -----------------------------------------------------------------------
    // 6. retryPendingOutboxIfNeeded with no outbox is safe
    // -----------------------------------------------------------------------
    test('retryPendingOutboxIfNeeded does nothing when outbox is null',
        () async {
      notifier = _createNotifier(outbox: null);

      // Should not throw.
      await notifier.retryPendingOutboxIfNeeded();
    });
  });
}
