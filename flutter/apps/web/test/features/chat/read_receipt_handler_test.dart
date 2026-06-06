import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/read_receipt_handler.dart';

void main() {
  // ===========================================================================
  // computeReadReceiptTargetIds
  // ===========================================================================

  group('ReadReceiptHandler.computeReadReceiptTargetIds', () {
    test('missing readerId/userId returns empty', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Hello',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'messageId': 'msg-1',
          // No readerId or userId
        },
        currentUserId: 'user-1',
      );

      expect(result, isEmpty);
    });

    test('empty readerId returns empty', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Hello',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': '',
          'messageId': 'msg-1',
        },
        currentUserId: 'user-1',
      );

      expect(result, isEmpty);
    });

    test('readerId == currentUserId returns empty (self-read)', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Hello',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-1',
          'messageId': 'msg-1',
        },
        currentUserId: 'user-1',
      );

      expect(result, isEmpty);
    });

    test('empty currentUserId returns empty', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Hello',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageId': 'msg-1',
        },
        currentUserId: '',
      );

      expect(result, isEmpty);
    });

    test('messageId updates only specified message', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-a',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'A',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
          const Message(
            id: 'msg-b',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'B',
            sendTime: '2024-01-01T00:00:01Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageId': 'msg-a',
        },
        currentUserId: 'user-1',
      );

      expect(result, contains('msg-a'));
      expect(result, isNot(contains('msg-b')));
    });

    test('messageIds updates only specified messages', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-x',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'X',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
          const Message(
            id: 'msg-y',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Y',
            sendTime: '2024-01-01T00:00:01Z',
            status: 'SENT',
          ),
          const Message(
            id: 'msg-z',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Z',
            sendTime: '2024-01-01T00:00:02Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageIds': ['msg-x', 'msg-z'],
        },
        currentUserId: 'user-1',
      );

      expect(result, contains('msg-x'));
      expect(result, isNot(contains('msg-y')));
      expect(result, contains('msg-z'));
    });

    test('lastReadMessageId updates own messages up to target', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Own 1',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
          const Message(
            id: 'msg-2',
            senderId: 'user-2',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Other 1',
            sendTime: '2024-01-01T00:00:01Z',
            status: 'SENT',
          ),
          const Message(
            id: 'msg-3',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Own 2',
            sendTime: '2024-01-01T00:00:02Z',
            status: 'SENT',
          ),
          const Message(
            id: 'msg-4',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Own 3',
            sendTime: '2024-01-01T00:00:03Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'lastReadMessageId': 'msg-3',
        },
        currentUserId: 'user-1',
      );

      // msg-1: own, before target -> updated
      expect(result, contains('msg-1'));
      // msg-2: other's message -> not updated
      expect(result, isNot(contains('msg-2')));
      // msg-3: own, at target -> updated
      expect(result, contains('msg-3'));
      // msg-4: own, after target -> not updated
      expect(result, isNot(contains('msg-4')));
    });

    test('does not update other user messages', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-other',
            senderId: 'user-2',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'From other',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageId': 'msg-other',
        },
        currentUserId: 'user-1',
      );

      expect(result, isEmpty);
    });

    test('no message identifiers returns empty', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Hello',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          // No messageId, messageIds, or lastReadMessageId
        },
        currentUserId: 'user-1',
      );

      expect(result, isEmpty);
    });

    test('userId field is accepted as alias for readerId', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Hello',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'userId': 'user-2',
          'messageId': 'msg-1',
        },
        currentUserId: 'user-1',
      );

      expect(result, contains('msg-1'));
    });

    test('already READ messages are not included', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'msg-1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Hello',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'READ',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'messageId': 'msg-1',
        },
        currentUserId: 'user-1',
      );

      expect(result, isEmpty);
    });

    test('lastReadMessageId with clientMessageId match', () {
      final result = ReadReceiptHandler.computeReadReceiptTargetIds(
        sessionMessages: [
          const Message(
            id: 'local_1',
            senderId: 'user-1',
            isGroupChat: false,
            messageType: 'TEXT',
            content: 'Hello',
            sendTime: '2024-01-01T00:00:00Z',
            status: 'SENT',
            clientMessageId: 'client-1',
          ),
        ],
        eventData: {
          'sessionId': 'user-1_user-2',
          'readerId': 'user-2',
          'lastReadMessageId': 'client-1',
        },
        currentUserId: 'user-1',
      );

      expect(result, contains('local_1'));
    });
  });

  // ===========================================================================
  // applyReadReceipts
  // ===========================================================================

  group('ReadReceiptHandler.applyReadReceipts', () {
    test('updates specified messages to READ', () {
      final messages = [
        const Message(
          id: 'msg-1',
          senderId: 'user-1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'A',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
        const Message(
          id: 'msg-2',
          senderId: 'user-1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'B',
          sendTime: '2024-01-01T00:00:01Z',
          status: 'SENT',
        ),
      ];

      final result = ReadReceiptHandler.applyReadReceipts(
        messages: messages,
        targetIds: {'msg-1'},
        currentUserId: 'user-1',
      );

      expect(result[0].status, 'READ');
      expect(result[1].status, 'SENT');
    });

    test('does not update other user messages', () {
      final messages = [
        const Message(
          id: 'msg-1',
          senderId: 'user-2',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'From other',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      ];

      final result = ReadReceiptHandler.applyReadReceipts(
        messages: messages,
        targetIds: {'msg-1'},
        currentUserId: 'user-1',
      );

      expect(result[0].status, 'SENT');
    });

    test('empty targetIds returns original list', () {
      final messages = [
        const Message(
          id: 'msg-1',
          senderId: 'user-1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'Hello',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
        ),
      ];

      final result = ReadReceiptHandler.applyReadReceipts(
        messages: messages,
        targetIds: {},
        currentUserId: 'user-1',
      );

      expect(identical(result, messages), isTrue);
    });

    test('matches by clientMessageId', () {
      final messages = [
        const Message(
          id: 'local_1',
          senderId: 'user-1',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'Hello',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'SENT',
          clientMessageId: 'client-1',
        ),
      ];

      final result = ReadReceiptHandler.applyReadReceipts(
        messages: messages,
        targetIds: {'client-1'},
        currentUserId: 'user-1',
      );

      expect(result[0].status, 'READ');
    });
  });
}
