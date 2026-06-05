import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/message_merge_utils.dart';

void main() {
  group('mergeMessagesChronologically', () {
    test('deduplicates messages with same server id', () {
      final msg1 = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
      );
      final msg2 = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello updated',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'READ',
      );

      final result = mergeMessagesChronologically([msg1], [msg2]);

      expect(result.length, 1);
      expect(result[0].content, 'Hello updated');
      expect(result[0].status, 'READ');
    });

    test('deduplicates messages with same clientMessageId', () {
      final localMsg = Message(
        id: 'local_123',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENDING',
        clientMessageId: 'client_abc',
      );
      final serverMsg = Message(
        id: '1001',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
        clientMessageId: 'client_abc',
      );

      final result = mergeMessagesChronologically([localMsg], [serverMsg]);

      expect(result.length, 1);
      expect(result[0].id, '1001'); // Server id takes precedence
      expect(result[0].status, 'SENT');
    });

    test('preserves all fields during merge', () {
      final existing = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
        mediaUrl: 'http://example.com/image.jpg',
        mediaName: 'image.jpg',
        thumbnailUrl: 'http://example.com/thumb.jpg',
      );
      final incoming = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello updated',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'READ',
      );

      final result = mergeMessagesChronologically([existing], [incoming]);

      expect(result.length, 1);
      expect(result[0].content, 'Hello updated');
      expect(result[0].status, 'READ');
      expect(result[0].mediaUrl, 'http://example.com/image.jpg');
      expect(result[0].mediaName, 'image.jpg');
      expect(result[0].thumbnailUrl, 'http://example.com/thumb.jpg');
    });

    test('sorts by sendTime ascending', () {
      final msg1 = Message(
        id: '2',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Second',
        sendTime: '2024-01-01T00:01:00Z',
        status: 'SENT',
      );
      final msg2 = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'First',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
      );

      final result = mergeMessagesChronologically([msg1], [msg2]);

      expect(result.length, 2);
      expect(result[0].content, 'First');
      expect(result[1].content, 'Second');
    });

    test('handles empty incoming list', () {
      final msg1 = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
      );

      final result = mergeMessagesChronologically([msg1], []);

      expect(result.length, 1);
      expect(result[0].content, 'Hello');
    });

    test('handles empty existing list', () {
      final msg1 = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
      );

      final result = mergeMessagesChronologically([], [msg1]);

      expect(result.length, 1);
      expect(result[0].content, 'Hello');
    });

    test('preserves e2ee fields', () {
      final existing = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: '',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
        encrypted: true,
        e2eeEnvelope: E2eeEnvelope(
          version: 1,
          algorithm: 'aes-256-gcm',
          senderDeviceId: 'device1',
          recipientDeviceId: 'device2',
          sessionId: 'session1',
          wire: 'encrypted_data',
        ),
        decryptStatus: 'pending',
      );
      final incoming = Message(
        id: '1',
        senderId: 'user1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'decrypted content',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'SENT',
        decryptStatus: 'success',
      );

      final result = mergeMessagesChronologically([existing], [incoming]);

      expect(result.length, 1);
      expect(result[0].content, 'decrypted content');
      expect(result[0].encrypted, true);
      expect(result[0].decryptStatus, 'success');
      expect(result[0].e2eeEnvelope, isNotNull);
    });
  });
}
