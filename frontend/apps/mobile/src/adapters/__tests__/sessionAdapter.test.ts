import {
  resolvePrivateSessionId,
  resolveGroupSessionId,
  resolveMessageSessionId,
  normalizeMobileSession,
  createSessionFromMessage,
} from '../sessionAdapter';
import type { MobileMessage } from '@/types/models';

const CURRENT_USER = '100';

const baseMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: '1',
  messageId: '1',
  senderId: 'u1',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'hello',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

describe('sessionAdapter', () => {
  // ─── resolvePrivateSessionId ────────────────────────────────────────────
  describe('resolvePrivateSessionId', () => {
    it('builds private session id with smaller_larger order', () => {
      const id = resolvePrivateSessionId('100', '200');
      expect(id).toBe('100_200');
    });

    it('reverses order when targetId is smaller', () => {
      const id = resolvePrivateSessionId('200', '100');
      expect(id).toBe('100_200');
    });
  });

  // ─── resolveGroupSessionId ──────────────────────────────────────────────
  describe('resolveGroupSessionId', () => {
    it('builds group session id with group_ prefix', () => {
      const id = resolveGroupSessionId('g1');
      expect(id).toBe('group_g1');
    });
  });

  // ─── resolveMessageSessionId ────────────────────────────────────────────
  describe('resolveMessageSessionId', () => {
    it('resolves private session from message', () => {
      const msg = baseMessage({ senderId: '100', receiverId: '200' });
      const id = resolveMessageSessionId(msg, '100');
      expect(id).toBe('100_200');
    });

    it('resolves group session from message', () => {
      const msg = baseMessage({ senderId: '100', groupId: 'g1', isGroupChat: true });
      const id = resolveMessageSessionId(msg, '100');
      expect(id).toBe('group_g1');
    });

    it('falls back to conversationId', () => {
      const msg = baseMessage({ senderId: 'u1', conversationId: 'conv_fallback' });
      const id = resolveMessageSessionId(msg, '100');
      expect(id).toBe('conv_fallback');
    });
  });

  // ─── normalizeMobileSession ─────────────────────────────────────────────
  describe('normalizeMobileSession', () => {
    it('normalizes a private conversation DTO via shared normalizer', () => {
      const raw = {
        conversationId: '100_200',
        targetId: '200',
        conversationType: 'PRIVATE',
        targetName: 'Alice',
        targetAvatar: 'https://example.com/alice.jpg',
        unreadCount: 3,
        lastActiveTime: '2024-06-01T10:00:00.000Z',
        lastMessage: 'hi',
        lastMessageType: 'TEXT',
        lastMessageSenderId: '200',
        isPinned: true,
        isMuted: false,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.type).toBe('private');
      expect(session.targetId).toBe('200');
      expect(session.targetName).toBe('Alice');
      expect(session.unreadCount).toBe(3);
      expect(session.isPinned).toBe(true);
      expect(session.isMuted).toBe(false);
      expect(session.lastMessage).toBeDefined();
      expect(session.lastMessage!.content).toBe('hi');
    });

    it('normalizes a group conversation DTO', () => {
      const raw = {
        conversationId: 'group_g1',
        targetId: 'g1',
        conversationType: 'GROUP',
        targetName: 'Team',
        memberCount: 10,
        unreadCount: 5,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.type).toBe('group');
      expect(session.targetId).toBe('g1');
      expect(session.targetName).toBe('Team');
      expect(session.memberCount).toBe(10);
      expect(session.unreadCount).toBe(5);
    });

    it('extracts memberCount from raw record', () => {
      const raw = {
        conversationId: 'group_g2',
        targetId: 'g2',
        conversationType: 'GROUP',
        targetName: 'Group2',
        member_count: 25,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.memberCount).toBe(25);
    });

    it('handles snake_case DTO fields', () => {
      const raw = {
        conversation_id: '100_300',
        target_id: '300',
        conversation_type: 'PRIVATE',
        target_name: 'Bob',
        unread_count: 1,
        last_active_time: '2024-06-01T10:00:00.000Z',
        pinned: true,
        muted: true,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.type).toBe('private');
      expect(session.targetId).toBe('300');
      expect(session.targetName).toBe('Bob');
      expect(session.unreadCount).toBe(1);
      expect(session.isPinned).toBe(true);
      expect(session.isMuted).toBe(true);
    });

    it('falls back to minimal construction when shared normalizer returns null', () => {
      const raw = {
        type: 'private',
        targetId: '500',
        targetName: 'Charlie',
        unreadCount: 2,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.type).toBe('private');
      expect(session.targetId).toBe('500');
      expect(session.targetName).toBe('Charlie');
      expect(session.unreadCount).toBe(2);
    });

    it('falls back for group type in minimal construction', () => {
      const raw = {
        type: 'group',
        targetId: 'g3',
        name: 'Dev Team',
        memberCount: 15,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.type).toBe('group');
      expect(session.targetId).toBe('g3');
      expect(session.targetName).toBe('Dev Team');
      expect(session.memberCount).toBe(15);
    });

    it('normalizes lastMessage through mobile message adapter', () => {
      const raw = {
        conversationId: '100_200',
        targetId: '200',
        conversationType: 'PRIVATE',
        lastMessage: 'test message',
        lastMessageType: 'TEXT',
        lastMessageSenderId: '200',
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.lastMessage).toBeDefined();
      expect(session.lastMessage!.content).toBe('test message');
      // Mobile adapter wraps lastMessage as MobileMessage which has rawJson
      expect((session.lastMessage as unknown as { rawJson?: string }).rawJson).toBeDefined();
    });
  });

  // ─── createSessionFromMessage ───────────────────────────────────────────
  describe('createSessionFromMessage', () => {
    it('creates private session from message where current user is sender', () => {
      const msg = baseMessage({
        senderId: '100',
        receiverId: '200',
        receiverName: 'Bob',
      });
      const session = createSessionFromMessage(msg, '100');
      expect(session).not.toBeNull();
      expect(session!.type).toBe('private');
      expect(session!.targetId).toBe('200');
      expect(session!.targetName).toBe('Bob');
    });

    it('creates private session from message where current user is receiver', () => {
      const msg = baseMessage({
        senderId: '200',
        senderName: 'Alice',
        receiverId: '100',
      });
      const session = createSessionFromMessage(msg, '100');
      expect(session).not.toBeNull();
      expect(session!.type).toBe('private');
      expect(session!.targetId).toBe('200');
      expect(session!.targetName).toBe('Alice');
    });

    it('creates group session from message', () => {
      const msg = baseMessage({
        senderId: '200',
        groupId: 'g1',
        isGroupChat: true,
        groupName: 'Team',
      });
      const session = createSessionFromMessage(msg, '100');
      expect(session).not.toBeNull();
      expect(session!.type).toBe('group');
      expect(session!.targetId).toBe('g1');
      expect(session!.targetName).toBe('Team');
    });

    it('returns null when no targetId can be derived', () => {
      const msg = baseMessage({ senderId: '100', receiverId: undefined });
      const session = createSessionFromMessage(msg, '100');
      expect(session).toBeNull();
    });

    it('falls back to targetId as targetName when name is unavailable', () => {
      const msg = baseMessage({ senderId: '200', receiverId: '100' });
      const session = createSessionFromMessage(msg, '100');
      expect(session!.targetName).toBe('200');
    });
  });
});
