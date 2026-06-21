/// Tests for the WebOutboxPort production outbox implementation.
///
/// Verifies:
/// - retryAllFailed processes both pending and failed messages.
/// - Failed retries persist only safe error codes, not raw exception text.
/// - Max-retries enforcement marks messages as failed with a safe code.
import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_client_memory.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart' as shared;
import 'package:im_web/features/chat/data/web_outbox_port.dart';

class _FakeSender {
  final List<shared.OutboxMessage> attempts = [];
  Object? error;
  Message? response;

  Future<Message?> call(shared.OutboxMessage message) async {
    attempts.add(message);
    if (error != null) throw error!;
    return response;
  }
}

Message _dummyMessage() => const Message(
      id: 'server-1',
      senderId: 'u1',
      receiverId: 'u2',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hi',
      sendTime: '2026-01-01T00:00:00Z',
      status: 'SENT',
      clientMessageId: 'cid-1',
    );

const _testDbName = 'test_web_outbox_port';

Future<List<shared.OutboxMessage>> _readAllMessages() async {
  final db = await idbFactoryMemory.open(_testDbName);
  final txn = db.transaction('messages', idbModeReadOnly);
  final store = txn.objectStore('messages');
  final result = <shared.OutboxMessage>[];
  await store.openCursor(autoAdvance: true).forEach((cursor) {
    final raw = cursor.value;
    if (raw is Map) {
      result.add(shared.OutboxMessage.fromMap(Map<String, dynamic>.from(raw)));
    }
  });
  await txn.completed;
  db.close();
  return result;
}

void main() {
  group('WebOutboxPort', () {
    late WebOutboxPort outbox;
    late _FakeSender sender;
    var online = true;

    Future<void> _enqueue({
      required String clientMessageId,
      shared.OutboxMessageStatus status = shared.OutboxMessageStatus.pending,
      int retryCount = 0,
      String? createdAt,
    }) async {
      await outbox.enqueue(shared.OutboxMessage(
        id: 'id-$clientMessageId',
        sessionKey: 'session-1',
        receiverId: 'u2',
        content: 'hello',
        messageType: 'TEXT',
        clientMessageId: clientMessageId,
        status: status,
        retryCount: retryCount,
        maxRetries: 2,
        createdAt: createdAt,
      ));
    }

    setUp(() async {
      online = true;
      outbox = WebOutboxPort(
        idbFactory: idbFactoryMemory,
        isOnline: () => online,
        dbName: _testDbName,
      );
      await outbox.initialize();
      await outbox.clearAll();
      sender = _FakeSender();
    });

    tearDown(() async {
      await outbox.dispose();
    });

    test('retryAllFailed processes pending messages', () async {
      await _enqueue(clientMessageId: 'pending-1');
      sender.response = _dummyMessage();

      await outbox.retryAllFailed(sender.call);

      expect(sender.attempts, hasLength(1));
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('retryAllFailed processes failed messages', () async {
      await _enqueue(
        clientMessageId: 'failed-1',
        status: shared.OutboxMessageStatus.failed,
        retryCount: 1,
      );
      sender.response = _dummyMessage();

      await outbox.retryAllFailed(sender.call);

      expect(sender.attempts, hasLength(1));
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('failed retry persists safe error code only', () async {
      await _enqueue(clientMessageId: 'err-1');
      sender.error = Exception('SocketException: connection refused');

      await outbox.retryAllFailed(sender.call);

      final remaining = await outbox.getFailedCount();
      expect(remaining, 1);
      final messages = await _readAllMessages();
      expect(messages.first.lastError, 'socket_exception');
    });

    test('max retries exceeded persists safe error code', () async {
      await _enqueue(
        clientMessageId: 'max-1',
        status: shared.OutboxMessageStatus.failed,
        retryCount: 2,
      );

      await outbox.retryAllFailed(sender.call);

      final messages = await _readAllMessages();
      expect(messages.first.lastError, 'max_retries_exceeded');
      expect(messages.first.status, shared.OutboxMessageStatus.failed);
      expect(sender.attempts, isEmpty);
    });

    test('retryAllFailed processes pending and failed in createdAt order',
        () async {
      await _enqueue(
        clientMessageId: 'later-failed',
        status: shared.OutboxMessageStatus.failed,
        createdAt: '2026-01-02T00:00:00Z',
      );
      await _enqueue(
        clientMessageId: 'earlier-pending',
        status: shared.OutboxMessageStatus.pending,
        createdAt: '2026-01-01T00:00:00Z',
      );
      sender.response = _dummyMessage();

      await outbox.retryAllFailed(sender.call);

      expect(sender.attempts, hasLength(2));
      expect(sender.attempts.first.clientMessageId, 'earlier-pending');
      expect(sender.attempts.last.clientMessageId, 'later-failed');
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('retryAllFailed does not retry sent messages', () async {
      await _enqueue(
        clientMessageId: 'sent-1',
        status: shared.OutboxMessageStatus.sent,
      );
      await _enqueue(clientMessageId: 'pending-1');
      sender.response = _dummyMessage();

      await outbox.retryAllFailed(sender.call);

      expect(sender.attempts, hasLength(1));
      expect(sender.attempts.first.clientMessageId, 'pending-1');
    });

    test('retryAllFailed does not call sender when offline', () async {
      await _enqueue(clientMessageId: 'offline-1');
      online = false;

      await outbox.retryAllFailed(sender.call);

      expect(sender.attempts, isEmpty);
      expect(await outbox.getPendingCount(), 1);
    });

    test('retryAllFailed emits messageSent event for pending message',
        () async {
      await _enqueue(clientMessageId: 'pending-event-1');
      sender.response = _dummyMessage();

      final events = <shared.OutboxEvent>[];
      final subscription = outbox.events.listen(events.add);

      await outbox.retryAllFailed(sender.call);
      // IndexedDB operations complete asynchronously; give the broadcast
      // stream a moment to deliver messageSent / retryAllCompleted.
      await Future<void>.delayed(const Duration(milliseconds: 50));

      final sentEvents = events
          .where((e) => e.type == shared.OutboxEventType.messageSent)
          .toList();
      expect(sentEvents, hasLength(1));
      expect(sentEvents.first.message, isNotNull);
      expect(sentEvents.first.message!.id, 'server-1');

      await subscription.cancel();
    });
  });
}
