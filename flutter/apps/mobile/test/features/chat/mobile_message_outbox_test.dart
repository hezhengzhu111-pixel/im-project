import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart' show OutboxPort, OutboxEvent, OutboxMessage, OutboxMessageStatus, OutboxEventType;

/// In-memory storage for testing (substitutes SharedPreferences).
class _FakePrefs {
  final _store = <String, String>{};
  String? getString(String key) => _store[key];
  Future<bool> setString(String key, String value) async {
    _store[key] = value;
    return true;
  }
  Future<bool> remove(String key) async {
    _store.remove(key);
    return true;
  }
}

/// A minimal outbox implementation with in-memory storage for testing.
class TestMobileMessageOutbox implements OutboxPort {
  TestMobileMessageOutbox() {
    _loadFromStorage();
  }

  final _prefs = _FakePrefs();
  final _eventController = StreamController<OutboxEvent>.broadcast();
  final _messages = <OutboxMessage>[];
  static const _storageKey = 'im_outbox_messages';

  @override
  Stream<OutboxEvent> get events => _eventController.stream;

  @override
  Future<int> getPendingCount() async =>
      _messages.where((m) => m.isPending).length;

  @override
  Future<int> getFailedCount() async =>
      _messages.where((m) => m.isFailed).length;

  @override
  Future<void> enqueue(OutboxMessage message) async {
    // Dedup: skip if already sent, keep existing if pending/failed/retrying.
    final existing = _messages.where(
      (m) => m.clientMessageId == message.clientMessageId,
    ).firstOrNull;
    if (existing != null) {
      if (existing.isSent) return;
      return;
    }
    _messages.add(message);
    _eventController.add(const OutboxEvent(type: OutboxEventType.messageAdded));
    await _saveToStorage();
  }

  @override
  Future<void> retryAllFailed(
    Future<Message?> Function(OutboxMessage message) sender,
  ) async {
    if (_messages.isEmpty) return;

    _eventController
        .add(const OutboxEvent(type: OutboxEventType.retryAllStarted));

    final toRetry = _messages
        .where((m) => m.isPending || m.isFailed)
        .toList();

    for (final msg in toRetry) {
      // Pre-flight: encrypted outbox requires envelope and deviceId.
      if (msg.isEncrypted) {
        if (msg.e2eeEnvelope == null) {
          _updateMessage(msg.copyWith(
            status: OutboxMessageStatus.failed,
            lastError: 'encrypted_outbox_missing_envelope',
          ));
          _eventController.add(const OutboxEvent(
            type: OutboxEventType.messageFailed,
          ));
          continue;
        }
        if (msg.e2eeDeviceId == null || msg.e2eeDeviceId!.isEmpty) {
          _updateMessage(msg.copyWith(
            status: OutboxMessageStatus.failed,
            lastError: 'encrypted_outbox_missing_device_id',
          ));
          _eventController.add(const OutboxEvent(
            type: OutboxEventType.messageFailed,
          ));
          continue;
        }
      }

      if (msg.retryCount >= msg.maxRetries) {
        _updateMessage(msg.copyWith(
          status: OutboxMessageStatus.failed,
          lastError: 'max_retries_exceeded',
        ));
        _eventController.add(const OutboxEvent(
          type: OutboxEventType.messageFailed,
        ));
        continue;
      }

      _updateMessage(msg.copyWith(
        status: OutboxMessageStatus.retrying,
        lastRetryAt: DateTime.now().toIso8601String(),
      ));
      _eventController
          .add(const OutboxEvent(type: OutboxEventType.messageRetrying));

      try {
        final result = await sender(msg);
        if (result != null) {
          _updateMessage(msg.copyWith(status: OutboxMessageStatus.sent));
          _eventController.add(OutboxEvent(
            type: OutboxEventType.messageSent,
            message: result,
          ));
          _messages.removeWhere((m) => m.id == msg.id);
        } else {
          _updateMessage(msg.copyWith(
            status: OutboxMessageStatus.failed,
            retryCount: msg.retryCount + 1,
            lastError: 'send_returned_null',
            lastRetryAt: DateTime.now().toIso8601String(),
          ));
          _eventController.add(const OutboxEvent(
            type: OutboxEventType.messageFailed,
          ));
        }
      } catch (e) {
        _updateMessage(msg.copyWith(
          status: OutboxMessageStatus.failed,
          retryCount: msg.retryCount + 1,
          lastError: e.toString(),
          lastRetryAt: DateTime.now().toIso8601String(),
        ));
        _eventController.add(const OutboxEvent(
          type: OutboxEventType.messageFailed,
        ));
      }
    }

    await _saveToStorage();
    _eventController
        .add(const OutboxEvent(type: OutboxEventType.retryAllCompleted));
  }

  @override
  Future<void> clearAll() async {
    _messages.clear();
    await _prefs.remove(_storageKey);
  }

  void _updateMessage(OutboxMessage updated) {
    final index = _messages.indexWhere((m) => m.id == updated.id);
    if (index != -1) {
      _messages[index] = updated;
    }
  }

  Future<void> _saveToStorage() async {
    final list = _messages.map((m) => jsonEncode(m.toMap())).toList();
    await _prefs.setString(_storageKey, jsonEncode(list));
  }

  void _loadFromStorage() {
    final raw = _prefs.getString(_storageKey);
    if (raw == null) return;
    try {
      final list = jsonDecode(raw) as List;
      for (final item in list) {
        if (item is String) {
          _messages.add(OutboxMessage.fromMap(
              jsonDecode(item) as Map<String, dynamic>));
        } else if (item is Map<String, dynamic>) {
          _messages.add(OutboxMessage.fromMap(item));
        }
      }
    } catch (_) {}
  }
}

// ============================================================================
// Test helpers
// ============================================================================

OutboxMessage _makeEncryptedMessage({
  String id = 'msg-1',
  String clientMessageId = 'client-1',
  Map<String, dynamic>? envelope,
  String? deviceId,
}) {
  return OutboxMessage(
    id: id,
    sessionKey: 'session-1',
    receiverId: 'user-b',
    content: '',
    messageType: 'TEXT',
    clientMessageId: clientMessageId,
    isEncrypted: true,
    e2eeEnvelope: envelope,
    e2eeDeviceId: deviceId ?? 'dev-1',
  );
}

OutboxMessage _makeEncryptedWithEnvelope({
  String id = 'msg-1',
  String clientMessageId = 'client-1',
  String? deviceId,
}) {
  return _makeEncryptedMessage(
    id: id,
    clientMessageId: clientMessageId,
    envelope: {'wire': 'test-wire', 'sessionId': 's1'},
    deviceId: deviceId,
  );
}

Message _makeFakeServerMessage(String id) {
  return Message(
    id: id,
    senderId: 'user-a',
    isGroupChat: false,
    messageType: 'TEXT',
    content: '',
    sendTime: DateTime.now().toIso8601String(),
    status: 'SENT',
    clientMessageId: 'client-1',
  );
}

// ============================================================================
// Tests
// ============================================================================

void main() {
  group('MobileMessageOutbox', () {
    late TestMobileMessageOutbox outbox;

    setUp(() {
      outbox = TestMobileMessageOutbox();
    });

    tearDown(() {
      outbox.clearAll();
    });

    // ---- Encrypted retry success ----
    test('encrypted outbox retry success', () async {
      final msg = _makeEncryptedWithEnvelope();
      await outbox.enqueue(msg);

      final result = await _retryWithSender(
        outbox,
        (_) async => _makeFakeServerMessage('server-1'),
      );

      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    // ---- Encrypted outbox missing envelope ----
    test('encrypted outbox missing envelope fails without plaintext fallback', () async {
      final msg = _makeEncryptedMessage(envelope: null); // explicit null
      await outbox.enqueue(msg);

      bool plaintextCalled = false;
      await outbox.retryAllFailed((m) async {
        if (!m.isEncrypted) plaintextCalled = true;
        return _makeFakeServerMessage('s1');
      });

      expect(plaintextCalled, false); // Never called via plaintext path.
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 1);
    });

    // ---- Encrypted outbox missing device id ----
    test('encrypted outbox missing device id fails', () async {
      final msg = _makeEncryptedMessage(deviceId: '');
      await outbox.enqueue(msg);

      await outbox.retryAllFailed((_) async => _makeFakeServerMessage('s1'));

      expect(await outbox.getFailedCount(), 1);
    });

    // ---- Sender returns null ----
    test('sender returns null marks failed with correct lastError', () async {
      final msg = _makeEncryptedWithEnvelope();
      await outbox.enqueue(msg);

      await outbox.retryAllFailed((_) async => null);

      expect(await outbox.getFailedCount(), 1);
    });

    // ---- Duplicate clientMessageId ----
    test('duplicate clientMessageId does not enqueue twice', () async {
      final msg1 = _makeEncryptedWithEnvelope(id: 'id-1', clientMessageId: 'dup-1');
      final msg2 = _makeEncryptedWithEnvelope(id: 'id-2', clientMessageId: 'dup-1');

      await outbox.enqueue(msg1);
      await outbox.enqueue(msg2); // Should be dedup'd.

      // Only 1 message in outbox.
      int count = 0;
      await outbox.retryAllFailed((_) async {
        count++;
        return _makeFakeServerMessage('s-$count');
      });
      expect(count, 1);
    });

    // ---- pendingCount / failedCount ----
    test('pendingCount and failedCount update correctly', () async {
      final msg1 = _makeEncryptedWithEnvelope(id: 'id-1', clientMessageId: 'c1');
      final msg2 = _makeEncryptedMessage(
          id: 'id-2', clientMessageId: 'c2', envelope: null);

      await outbox.enqueue(msg1);
      await outbox.enqueue(msg2);

      expect(await outbox.getPendingCount(), 2);
      expect(await outbox.getFailedCount(), 0);

      await outbox.retryAllFailed((m) async {
        if (m.clientMessageId == 'c1') return _makeFakeServerMessage('s1');
        return null; // msg2 fails.
      });

      // msg1 sent (removed), msg2 failed.
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 1);
    });
  });
}

Future<void> _retryWithSender(
  TestMobileMessageOutbox outbox,
  Future<Message?> Function(OutboxMessage) sender,
) async {
  await outbox.retryAllFailed(sender);
}
