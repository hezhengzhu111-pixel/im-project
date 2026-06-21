import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';

Message _message(
  String id, {
  String? clientMessageId,
  String? messageId,
  String content = 'hello',
  String sendTime = '2026-01-01T00:00:00Z',
  String status = 'SENT',
}) {
  return Message(
    id: id,
    messageId: messageId,
    senderId: 'u1',
    receiverId: 'u2',
    isGroupChat: false,
    messageType: 'TEXT',
    content: content,
    sendTime: sendTime,
    status: status,
    clientMessageId: clientMessageId,
  );
}

void main() {
  group('mergeMessagesChronologically', () {
    test('deduplicates by server id and lets incoming fields win', () {
      final result = mergeMessagesChronologically(
        [
          _message(
            'server-1',
            content: 'old',
            sendTime: '2026-01-01T00:00:00Z',
            status: 'SENDING',
          ),
        ],
        [
          _message(
            'server-1',
            content: 'new',
            sendTime: '2026-01-01T00:00:01Z',
            status: 'SENT',
          ),
        ],
      );

      expect(result, hasLength(1));
      expect(result.single.id, 'server-1');
      expect(result.single.content, 'new');
      expect(result.single.status, 'SENT');
    });

    test('replaces pending local message with server ack via client id', () {
      final result = mergeMessagesChronologically(
        [
          _message(
            'local-1',
            clientMessageId: 'local-1',
            status: 'SENDING',
          ),
        ],
        [
          _message(
            'server-1',
            clientMessageId: 'local-1',
            status: 'SENT',
          ),
        ],
      );

      expect(result, hasLength(1));
      expect(result.single.id, 'server-1');
      expect(result.single.clientMessageId, 'local-1');
      expect(result.single.status, 'SENT');
    });

    test('deduplicates by messageId alias', () {
      final result = mergeMessagesChronologically(
        [_message('server-2', status: 'SENDING')],
        [
          _message(
            'client-side-copy',
            messageId: 'server-2',
            status: 'READ',
          ),
        ],
      );

      expect(result, hasLength(1));
      expect(result.single.id, 'server-2');
      expect(result.single.messageId, 'server-2');
      expect(result.single.status, 'READ');
    });

    test('sorts merged messages chronologically', () {
      final result = mergeMessagesChronologically(
        [
          _message('server-2', sendTime: '2026-01-01T00:00:02Z'),
          _message('server-1', sendTime: '2026-01-01T00:00:01Z'),
        ],
        [
          _message('server-3', sendTime: '2026-01-01T00:00:03Z'),
        ],
      );

      expect(result.map((message) => message.id), [
        'server-1',
        'server-2',
        'server-3',
      ]);
    });
  });
}
