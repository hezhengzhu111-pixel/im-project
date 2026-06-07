import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/e2ee_history_recovery.dart';

void main() {
  // ===========================================================================
  // needsRecovery
  // ===========================================================================

  group('E2eeHistoryRecovery.needsRecovery', () {
    test('encrypted message with envelope needs recovery', () {
      final msg = Message(
        id: '1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: '',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
        encrypted: true,
        e2eeEnvelope: const E2eeEnvelope(
          version: 1,
          algorithm: 'aes-256-gcm',
          senderDeviceId: 'device-1',
          recipientDeviceId: 'device-2',
          sessionId: 'p_user-1_user-2',
          wire: 'encrypted',
        ),
      );

      expect(E2eeHistoryRecovery.needsRecovery(msg), isTrue);
    });

    test('encrypted message without envelope does not need recovery', () {
      final msg = const Message(
        id: '1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'plain',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
        encrypted: true,
      );

      expect(E2eeHistoryRecovery.needsRecovery(msg), isFalse);
    });

    test('non-encrypted message does not need recovery', () {
      final msg = const Message(
        id: '1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'plain',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
      );

      expect(E2eeHistoryRecovery.needsRecovery(msg), isFalse);
    });
  });

  // ===========================================================================
  // computeOtherMessageRecovery
  // ===========================================================================

  group('E2eeHistoryRecovery.computeOtherMessageRecovery', () {
    test('decrypt success returns content and success status', () {
      final result = E2eeHistoryRecovery.computeOtherMessageRecovery(
        decryptSuccess: true,
        decryptedContent: 'hello world',
      );

      expect(result.content, 'hello world');
      expect(result.decryptStatus, 'success');
      expect(result.shouldWriteCache, isFalse);
    });

    test('decrypt fail returns empty content and failed status', () {
      final result = E2eeHistoryRecovery.computeOtherMessageRecovery(
        decryptSuccess: false,
        decryptedContent: '',
      );

      expect(result.content, '');
      expect(result.decryptStatus, 'failed');
      expect(result.shouldWriteCache, isFalse);
    });
  });

  // ===========================================================================
  // computeOwnMessageRecovery
  // ===========================================================================

  group('E2eeHistoryRecovery.computeOwnMessageRecovery', () {
    test('decrypt success writes to cache', () {
      final result = E2eeHistoryRecovery.computeOwnMessageRecovery(
        decryptSuccess: true,
        decryptedContent: 'my secret',
        cacheHit: false,
        cachedPlaintext: '',
      );

      expect(result.content, 'my secret');
      expect(result.decryptStatus, 'success');
      expect(result.shouldWriteCache, isTrue);
    });

    test('decrypt fail + cache hit restores from cache', () {
      final result = E2eeHistoryRecovery.computeOwnMessageRecovery(
        decryptSuccess: false,
        decryptedContent: '',
        cacheHit: true,
        cachedPlaintext: 'cached text',
      );

      expect(result.content, 'cached text');
      expect(result.decryptStatus, 'restored_from_local_cache');
      expect(result.shouldWriteCache, isFalse);
    });

    test('decrypt fail + cache miss returns unavailable', () {
      final result = E2eeHistoryRecovery.computeOwnMessageRecovery(
        decryptSuccess: false,
        decryptedContent: '',
        cacheHit: false,
        cachedPlaintext: '',
      );

      expect(result.content, '');
      expect(result.decryptStatus, 'unavailable_own_history');
      expect(result.shouldWriteCache, isFalse);
    });

    test('decrypt fail + cache hit but empty plaintext returns unavailable',
        () {
      final result = E2eeHistoryRecovery.computeOwnMessageRecovery(
        decryptSuccess: false,
        decryptedContent: '',
        cacheHit: true,
        cachedPlaintext: '',
      );

      expect(result.content, '');
      expect(result.decryptStatus, 'unavailable_own_history');
      expect(result.shouldWriteCache, isFalse);
    });
  });

  // ===========================================================================
  // camelToSnakeEnvelope
  // ===========================================================================

  group('E2eeHistoryRecovery.camelToSnakeEnvelope', () {
    test('converts camelCase to snake_case', () {
      final camel = {
        'version': 1,
        'algorithm': 'aes-256-gcm',
        'senderDeviceId': 'device-1',
        'recipientDeviceId': 'device-2',
        'sessionId': 'p_user-1_user-2',
        'wire': 'encrypted_data',
      };

      final snake = E2eeHistoryRecovery.camelToSnakeEnvelope(camel);

      expect(snake['version'], 1);
      expect(snake['algorithm'], 'aes-256-gcm');
      expect(snake['sender_device_id'], 'device-1');
      expect(snake['recipient_device_id'], 'device-2');
      expect(snake['session_id'], 'p_user-1_user-2');
      expect(snake['wire'], 'encrypted_data');
    });

    test('preserves handshake when present', () {
      final camel = {
        'version': 1,
        'algorithm': 'aes-256-gcm',
        'senderDeviceId': 'device-1',
        'recipientDeviceId': 'device-2',
        'sessionId': 'p_user-1_user-2',
        'wire': 'encrypted_data',
        'handshake': 'handshake_data',
      };

      final snake = E2eeHistoryRecovery.camelToSnakeEnvelope(camel);

      expect(snake['handshake'], 'handshake_data');
    });

    test('omits handshake when null', () {
      final camel = {
        'version': 1,
        'algorithm': 'aes-256-gcm',
        'senderDeviceId': 'device-1',
        'recipientDeviceId': 'device-2',
        'sessionId': 'p_user-1_user-2',
        'wire': 'encrypted_data',
      };

      final snake = E2eeHistoryRecovery.camelToSnakeEnvelope(camel);

      expect(snake.containsKey('handshake'), isFalse);
    });
  });

  // ===========================================================================
  // extractSessionId
  // ===========================================================================

  group('E2eeHistoryRecovery.extractSessionId', () {
    test('extracts sessionId from envelope', () {
      final msg = Message(
        id: '1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: '',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
        encrypted: true,
        e2eeEnvelope: const E2eeEnvelope(
          version: 1,
          algorithm: 'aes-256-gcm',
          senderDeviceId: 'device-1',
          recipientDeviceId: 'device-2',
          sessionId: 'p_user-1_user-2',
          wire: 'encrypted',
        ),
      );

      expect(E2eeHistoryRecovery.extractSessionId(msg), 'p_user-1_user-2');
    });

    test('returns empty when no envelope', () {
      final msg = const Message(
        id: '1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'plain',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
      );

      expect(E2eeHistoryRecovery.extractSessionId(msg), '');
    });
  });

  // ===========================================================================
  // isOwnMessage
  // ===========================================================================

  group('E2eeHistoryRecovery.isOwnMessage', () {
    test('returns true when sender matches current user', () {
      final msg = const Message(
        id: '1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
      );

      expect(E2eeHistoryRecovery.isOwnMessage(msg, 'user-1'), isTrue);
    });

    test('returns false when sender does not match', () {
      final msg = const Message(
        id: '1',
        senderId: 'user-2',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
      );

      expect(E2eeHistoryRecovery.isOwnMessage(msg, 'user-1'), isFalse);
    });
  });
}
