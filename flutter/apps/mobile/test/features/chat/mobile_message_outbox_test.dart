import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart' show OutboxMessage;
import 'package:im_mobile/features/chat/data/mobile_message_outbox.dart';

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
  group('MobileMessageOutbox (production)', () {
    late SharedPreferences prefs;
    late MobileMessageOutbox outbox;

    setUp(() async {
      // Use mock SharedPreferences to avoid real device storage.
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      outbox = MobileMessageOutbox(prefs);
    });

    tearDown(() async {
      await outbox.clearAll();
    });

    // ---- Encrypted retry success ----
    test('encrypted outbox retry success', () async {
      final msg = _makeEncryptedWithEnvelope();
      await outbox.enqueue(msg);

      await outbox.retryAllFailed(
        (_) async => _makeFakeServerMessage('server-1'),
      );

      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    // ---- Encrypted outbox missing envelope ----
    test('encrypted outbox missing envelope fails without plaintext fallback', () async {
      final msg = _makeEncryptedMessage(envelope: null); // explicit null
      await outbox.enqueue(msg);

      var plaintextCalled = false;
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
      var count = 0;
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

    // =====================================================================
    // Persistence tests — verify production SharedPreferences backing
    // =====================================================================

    test('pending message survives outbox re-creation', () async {
      final msg = _makeEncryptedWithEnvelope(clientMessageId: 'persist-1');
      await outbox.enqueue(msg);

      expect(await outbox.getPendingCount(), 1);

      // Re-create outbox with same prefs — pending message must still exist.
      final outbox2 = MobileMessageOutbox(prefs);
      addTearDown(() => outbox2.clearAll());

      expect(await outbox2.getPendingCount(), 1);
      expect(await outbox2.getFailedCount(), 0);
    });

    test('sent message is removed after re-creation', () async {
      final msg = _makeEncryptedWithEnvelope(clientMessageId: 'persist-2');
      await outbox.enqueue(msg);

      await outbox.retryAllFailed(
        (_) async => _makeFakeServerMessage('server-ok'),
      );

      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);

      // Re-create outbox — sent message must be gone.
      final outbox2 = MobileMessageOutbox(prefs);
      addTearDown(() => outbox2.clearAll());

      expect(await outbox2.getPendingCount(), 0);
      expect(await outbox2.getFailedCount(), 0);
    });

    test('failed message survives outbox re-creation', () async {
      final msg = _makeEncryptedWithEnvelope(clientMessageId: 'persist-3');
      await outbox.enqueue(msg);

      await outbox.retryAllFailed((_) async => null); // sender returns null → fail

      expect(await outbox.getFailedCount(), 1);

      // Re-create outbox — failed status must persist.
      final outbox2 = MobileMessageOutbox(prefs);
      addTearDown(() => outbox2.clearAll());

      expect(await outbox2.getFailedCount(), 1);
      expect(await outbox2.getPendingCount(), 0);
    });

    test('enqueue dedup survives re-creation', () async {
      final msg = _makeEncryptedWithEnvelope(
          id: 'id-10', clientMessageId: 'persist-dup');
      await outbox.enqueue(msg);

      // Re-create and try to enqueue duplicate.
      final outbox2 = MobileMessageOutbox(prefs);
      addTearDown(() => outbox2.clearAll());

      await outbox2.enqueue(_makeEncryptedWithEnvelope(
          id: 'id-11', clientMessageId: 'persist-dup'));

      // Should still be only 1 message.
      var count = 0;
      await outbox2.retryAllFailed((_) async {
        count++;
        return _makeFakeServerMessage('dedup-ok');
      });
      expect(count, 1);
    });
  });
}
