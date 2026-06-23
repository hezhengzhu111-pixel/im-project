import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';

void main() {
  group('Message merge multi-device', () {
    test('mergeMessagesChronologically deduplicates by clientMessageId', () {
      final existing = [
        const Message(
          id: 'local_1',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENDING',
          clientMessageId: 'cid_1',
        ),
      ];
      final incoming = [
        const Message(
          id: 'server_100',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
          clientMessageId: 'cid_1',
        ),
      ];
      final merged = mergeMessagesChronologically(existing, incoming);
      expect(merged.length, 1);
      expect(merged[0].id, 'server_100');
      expect(merged[0].status, 'SENT');
    });

    test('mergeMessagesChronologically deduplicates by server id', () {
      final existing = [
        const Message(
          id: 'server_100',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
          clientMessageId: 'cid_1',
        ),
      ];
      final incoming = [
        const Message(
          id: 'server_100',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello updated',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'READ',
        ),
      ];
      final merged = mergeMessagesChronologically(existing, incoming);
      expect(merged.length, 1);
      expect(merged[0].status, 'READ');
    });

    test('mergeMessagesChronologically keeps distinct messages', () {
      final existing = [
        const Message(
          id: 'server_100',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'msg1',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
        ),
      ];
      final incoming = [
        const Message(
          id: 'server_200',
          senderId: 'u2',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'msg2',
          sendTime: '2026-01-01T00:01:00Z',
          status: 'SENT',
        ),
      ];
      final merged = mergeMessagesChronologically(existing, incoming);
      expect(merged.length, 2);
    });

    test('mergeMessagesChronologically updates recalled status', () {
      final existing = [
        const Message(
          id: 'server_100',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
        ),
      ];
      final incoming = [
        const Message(
          id: 'server_100',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'RECALLED',
        ),
      ];
      final merged = mergeMessagesChronologically(existing, incoming);
      expect(merged.length, 1);
      expect(merged[0].status, 'RECALLED');
    });

    test('mergeMessagesChronologically preserves media fields', () {
      final existing = [
        const Message(
          id: 'local_1',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'IMAGE',
          content: '',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENDING',
          clientMessageId: 'cid_img',
          mediaUrl: 'https://example.com/img.png',
          mediaName: 'img.png',
          mediaSize: 1024,
        ),
      ];
      final incoming = [
        const Message(
          id: 'server_300',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'IMAGE',
          content: '',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
          clientMessageId: 'cid_img',
          mediaUrl: 'https://example.com/img.png',
          mediaName: 'img.png',
          mediaSize: 1024,
        ),
      ];
      final merged = mergeMessagesChronologically(existing, incoming);
      expect(merged.length, 1);
      expect(merged[0].mediaUrl, 'https://example.com/img.png');
      expect(merged[0].status, 'SENT');
    });
  });

  group('clientMessageId dedupe', () {
    test('same clientMessageId in same session is duplicate', () {
      final messages = [
        const Message(
          id: 'm1',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
          clientMessageId: 'cid_1',
        ),
      ];
      final newMsg = const Message(
        id: 'm2',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello duplicate',
        sendTime: '2026-01-01T00:01:00Z',
        status: 'SENT',
        clientMessageId: 'cid_1',
      );
      final merged = mergeMessagesChronologically(messages, [newMsg]);
      expect(merged.length, 1);
    });

    test('different clientMessageId is not duplicate', () {
      final messages = [
        const Message(
          id: 'm1',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
          clientMessageId: 'cid_1',
        ),
      ];
      final newMsg = const Message(
        id: 'm2',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'world',
        sendTime: '2026-01-01T00:01:00Z',
        status: 'SENT',
        clientMessageId: 'cid_2',
      );
      final merged = mergeMessagesChronologically(messages, [newMsg]);
      expect(merged.length, 2);
    });
  });

  group('sessionKey normalization', () {
    test('private sessionKey format', () {
      const session = ChatSession(
        id: 's1',
        type: 'private',
        targetId: 'u2',
        targetName: 'Bob',
        unreadCount: 0,
        conversationType: 'private',
      );
      expect(session.type, 'private');
      expect(session.targetId, 'u2');
    });

    test('group sessionKey format', () {
      const session = ChatSession(
        id: 'g1',
        type: 'group',
        targetId: 'group1',
        targetName: 'Team',
        unreadCount: 0,
        conversationType: 'group',
      );
      expect(session.type, 'group');
      expect(session.targetId, 'group1');
    });
  });
}
