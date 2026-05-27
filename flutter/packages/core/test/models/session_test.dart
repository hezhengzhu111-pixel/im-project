import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';

void main() {
  group('ChatSession', () {
    test('fromJson creates ChatSession with all fields', () {
      final json = {
        'id': 'session1',
        'type': 'private',
        'targetId': 'u2',
        'targetName': 'Bob',
        'unreadCount': 3,
        'conversationId': 'conv1',
        'targetAvatar': 'https://example.com/bob.png',
        'name': 'Bob Chat',
        'avatar': 'https://example.com/bob.png',
        'conversationType': 'private',
        'conversationName': 'Bob Chat',
        'conversationAvatar': 'https://example.com/bob.png',
        'lastMessage': {
          'id': 'msg1',
          'senderId': 'u2',
          'isGroupChat': false,
          'messageType': 'text',
          'content': 'Hello!',
          'sendTime': '2024-01-01T00:00:00Z',
          'status': 'sent',
        },
        'lastMessageTime': '2024-01-01T00:00:00Z',
        'lastMessageSenderId': 'u2',
        'lastMessageSenderName': 'Bob',
        'lastActiveTime': '2024-01-01T00:00:00Z',
        'updateTime': '2024-01-01T00:00:00Z',
        'memberCount': null,
        'encrypted': true,
        'isPinned': true,
        'pinned': true,
        'isMuted': false,
        'muted': false,
      };
      final session = ChatSession.fromJson(json);

      expect(session.id, 'session1');
      expect(session.type, 'private');
      expect(session.targetId, 'u2');
      expect(session.targetName, 'Bob');
      expect(session.unreadCount, 3);
      expect(session.conversationId, 'conv1');
      expect(session.targetAvatar, 'https://example.com/bob.png');
      expect(session.name, 'Bob Chat');
      expect(session.conversationType, 'private');
      expect(session.conversationName, 'Bob Chat');
      expect(session.lastMessage, isNotNull);
      expect(session.lastMessage!.id, 'msg1');
      expect(session.lastMessage!.content, 'Hello!');
      expect(session.lastMessageTime, '2024-01-01T00:00:00Z');
      expect(session.lastMessageSenderId, 'u2');
      expect(session.lastMessageSenderName, 'Bob');
      expect(session.lastActiveTime, '2024-01-01T00:00:00Z');
      expect(session.encrypted, isTrue);
      expect(session.isPinned, isTrue);
      expect(session.isMuted, isFalse);
    });

    test('fromJson creates ChatSession with only required fields', () {
      final json = {
        'id': 'session2',
        'type': 'private',
        'targetId': 'u3',
        'targetName': 'Charlie',
        'unreadCount': 0,
      };
      final session = ChatSession.fromJson(json);

      expect(session.id, 'session2');
      expect(session.type, 'private');
      expect(session.targetId, 'u3');
      expect(session.targetName, 'Charlie');
      expect(session.unreadCount, 0);
      expect(session.conversationId, isNull);
      expect(session.targetAvatar, isNull);
      expect(session.lastMessage, isNull);
      expect(session.lastMessageTime, isNull);
      expect(session.encrypted, isNull);
      expect(session.isPinned, isNull);
      expect(session.isMuted, isNull);
    });

    test('fromJson creates group session', () {
      final json = {
        'id': 'session3',
        'type': 'group',
        'targetId': 'g1',
        'targetName': 'Developers',
        'unreadCount': 10,
        'memberCount': 25,
        'encrypted': false,
      };
      final session = ChatSession.fromJson(json);

      expect(session.type, 'group');
      expect(session.targetName, 'Developers');
      expect(session.memberCount, 25);
      expect(session.encrypted, isFalse);
    });

    test('equality works correctly', () {
      const s1 = ChatSession(
        id: 's1',
        type: 'private',
        targetId: 'u1',
        targetName: 'Alice',
        unreadCount: 0,
      );
      const s2 = ChatSession(
        id: 's1',
        type: 'private',
        targetId: 'u1',
        targetName: 'Alice',
        unreadCount: 0,
      );
      const s3 = ChatSession(
        id: 's2',
        type: 'private',
        targetId: 'u1',
        targetName: 'Alice',
        unreadCount: 0,
      );

      expect(s1, equals(s2));
      expect(s1, isNot(equals(s3)));
    });

    test('copyWith preserves unmodified fields', () {
      const session = ChatSession(
        id: 's1',
        type: 'private',
        targetId: 'u1',
        targetName: 'Alice',
        unreadCount: 5,
      );
      final updated = session.copyWith(unreadCount: 0);

      expect(updated.id, 's1');
      expect(updated.type, 'private');
      expect(updated.targetName, 'Alice');
      expect(updated.unreadCount, 0);
    });
  });

  group('E2eeNegotiationPayload', () {
    test('fromJson creates E2eeNegotiationPayload correctly', () {
      final json = {
        'action': 'initiate',
        'sessionId': 'e2ee-session-1',
        'requesterId': 'u1',
        'requesterName': 'Alice',
        'targetUserId': 'u2',
        'requestPayloadJson': '{"identityKey":"abc","signedPreKey":"def"}',
      };
      final payload = E2eeNegotiationPayload.fromJson(json);

      expect(payload.action, 'initiate');
      expect(payload.sessionId, 'e2ee-session-1');
      expect(payload.requesterId, 'u1');
      expect(payload.requesterName, 'Alice');
      expect(payload.targetUserId, 'u2');
      expect(payload.requestPayloadJson, '{"identityKey":"abc","signedPreKey":"def"}');
    });

    test('fromJson handles minimal fields', () {
      final json = {
        'action': 'respond',
        'sessionId': 'e2ee-session-2',
      };
      final payload = E2eeNegotiationPayload.fromJson(json);

      expect(payload.action, 'respond');
      expect(payload.sessionId, 'e2ee-session-2');
      expect(payload.requesterId, isNull);
      expect(payload.requesterName, isNull);
      expect(payload.targetUserId, isNull);
      expect(payload.requestPayloadJson, isNull);
    });

    test('toJson roundtrip preserves data', () {
      const payload = E2eeNegotiationPayload(
        action: 'initiate',
        sessionId: 's1',
        requesterId: 'u1',
      );
      final json = payload.toJson();
      final restored = E2eeNegotiationPayload.fromJson(json);

      expect(restored, equals(payload));
    });
  });

  group('GroupReadUser', () {
    test('fromJson creates GroupReadUser correctly', () {
      final json = {
        'userId': 'u1',
        'displayName': 'Alice',
      };
      final user = GroupReadUser.fromJson(json);

      expect(user.userId, 'u1');
      expect(user.displayName, 'Alice');
    });

    test('toJson roundtrip preserves data', () {
      const user = GroupReadUser(userId: 'u1', displayName: 'Bob');
      final json = user.toJson();
      final restored = GroupReadUser.fromJson(json);

      expect(restored, equals(user));
    });
  });

  group('ChatSession toJson', () {
    test('toJson serializes fields correctly', () {
      const session = ChatSession(
        id: 's1',
        type: 'private',
        targetId: 'u1',
        targetName: 'Alice',
        unreadCount: 5,
        encrypted: true,
      );
      final json = session.toJson();

      expect(json['id'], 's1');
      expect(json['type'], 'private');
      expect(json['targetId'], 'u1');
      expect(json['targetName'], 'Alice');
      expect(json['unreadCount'], 5);
      expect(json['encrypted'], true);
    });

    test('toJson with lastMessage preserves reference', () {
      final session = ChatSession(
        id: 's1',
        type: 'private',
        targetId: 'u1',
        targetName: 'Alice',
        unreadCount: 1,
        lastMessage: const Message(
          id: 'msg1',
          senderId: 'u1',
          isGroupChat: false,
          messageType: 'text',
          content: 'Hello',
          sendTime: '2024-01-01T00:00:00Z',
          status: 'sent',
        ),
      );
      final json = session.toJson();

      expect(json['lastMessage'], isA<Message>());
      expect((json['lastMessage'] as Message).id, 'msg1');
    });
  });
}
