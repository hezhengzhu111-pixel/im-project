import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';

void main() {
  group('ReadReceiptHandler.computeReadReceiptTargetIds', () {
    final messages = [
      const Message(
        id: 'm1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
      ),
      const Message(
        id: 'm2',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'world',
        sendTime: '2026-01-01T00:01:00Z',
        status: 'SENT',
      ),
      const Message(
        id: 'm3',
        senderId: 'u2',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'reply',
        sendTime: '2026-01-01T00:02:00Z',
        status: 'SENT',
      ),
    ];

    test('returns empty when readerId is empty', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: messages,
        eventData: {'readerId': '', 'messageId': 'm1'},
        currentUserId: 'u1',
      );
      expect(result, isEmpty);
    });

    test('returns empty when readerId equals currentUserId', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: messages,
        eventData: {'readerId': 'u1', 'messageId': 'm1'},
        currentUserId: 'u1',
      );
      expect(result, isEmpty);
    });

    test('returns empty when no message identifiers provided', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: messages,
        eventData: {'readerId': 'u2'},
        currentUserId: 'u1',
      );
      expect(result, isEmpty);
    });

    test('updates single message by messageId', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: messages,
        eventData: {'readerId': 'u2', 'messageId': 'm1'},
        currentUserId: 'u1',
      );
      expect(result, contains('m1'));
      expect(result.length, 1);
    });

    test('updates multiple messages by messageIds', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: messages,
        eventData: {
          'readerId': 'u2',
          'messageIds': ['m1', 'm2'],
        },
        currentUserId: 'u1',
      );
      expect(result, containsAll(['m1', 'm2']));
    });

    test('updates messages up to lastReadMessageId', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: messages,
        eventData: {'readerId': 'u2', 'lastReadMessageId': 'm2'},
        currentUserId: 'u1',
      );
      // Should include m1 and m2 (sent by u1), but not m3 (sent by u2).
      expect(result, containsAll(['m1', 'm2']));
      expect(result, isNot(contains('m3')));
    });

    test('skips messages not sent by currentUserId', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: messages,
        eventData: {'readerId': 'u2', 'lastReadMessageId': 'm3'},
        currentUserId: 'u1',
      );
      // m3 is sent by u2, so it should not be included.
      expect(result, isNot(contains('m3')));
      expect(result, containsAll(['m1', 'm2']));
    });

    test('skips messages already READ', () {
      final messagesWithRead = [
        const Message(
          id: 'm1',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'READ',
        ),
        const Message(
          id: 'm2',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'world',
          sendTime: '2026-01-01T00:01:00Z',
          status: 'SENT',
        ),
      ];
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: messagesWithRead,
        eventData: {'readerId': 'u2', 'lastReadMessageId': 'm2'},
        currentUserId: 'u1',
      );
      // m1 is already READ, should not be included.
      expect(result, isNot(contains('m1')));
      expect(result, contains('m2'));
    });
  });

  group('ReadReceiptHandler.applyReadReceipts', () {
    test('updates target messages to READ', () {
      const messages = [
        Message(
          id: 'm1',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
        ),
        Message(
          id: 'm2',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'world',
          sendTime: '2026-01-01T00:01:00Z',
          status: 'SENT',
        ),
      ];
      final result = ReadReceiptHandler.applyReadReceipts(
        messages: messages,
        targetIds: {'m1'},
        currentUserId: 'u1',
      );
      expect(result[0].status, 'READ');
      expect(result[1].status, 'SENT');
    });

    test('does not update messages not sent by currentUserId', () {
      const messages = [
        Message(
          id: 'm1',
          senderId: 'u2',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
        ),
      ];
      final result = ReadReceiptHandler.applyReadReceipts(
        messages: messages,
        targetIds: {'m1'},
        currentUserId: 'u1',
      );
      expect(result[0].status, 'SENT');
    });

    test('returns original list when targetIds is empty', () {
      const messages = [
        Message(
          id: 'm1',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
        ),
      ];
      final result = ReadReceiptHandler.applyReadReceipts(
        messages: messages,
        targetIds: {},
        currentUserId: 'u1',
      );
      expect(result, same(messages));
    });
  });
}
