import {
  normalizeUser,
  normalizeAuthResponse,
  normalizeSettings,
  normalizeFriendship,
  normalizeFriendRequest,
  normalizeGroup,
  normalizeGroupMember,
  normalizeAiKey,
  normalizeAiSettings,
} from '../modelAdapter';

describe('modelAdapter', () => {
  // ─── normalizeUser ──────────────────────────────────────────────────────
  describe('normalizeUser', () => {
    it('delegates to shared normalizer and adds permissions', () => {
      const raw = {
        id: 'u1',
        username: 'alice',
        nickname: 'Alice',
        avatar: 'https://example.com/alice.jpg',
        permissions: ['read', 'write'],
      };
      const user = normalizeUser(raw);
      expect(user.id).toBe('u1');
      expect(user.username).toBe('alice');
      expect(user.nickname).toBe('Alice');
      expect(user.permissions).toEqual(['read', 'write']);
    });

    it('maps location field', () => {
      const raw = { id: 'u1', username: 'alice', location: 'Beijing' };
      const user = normalizeUser(raw);
      expect(user.location).toBe('Beijing');
    });

    it('falls back to region when location is absent', () => {
      const raw = { id: 'u1', username: 'alice', region: 'Shanghai' };
      const user = normalizeUser(raw);
      expect(user.location).toBe('Shanghai');
    });

    it('extracts permissions from resourcePermissions', () => {
      const raw = {
        id: 'u1',
        username: 'alice',
        resourcePermissions: ['admin', 'mod'],
      };
      const user = normalizeUser(raw);
      expect(user.permissions).toEqual(['admin', 'mod']);
    });

    it('returns undefined permissions when neither field exists', () => {
      const raw = { id: 'u1', username: 'alice' };
      const user = normalizeUser(raw);
      expect(user.permissions).toBeUndefined();
    });

    it('normalizes presence status', () => {
      const raw = { id: 'u1', username: 'alice', status: 'online' };
      const user = normalizeUser(raw);
      expect(user.status).toBe('online');
    });

    it('falls back nickname to username', () => {
      const raw = { id: 'u1', username: 'alice' };
      const user = normalizeUser(raw);
      expect(user.nickname).toBe('alice');
    });
  });

  // ─── normalizeAuthResponse ──────────────────────────────────────────────
  describe('normalizeAuthResponse', () => {
    it('normalizes auth response with user and token', () => {
      const raw = {
        success: true,
        message: 'ok',
        accessToken: 'token_123',
        user: { id: 'u1', username: 'alice' },
      };
      const auth = normalizeAuthResponse(raw);
      expect(auth.success).toBe(true);
      expect(auth.accessToken).toBe('token_123');
      expect(auth.user).toBeDefined();
      expect(auth.user!.id).toBe('u1');
    });

    it('falls back to token field', () => {
      const raw = { success: true, token: 'tok_456' };
      const auth = normalizeAuthResponse(raw);
      expect(auth.token).toBe('tok_456');
    });

    it('extracts permissions from response', () => {
      const raw = {
        success: true,
        permissions: ['read'],
        user: { id: 'u1', username: 'alice' },
      };
      const auth = normalizeAuthResponse(raw);
      expect(auth.permissions).toEqual(['read']);
    });
  });

  // ─── normalizeSettings ──────────────────────────────────────────────────
  describe('normalizeSettings', () => {
    it('delegates to shared normalizer for valid record', () => {
      const raw = {
        general: { language: 'en-US', theme: 'dark' },
      };
      const settings = normalizeSettings(raw);
      expect(settings.general.language).toBe('en-US');
      expect(settings.general.theme).toBe('dark');
    });

    it('returns defaults for non-record input', () => {
      const settings = normalizeSettings(null);
      expect(settings.general.language).toBe('zh-CN');
      expect(settings.general.theme).toBe('light');
    });

    it('returns defaults for string input', () => {
      const settings = normalizeSettings('invalid');
      expect(settings.general).toBeDefined();
      expect(settings.privacy).toBeDefined();
    });
  });

  // ─── normalizeFriendship ────────────────────────────────────────────────
  describe('normalizeFriendship', () => {
    it('delegates to shared normalizer', () => {
      const raw = { id: 'f1', friendId: 'u2', username: 'bob' };
      const friend = normalizeFriendship(raw);
      expect(friend.id).toBe('f1');
      expect(friend.friendId).toBe('u2');
    });

    it('handles snake_case fields', () => {
      const raw = { friend_id: 'u3', friend_user_id: 'u3', username: 'charlie' };
      const friend = normalizeFriendship(raw);
      expect(friend.friendId).toBe('u3');
    });
  });

  // ─── normalizeFriendRequest ─────────────────────────────────────────────
  describe('normalizeFriendRequest', () => {
    it('delegates to shared normalizer with id mapping', () => {
      const raw = {
        id: 'req1',
        applicantId: 'u2',
        targetUserId: 'u1',
        status: 0,
        applyReason: 'hello',
        applyTime: '2024-06-01T10:00:00.000Z',
      };
      const req = normalizeFriendRequest(raw);
      expect(req.id).toBe('req1');
      expect(req.applicantId).toBe('u2');
      expect(req.targetUserId).toBe('u1');
      expect(req.status).toBe('PENDING');
    });

    it('maps requestId to id', () => {
      const raw = { requestId: 'req2', fromUserId: 'u3', toUserId: 'u1' };
      const req = normalizeFriendRequest(raw);
      expect(req.id).toBe('req2');
    });

    it('maps fromUserId to applicantId', () => {
      const raw = { id: 'req3', fromUserId: 'u4', toUserId: 'u1' };
      const req = normalizeFriendRequest(raw);
      expect(req.applicantId).toBe('u4');
    });

    it('maps createTime from created_at', () => {
      const raw = {
        id: 'req4',
        applicantId: 'u2',
        targetUserId: 'u1',
        created_at: '2024-06-01T10:00:00.000Z',
      };
      const req = normalizeFriendRequest(raw);
      expect(req.createTime).toBe('2024-06-01T10:00:00.000Z');
    });
  });

  // ─── normalizeGroup ─────────────────────────────────────────────────────
  describe('normalizeGroup', () => {
    it('delegates to shared normalizer preserving all fields', () => {
      const raw = {
        id: 'g1',
        groupName: 'Team',
        avatar: 'https://example.com/g.jpg',
        announcement: 'Welcome',
        ownerId: 'u1',
        memberCount: 10,
        maxMembers: 500,
        type: 1,
      };
      const group = normalizeGroup(raw);
      expect(group.id).toBe('g1');
      expect(group.groupName).toBe('Team');
      expect(group.avatar).toBe('https://example.com/g.jpg');
      expect(group.announcement).toBe('Welcome');
      expect(group.ownerId).toBe('u1');
      expect(group.memberCount).toBe(10);
    });

    it('handles snake_case fields', () => {
      const raw = {
        group_id: 'g2',
        group_name: 'Dev',
        owner_id: 'u2',
        member_count: 5,
      };
      const group = normalizeGroup(raw);
      expect(group.id).toBe('g2');
      expect(group.groupName).toBe('Dev');
      expect(group.ownerId).toBe('u2');
      expect(group.memberCount).toBe(5);
    });

    it('defaults memberCount to 0', () => {
      const raw = { id: 'g3', ownerId: 'u1' };
      const group = normalizeGroup(raw);
      expect(group.memberCount).toBe(0);
    });
  });

  // ─── normalizeGroupMember ───────────────────────────────────────────────
  describe('normalizeGroupMember', () => {
    it('delegates to shared normalizer with role normalization', () => {
      const raw = { userId: 'u1', groupId: 'g1', role: 3 };
      const member = normalizeGroupMember(raw);
      expect(member.userId).toBe('u1');
      expect(member.groupId).toBe('g1');
      expect(member.role).toBe('OWNER');
    });

    it('normalizes admin role', () => {
      const raw = { userId: 'u2', groupId: 'g1', role: 2 };
      const member = normalizeGroupMember(raw);
      expect(member.role).toBe('ADMIN');
    });

    it('normalizes member role', () => {
      const raw = { userId: 'u3', groupId: 'g1', role: 1 };
      const member = normalizeGroupMember(raw);
      expect(member.role).toBe('MEMBER');
    });

    it('handles snake_case user_id', () => {
      const raw = { user_id: 'u4', group_id: 'g1', role: 1 };
      const member = normalizeGroupMember(raw);
      expect(member.userId).toBe('u4');
      expect(member.groupId).toBe('g1');
    });
  });

  // ─── normalizeAiKey (mobile-local) ──────────────────────────────────────
  describe('normalizeAiKey', () => {
    it('normalizes camelCase fields', () => {
      const raw = {
        id: 'k1',
        provider: 'deepseek',
        keyName: 'My Key',
        maskedKey: 'sk-***abc',
        isActive: true,
        validateStatus: 'ok',
        lastValidatedAt: '1717236000000',
      };
      const key = normalizeAiKey(raw);
      expect(key.id).toBe('k1');
      expect(key.provider).toBe('deepseek');
      expect(key.keyName).toBe('My Key');
      expect(key.maskedKey).toBe('sk-***abc');
      expect(key.isActive).toBe(true);
      expect(key.validateStatus).toBe('ok');
      expect(key.lastValidatedAt).toBe('1717236000000');
    });

    it('normalizes snake_case fields', () => {
      const raw = {
        id: 'k2',
        provider: 'openai',
        key_name: 'OpenAI Key',
        masked_key: 'sk-***xyz',
        is_active: false,
        validate_status: 'invalid',
        last_validated_at: '1717236000000',
      };
      const key = normalizeAiKey(raw);
      expect(key.keyName).toBe('OpenAI Key');
      expect(key.maskedKey).toBe('sk-***xyz');
      expect(key.isActive).toBe(false);
      expect(key.validateStatus).toBe('invalid');
    });

    it('returns empty strings for missing fields', () => {
      const key = normalizeAiKey(null);
      expect(key.id).toBe('');
      expect(key.provider).toBe('');
      expect(key.keyName).toBe('');
    });
  });

  // ─── normalizeAiSettings (mobile-local) ─────────────────────────────────
  describe('normalizeAiSettings', () => {
    it('normalizes camelCase fields', () => {
      const raw = {
        autoReplyEnabled: true,
        autoReplyPersona: 'You are a helpful assistant',
      };
      const settings = normalizeAiSettings(raw);
      expect(settings.autoReplyEnabled).toBe(true);
      expect(settings.autoReplyPersona).toBe('You are a helpful assistant');
    });

    it('normalizes snake_case fields', () => {
      const raw = {
        auto_reply_enabled: false,
        auto_reply_persona: 'Be concise',
      };
      const settings = normalizeAiSettings(raw);
      expect(settings.autoReplyEnabled).toBe(false);
      expect(settings.autoReplyPersona).toBe('Be concise');
    });

    it('returns defaults for missing fields', () => {
      const settings = normalizeAiSettings(null);
      expect(settings.autoReplyEnabled).toBe(false);
      expect(settings.autoReplyPersona).toBe('');
    });
  });
});
