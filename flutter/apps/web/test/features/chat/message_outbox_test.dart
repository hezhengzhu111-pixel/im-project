import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';

void main() {
  group('OutboxMessage', () {
    test('creates with default values', () {
      const message = OutboxMessage(
        id: 'test-id',
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Hello',
        messageType: 'text',
        clientMessageId: 'client-1',
      );

      expect(message.id, 'test-id');
      expect(message.sessionKey, 'session-1');
      expect(message.receiverId, 'user-2');
      expect(message.content, 'Hello');
      expect(message.messageType, 'text');
      expect(message.clientMessageId, 'client-1');
      expect(message.isGroupChat, false);
      expect(message.groupId, null);
      expect(message.status, OutboxMessageStatus.pending);
      expect(message.retryCount, 0);
      expect(message.lastRetryAt, null);
      expect(message.createdAt, null);
      expect(message.error, null);
      expect(message.isEncrypted, false);
      expect(message.e2eeEnvelope, null);
      expect(message.e2eeDeviceId, null);
    });

    test('copyWith works correctly', () {
      const message = OutboxMessage(
        id: 'test-id',
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Hello',
        messageType: 'text',
        clientMessageId: 'client-1',
      );

      final updated = message.copyWith(
        status: OutboxMessageStatus.retrying,
        retryCount: 3,
        error: 'Network error',
      );

      expect(updated.id, 'test-id');
      expect(updated.status, OutboxMessageStatus.retrying);
      expect(updated.retryCount, 3);
      expect(updated.error, 'Network error');
      // Original fields should be preserved
      expect(updated.sessionKey, 'session-1');
      expect(updated.receiverId, 'user-2');
      expect(updated.content, 'Hello');
    });

    test('toMap and fromMap round trip', () {
      final now = DateTime.now();
      final message = OutboxMessage(
        id: 'test-id',
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Hello',
        messageType: 'text',
        clientMessageId: 'client-1',
        isGroupChat: true,
        groupId: 'group-1',
        status: OutboxMessageStatus.pending,
        retryCount: 2,
        lastRetryAt: now,
        createdAt: now,
        error: 'Test error',
        isEncrypted: true,
        e2eeDeviceId: 'device-1',
      );

      final map = message.toMap();
      final restored = OutboxMessage.fromMap(map);

      expect(restored.id, message.id);
      expect(restored.sessionKey, message.sessionKey);
      expect(restored.receiverId, message.receiverId);
      expect(restored.content, message.content);
      expect(restored.messageType, message.messageType);
      expect(restored.clientMessageId, message.clientMessageId);
      expect(restored.isGroupChat, message.isGroupChat);
      expect(restored.groupId, message.groupId);
      expect(restored.status, message.status);
      expect(restored.retryCount, message.retryCount);
      expect(restored.error, message.error);
      expect(restored.isEncrypted, message.isEncrypted);
      expect(restored.e2eeDeviceId, message.e2eeDeviceId);
    });

    test('toMap handles null values', () {
      const message = OutboxMessage(
        id: 'test-id',
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Hello',
        messageType: 'text',
        clientMessageId: 'client-1',
      );

      final map = message.toMap();

      expect(map['id'], 'test-id');
      expect(map['groupId'], null);
      expect(map['lastRetryAt'], null);
      expect(map['createdAt'], null);
      expect(map['error'], null);
      expect(map['e2eeEnvelope'], null);
      expect(map['e2eeDeviceId'], null);
    });

    test('fromMap handles missing optional fields', () {
      final map = {
        'id': 'test-id',
        'sessionKey': 'session-1',
        'receiverId': 'user-2',
        'content': 'Hello',
        'clientMessageId': 'client-1',
      };

      final message = OutboxMessage.fromMap(map);

      expect(message.id, 'test-id');
      expect(message.messageType, 'text'); // default
      expect(message.isGroupChat, false); // default
      expect(message.status, OutboxMessageStatus.pending); // default
      expect(message.retryCount, 0); // default
    });
  });

  group('OutboxMessageStatus', () {
    test('has correct values', () {
      expect(OutboxMessageStatus.values.length, 4);
      expect(OutboxMessageStatus.values, contains(OutboxMessageStatus.pending));
      expect(OutboxMessageStatus.values, contains(OutboxMessageStatus.retrying));
      expect(OutboxMessageStatus.values, contains(OutboxMessageStatus.failed));
      expect(OutboxMessageStatus.values, contains(OutboxMessageStatus.sent));
    });
  });

  group('OutboxEvent', () {
    test('creates with required fields', () {
      const event = OutboxEvent(
        type: OutboxEventType.messageAdded,
      );

      expect(event.type, OutboxEventType.messageAdded);
      expect(event.message, null);
      expect(event.error, null);
    });

    test('creates with optional fields', () {
      const message = OutboxMessage(
        id: 'test-id',
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Hello',
        messageType: 'text',
        clientMessageId: 'client-1',
      );

      final event = OutboxEvent(
        type: OutboxEventType.messageFailed,
        message: message,
        error: 'Network error',
      );

      expect(event.type, OutboxEventType.messageFailed);
      expect(event.message, message);
      expect(event.error, 'Network error');
    });
  });

  group('OutboxEventType', () {
    test('has correct values', () {
      expect(OutboxEventType.values.length, 6);
      expect(OutboxEventType.values, contains(OutboxEventType.messageAdded));
      expect(OutboxEventType.values, contains(OutboxEventType.messageRetrying));
      expect(OutboxEventType.values, contains(OutboxEventType.messageSent));
      expect(OutboxEventType.values, contains(OutboxEventType.messageFailed));
      expect(OutboxEventType.values, contains(OutboxEventType.retryAllStarted));
      expect(OutboxEventType.values, contains(OutboxEventType.retryAllCompleted));
    });
  });
}
