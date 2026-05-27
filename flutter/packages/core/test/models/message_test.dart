import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';

void main() {
  group('Message', () {
    test('fromJson creates Message with all fields', () {
      final json = {
        'id': 'msg1',
        'senderId': 'u1',
        'isGroupChat': false,
        'messageType': 'text',
        'content': 'Hello World',
        'sendTime': '2024-01-01T00:00:00Z',
        'status': 'sent',
        'messageId': 'server-msg-1',
        'clientMessageId': 'client-msg-1',
        'senderName': 'Alice',
        'senderAvatar': 'https://example.com/alice.png',
        'receiverId': 'u2',
        'receiverName': 'Bob',
        'receiverAvatar': 'https://example.com/bob.png',
        'groupId': null,
        'conversationSeq': 1,
        'groupName': null,
        'groupAvatar': null,
        'mediaUrl': 'https://example.com/file.pdf',
        'mediaSize': 1024,
        'mediaName': 'document.pdf',
        'thumbnailUrl': 'https://example.com/thumb.png',
        'duration': null,
        'extra': {'key': 'value'},
        'mentionedUserIds': ['u3', 'u4'],
        'readBy': ['u2'],
        'readByCount': 1,
        'readStatus': 1,
        'readAt': '2024-01-01T00:01:00Z',
        'isAiGenerated': false,
        'aiProvider': null,
        'aiModel': null,
        'encrypted': true,
        'e2eeDeviceId': 'device-1',
        'e2eeEnvelope': {
          'version': 1,
          'algorithm': 'aes-256-gcm',
          'senderDeviceId': 'device-1',
          'recipientDeviceId': 'device-2',
          'sessionId': 'session-1',
          'wire': 'base64-encoded-data',
          'handshake': null,
        },
        'decryptStatus': 'success',
      };
      final message = Message.fromJson(json);

      expect(message.id, 'msg1');
      expect(message.senderId, 'u1');
      expect(message.isGroupChat, isFalse);
      expect(message.messageType, 'text');
      expect(message.content, 'Hello World');
      expect(message.sendTime, '2024-01-01T00:00:00Z');
      expect(message.status, 'sent');
      expect(message.messageId, 'server-msg-1');
      expect(message.clientMessageId, 'client-msg-1');
      expect(message.senderName, 'Alice');
      expect(message.senderAvatar, 'https://example.com/alice.png');
      expect(message.receiverId, 'u2');
      expect(message.receiverName, 'Bob');
      expect(message.conversationSeq, 1);
      expect(message.mediaUrl, 'https://example.com/file.pdf');
      expect(message.mediaSize, 1024);
      expect(message.mediaName, 'document.pdf');
      expect(message.thumbnailUrl, 'https://example.com/thumb.png');
      expect(message.extra, {'key': 'value'});
      expect(message.mentionedUserIds, ['u3', 'u4']);
      expect(message.readBy, ['u2']);
      expect(message.readByCount, 1);
      expect(message.readStatus, 1);
      expect(message.readAt, '2024-01-01T00:01:00Z');
      expect(message.isAiGenerated, isFalse);
      expect(message.encrypted, isTrue);
      expect(message.e2eeDeviceId, 'device-1');
      expect(message.e2eeEnvelope, isNotNull);
      expect(message.e2eeEnvelope!.version, 1);
      expect(message.e2eeEnvelope!.algorithm, 'aes-256-gcm');
      expect(message.decryptStatus, 'success');
    });

    test('fromJson creates Message with only required fields', () {
      final json = {
        'id': 'msg2',
        'senderId': 'u1',
        'isGroupChat': false,
        'messageType': 'text',
        'content': 'Hi',
        'sendTime': '2024-01-01T00:00:00Z',
        'status': 'sending',
      };
      final message = Message.fromJson(json);

      expect(message.id, 'msg2');
      expect(message.content, 'Hi');
      expect(message.status, 'sending');
      expect(message.messageId, isNull);
      expect(message.clientMessageId, isNull);
      expect(message.senderName, isNull);
      expect(message.mediaUrl, isNull);
      expect(message.extra, isNull);
      expect(message.encrypted, isNull);
      expect(message.e2eeEnvelope, isNull);
    });

    test('fromJson handles group message', () {
      final json = {
        'id': 'msg3',
        'senderId': 'u1',
        'isGroupChat': true,
        'messageType': 'text',
        'content': 'Hello group',
        'sendTime': '2024-01-01T00:00:00Z',
        'status': 'sent',
        'groupId': 'g1',
        'groupName': 'Test Group',
        'groupAvatar': 'https://example.com/group.png',
      };
      final message = Message.fromJson(json);

      expect(message.isGroupChat, isTrue);
      expect(message.groupId, 'g1');
      expect(message.groupName, 'Test Group');
      expect(message.groupAvatar, 'https://example.com/group.png');
    });

    test('equality works correctly', () {
      const msg1 = Message(
        id: 'msg1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );
      const msg2 = Message(
        id: 'msg1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );
      const msg3 = Message(
        id: 'msg2',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );

      expect(msg1, equals(msg2));
      expect(msg1, isNot(equals(msg3)));
    });
  });

  group('E2eeEnvelope', () {
    test('fromJson creates E2eeEnvelope correctly', () {
      final json = {
        'version': 1,
        'algorithm': 'aes-256-gcm',
        'senderDeviceId': 'device-1',
        'recipientDeviceId': 'device-2',
        'sessionId': 'session-abc',
        'wire': 'base64encrypteddata',
        'handshake': 'handshake-payload',
      };
      final envelope = E2eeEnvelope.fromJson(json);

      expect(envelope.version, 1);
      expect(envelope.algorithm, 'aes-256-gcm');
      expect(envelope.senderDeviceId, 'device-1');
      expect(envelope.recipientDeviceId, 'device-2');
      expect(envelope.sessionId, 'session-abc');
      expect(envelope.wire, 'base64encrypteddata');
      expect(envelope.handshake, 'handshake-payload');
    });

    test('fromJson handles null handshake', () {
      final json = {
        'version': 2,
        'algorithm': 'xchacha20-poly1305',
        'senderDeviceId': 'd1',
        'recipientDeviceId': 'd2',
        'sessionId': 's1',
        'wire': 'data',
      };
      final envelope = E2eeEnvelope.fromJson(json);

      expect(envelope.version, 2);
      expect(envelope.handshake, isNull);
    });

    test('toJson roundtrip preserves data', () {
      const envelope = E2eeEnvelope(
        version: 1,
        algorithm: 'aes-256-gcm',
        senderDeviceId: 'd1',
        recipientDeviceId: 'd2',
        sessionId: 's1',
        wire: 'encoded',
      );
      final json = envelope.toJson();
      final restored = E2eeEnvelope.fromJson(json);

      expect(restored, equals(envelope));
    });
  });

  group('ReadReceipt', () {
    test('fromJson creates ReadReceipt correctly', () {
      final json = {
        'readerId': 'u1',
        'toUserId': 'u2',
        'conversationId': 'conv1',
        'lastReadMessageId': 'msg5',
        'lastReadSeq': 5,
        'readAt': '2024-01-01T00:01:00Z',
      };
      final receipt = ReadReceipt.fromJson(json);

      expect(receipt.readerId, 'u1');
      expect(receipt.toUserId, 'u2');
      expect(receipt.conversationId, 'conv1');
      expect(receipt.lastReadMessageId, 'msg5');
      expect(receipt.lastReadSeq, 5);
      expect(receipt.readAt, '2024-01-01T00:01:00Z');
    });

    test('fromJson handles minimal fields', () {
      final json = {
        'readerId': 'u1',
      };
      final receipt = ReadReceipt.fromJson(json);

      expect(receipt.readerId, 'u1');
      expect(receipt.toUserId, isNull);
      expect(receipt.conversationId, isNull);
      expect(receipt.lastReadMessageId, isNull);
      expect(receipt.lastReadSeq, isNull);
      expect(receipt.readAt, isNull);
    });
  });

  group('MessageConfig', () {
    test('fromJson creates MessageConfig correctly', () {
      final json = {
        'textEnforce': true,
        'textMaxLength': 5000,
      };
      final config = MessageConfig.fromJson(json);

      expect(config.textEnforce, isTrue);
      expect(config.textMaxLength, 5000);
    });

    test('fromJson with false textEnforce', () {
      final json = {
        'textEnforce': false,
        'textMaxLength': 1000,
      };
      final config = MessageConfig.fromJson(json);

      expect(config.textEnforce, isFalse);
      expect(config.textMaxLength, 1000);
    });
  });
}
