import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/session_key_codec.dart';

void main() {
  // ===========================================================================
  // privateSessionKey
  // ===========================================================================

  group('SessionKeyCodec.privateSessionKey', () {
    test('lower userId comes first', () {
      expect(SessionKeyCodec.privateSessionKey('user-1', 'user-2'),
          'user-1_user-2');
    });

    test('higher userId comes first when reversed', () {
      expect(SessionKeyCodec.privateSessionKey('user-2', 'user-1'),
          'user-1_user-2');
    });

    test('numeric IDs are compared numerically', () {
      expect(SessionKeyCodec.privateSessionKey('100', '2'), '2_100');
      expect(SessionKeyCodec.privateSessionKey('2', '100'), '2_100');
    });

    test('empty currentUserId returns targetId', () {
      expect(SessionKeyCodec.privateSessionKey('', 'user-2'), 'user-2');
    });

    test('empty targetId returns empty', () {
      expect(SessionKeyCodec.privateSessionKey('user-1', ''), '');
    });

    test('both empty returns empty', () {
      expect(SessionKeyCodec.privateSessionKey('', ''), '');
    });
  });

  // ===========================================================================
  // groupSessionKey
  // ===========================================================================

  group('SessionKeyCodec.groupSessionKey', () {
    test('adds group_ prefix', () {
      expect(SessionKeyCodec.groupSessionKey('group-1'), 'group_group-1');
    });

    test('strips existing group_ prefix before adding', () {
      expect(SessionKeyCodec.groupSessionKey('group_group-1'), 'group_group-1');
    });

    test('strips g_ prefix before adding', () {
      expect(SessionKeyCodec.groupSessionKey('g_group-1'), 'group_group-1');
    });

    test('empty groupId returns original', () {
      expect(SessionKeyCodec.groupSessionKey(''), '');
    });
  });

  // ===========================================================================
  // e2eeSessionIdForPrivate
  // ===========================================================================

  group('SessionKeyCodec.e2eeSessionIdForPrivate', () {
    test('lower userId comes first with p_ prefix', () {
      expect(SessionKeyCodec.e2eeSessionIdForPrivate('user-1', 'user-2'),
          'p_user-1_user-2');
    });

    test('higher userId comes first when reversed', () {
      expect(SessionKeyCodec.e2eeSessionIdForPrivate('user-2', 'user-1'),
          'p_user-1_user-2');
    });

    test('numeric IDs are compared numerically', () {
      expect(SessionKeyCodec.e2eeSessionIdForPrivate('100', '2'), 'p_2_100');
    });

    test('empty currentUserId returns targetId', () {
      expect(SessionKeyCodec.e2eeSessionIdForPrivate('', 'user-2'), 'user-2');
    });

    test('empty targetId returns empty', () {
      expect(SessionKeyCodec.e2eeSessionIdForPrivate('user-1', ''), '');
    });
  });

  // ===========================================================================
  // normalizeIncomingSessionKey
  // ===========================================================================

  group('SessionKeyCodec.normalizeIncomingSessionKey', () {
    test('exact session id match returns itself', () {
      final sessions = [
        const ChatSession(
          id: 'custom-session',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      expect(
          SessionKeyCodec.normalizeIncomingSessionKey(
              'custom-session', sessions),
          'custom-session');
    });

    test('group_ prefix routes to group target', () {
      final sessions = [
        const ChatSession(
          id: 'group_custom',
          type: 'group',
          targetId: 'custom',
          targetName: 'Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      expect(
          SessionKeyCodec.normalizeIncomingSessionKey('group_custom', sessions),
          'group_custom');
    });

    test('g_ prefix routes to group target', () {
      final sessions = [
        const ChatSession(
          id: 'group_custom',
          type: 'group',
          targetId: 'custom',
          targetName: 'Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      expect(SessionKeyCodec.normalizeIncomingSessionKey('g_custom', sessions),
          'group_custom');
    });

    test('unknown key falls back to private target', () {
      final sessions = <ChatSession>[];
      expect(
          SessionKeyCodec.normalizeIncomingSessionKey(
            'user-1_user-2',
            sessions,
            currentUserId: 'user-1',
          ),
          'user-1_user-2');
    });

    test('bare target id generates canonical private key', () {
      final sessions = <ChatSession>[];
      expect(
          SessionKeyCodec.normalizeIncomingSessionKey(
            'user-2',
            sessions,
            currentUserId: 'user-1',
          ),
          'user-1_user-2');
    });

    test('empty session key returns empty', () {
      expect(SessionKeyCodec.normalizeIncomingSessionKey('', []), '');
    });
  });

  // ===========================================================================
  // privateTargetFromSessionKey
  // ===========================================================================

  group('SessionKeyCodec.privateTargetFromSessionKey', () {
    test('extracts target from compound key', () {
      expect(
          SessionKeyCodec.privateTargetFromSessionKey(
              'user-1_user-2', 'user-1'),
          'user-2');
    });

    test('extracts target when reversed', () {
      expect(
          SessionKeyCodec.privateTargetFromSessionKey(
              'user-1_user-2', 'user-2'),
          'user-1');
    });

    test('bare id returns itself', () {
      expect(SessionKeyCodec.privateTargetFromSessionKey('user-2', 'user-1'),
          'user-2');
    });

    test('null currentUserId returns first non-empty part', () {
      expect(SessionKeyCodec.privateTargetFromSessionKey('user-1_user-2', null),
          'user-1');
    });
  });

  // ===========================================================================
  // negotiationLookupKeys
  // ===========================================================================

  group('SessionKeyCodec.negotiationLookupKeys', () {
    test('returns multiple keys for a session', () {
      final sessions = [
        const ChatSession(
          id: 'custom-session',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      final keys = SessionKeyCodec.negotiationLookupKeys(
        'p_user-1_user-2',
        sessions,
        currentUserId: 'user-1',
      );
      expect(keys, contains('custom-session'));
      expect(keys, contains('p_user-1_user-2'));
    });

    test('empty session id returns only empty', () {
      expect(SessionKeyCodec.negotiationLookupKeys('', []), {''});
    });

    test('returns original id even without session match', () {
      final keys = SessionKeyCodec.negotiationLookupKeys(
        'unknown-session',
        [],
      );
      expect(keys, contains('unknown-session'));
    });
  });

  // ===========================================================================
  // normalizeE2eeSessionKey
  // ===========================================================================

  group('SessionKeyCodec.normalizeE2eeSessionKey', () {
    test('exact match returns session id', () {
      final sessions = [
        const ChatSession(
          id: 'p_user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      expect(
          SessionKeyCodec.normalizeE2eeSessionKey('p_user-1_user-2', sessions),
          'p_user-1_user-2');
    });

    test('p_ prefix resolves to private session key', () {
      final sessions = [
        const ChatSession(
          id: 'custom-session',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      expect(
          SessionKeyCodec.normalizeE2eeSessionKey(
            'p_user-1_user-2',
            sessions,
            currentUserId: 'user-1',
          ),
          'custom-session');
    });

    test('group_ prefix resolves to group session key', () {
      final sessions = [
        const ChatSession(
          id: 'group_custom',
          type: 'group',
          targetId: 'custom',
          targetName: 'Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      expect(SessionKeyCodec.normalizeE2eeSessionKey('group_custom', sessions),
          'group_custom');
    });
  });

  // ===========================================================================
  // e2eeSessionIdForChatOrE2eeSession
  // ===========================================================================

  group('SessionKeyCodec.e2eeSessionIdForChatOrE2eeSession', () {
    test('p_ prefix returned as-is', () {
      expect(
          SessionKeyCodec.e2eeSessionIdForChatOrE2eeSession(
              'p_user-1_user-2', []),
          'p_user-1_user-2');
    });

    test('chat session resolves to e2ee session id', () {
      final sessions = [
        const ChatSession(
          id: 'custom-session',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      expect(
          SessionKeyCodec.e2eeSessionIdForChatOrE2eeSession(
            'custom-session',
            sessions,
            currentUserId: 'user-1',
          ),
          'p_user-1_user-2');
    });

    test('group session returns session id directly', () {
      final sessions = [
        const ChatSession(
          id: 'group_custom',
          type: 'group',
          targetId: 'custom',
          targetName: 'Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      expect(
          SessionKeyCodec.e2eeSessionIdForChatOrE2eeSession(
              'group_custom', sessions),
          'group_custom');
    });
  });

  // ===========================================================================
  // readConversationIdForSessionKey
  // ===========================================================================

  group('SessionKeyCodec.readConversationIdForSessionKey', () {
    test('private session returns targetId', () {
      final sessions = [
        const ChatSession(
          id: 'user-1_user-2',
          type: 'private',
          targetId: 'user-2',
          targetName: 'User 2',
          unreadCount: 0,
          conversationType: 'private',
        ),
      ];
      expect(
          SessionKeyCodec.readConversationIdForSessionKey(
              'user-1_user-2', sessions),
          'user-2');
    });

    test('group session returns group_targetId', () {
      final sessions = [
        const ChatSession(
          id: 'group_group-1',
          type: 'group',
          targetId: 'group-1',
          targetName: 'Group',
          unreadCount: 0,
          conversationType: 'group',
        ),
      ];
      expect(
          SessionKeyCodec.readConversationIdForSessionKey(
              'group_group-1', sessions),
          'group_group-1');
    });

    test('unknown key with group_ prefix', () {
      expect(
          SessionKeyCodec.readConversationIdForSessionKey('group_custom', []),
          'group_custom');
    });

    test('unknown key with g_ prefix', () {
      expect(SessionKeyCodec.readConversationIdForSessionKey('g_custom', []),
          'group_custom');
    });

    test('unknown private key returns target', () {
      expect(
          SessionKeyCodec.readConversationIdForSessionKey(
            'user-1_user-2',
            [],
            currentUserId: 'user-1',
          ),
          'user-2');
    });
  });
}
