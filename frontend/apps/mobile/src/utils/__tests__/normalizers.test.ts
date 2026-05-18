/**
 * Test for utils/normalizers.ts
 *
 * This file is purely re-exports from adapter modules and @im/shared-types.
 * We verify that all re-exported bindings are reachable and delegate to the
 * correct underlying module.
 */

jest.mock('@im/shared-types', () => ({
  asBoolean: jest.fn((v: unknown) => Boolean(v)),
  asNumber: jest.fn((v: unknown) => (v == null ? undefined : Number(v))),
  asString: jest.fn((v: unknown) => (v == null ? '' : String(v))),
  isRecord: jest.fn((v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)),
}));

jest.mock('@/adapters/modelAdapter', () => ({
  normalizeAiKey: jest.fn((raw: unknown) => ({ id: String(raw), _normalized: true })),
  normalizeAiSettings: jest.fn((raw: unknown) => ({ ...(raw as object), _normalized: true })),
  normalizeAuthResponse: jest.fn((raw: unknown) => ({ ...(raw as object), _normalized: true })),
  normalizeFriendRequest: jest.fn((raw: unknown) => ({ ...(raw as object), _normalized: true })),
  normalizeFriendship: jest.fn((raw: unknown) => ({ ...(raw as object), _normalized: true })),
  normalizeGroup: jest.fn((raw: unknown) => ({ ...(raw as object), _normalized: true })),
  normalizeGroupMember: jest.fn((raw: unknown) => ({ ...(raw as object), _normalized: true })),
  normalizeSettings: jest.fn((raw: unknown) => ({ ...(raw as object), _normalized: true })),
  normalizeUser: jest.fn((raw: unknown) => ({ ...(raw as object), _normalized: true })),
}));

jest.mock('@/adapters/messageAdapter', () => ({
  normalizeMobileMessage: jest.fn((raw: unknown) => ({ id: String(raw), _normalized: true })),
  hasSameMobileMessageIdentity: jest.fn((a: unknown, b: unknown) => String(a) === String(b)),
  applyMobileMessageToList: jest.fn((list: unknown[], msg: unknown, mode: string) => [...list, msg]),
  toSharedMessage: jest.fn((msg: unknown) => ({ ...(msg as object), _shared: true })),
}));

jest.mock('@/adapters/sessionAdapter', () => ({
  normalizeMobileSession: jest.fn((raw: unknown, userId: string) => ({
    ...(raw as object),
    userId,
    _normalized: true,
  })),
  resolvePrivateSessionId: jest.fn((a: string, b: string) => `${a}_${b}`),
  resolveGroupSessionId: jest.fn((gid: string) => `group_${gid}`),
  resolveMessageSessionId: jest.fn((_msg: unknown, userId: string) => `session_${userId}`),
  createSessionFromMessage: jest.fn((msg: unknown, userId: string) => ({
    ...(msg as object),
    userId,
    _created: true,
  })),
}));

import * as normalizers from '../normalizers';
import * as modelAdapter from '@/adapters/modelAdapter';
import * as messageAdapter from '@/adapters/messageAdapter';
import * as sessionAdapter from '@/adapters/sessionAdapter';

describe('normalizers (re-exports)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── @im/shared-types re-exports ──────────────────────────────────────────

  describe('shared type guards', () => {
    it('re-exports asBoolean', () => {
      expect(normalizers.asBoolean(true)).toBe(true);
      expect(normalizers.asBoolean(0)).toBe(false);
    });

    it('re-exports asNumber', () => {
      expect(normalizers.asNumber(42)).toBe(42);
      expect(normalizers.asNumber(null)).toBeUndefined();
    });

    it('re-exports asString', () => {
      expect(normalizers.asString('hello')).toBe('hello');
      expect(normalizers.asString(null)).toBe('');
    });

    it('re-exports isRecord', () => {
      expect(normalizers.isRecord({})).toBe(true);
      expect(normalizers.isRecord(null)).toBe(false);
    });
  });

  // ── modelAdapter re-exports ──────────────────────────────────────────────

  describe('model adapter re-exports', () => {
    it('normalizeAiKey delegates to modelAdapter', () => {
      const input = { provider: 'deepseek' };
      const result = normalizers.normalizeAiKey(input);
      expect(modelAdapter.normalizeAiKey).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('normalizeAiSettings delegates to modelAdapter', () => {
      const input = { autoReplyEnabled: true };
      const result = normalizers.normalizeAiSettings(input);
      expect(modelAdapter.normalizeAiSettings).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('normalizeAuthResponse delegates to modelAdapter', () => {
      const input = { user_id: 'u1', token: 'abc' };
      const result = normalizers.normalizeAuthResponse(input);
      expect(modelAdapter.normalizeAuthResponse).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('normalizeFriendRequest delegates to modelAdapter', () => {
      const input = { id: '1', applicant_id: 'u1' };
      const result = normalizers.normalizeFriendRequest(input);
      expect(modelAdapter.normalizeFriendRequest).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('normalizeFriendship delegates to modelAdapter', () => {
      const input = { id: '1', user_id: 'u1', friend_id: 'u2' };
      const result = normalizers.normalizeFriendship(input);
      expect(modelAdapter.normalizeFriendship).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('normalizeGroup delegates to modelAdapter', () => {
      const input = { id: '1', name: 'Group' };
      const result = normalizers.normalizeGroup(input);
      expect(modelAdapter.normalizeGroup).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('normalizeGroupMember delegates to modelAdapter', () => {
      const input = { id: '1', group_id: 'g1', user_id: 'u1' };
      const result = normalizers.normalizeGroupMember(input);
      expect(modelAdapter.normalizeGroupMember).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('normalizeSettings delegates to modelAdapter', () => {
      const input = { privacy_settings: {} };
      const result = normalizers.normalizeSettings(input);
      expect(modelAdapter.normalizeSettings).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('normalizeUser delegates to modelAdapter', () => {
      const input = { id: '1', username: 'test' };
      const result = normalizers.normalizeUser(input);
      expect(modelAdapter.normalizeUser).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });
  });

  // ── messageAdapter re-exports ────────────────────────────────────────────

  describe('message adapter re-exports', () => {
    it('normalizeMessage delegates to messageAdapter', () => {
      const input = { content: 'hello' };
      const result = normalizers.normalizeMessage(input);
      expect(messageAdapter.normalizeMobileMessage).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_normalized', true);
    });

    it('hasSameMobileMessageIdentity delegates to messageAdapter', () => {
      const a = { id: '1', senderId: 'u1', isGroupChat: false, messageType: 'TEXT' as const, content: '', sendTime: '2026-01-01T00:00:00Z', status: 'SENT' as const };
      const b = { id: '1', senderId: 'u1', isGroupChat: false, messageType: 'TEXT' as const, content: '', sendTime: '2026-01-01T00:00:00Z', status: 'SENT' as const };
      normalizers.hasSameMobileMessageIdentity(a, b);
      expect(messageAdapter.hasSameMobileMessageIdentity).toHaveBeenCalledWith(a, b);
    });

    it('applyMobileMessageToList delegates to messageAdapter', () => {
      const list = [{ id: '1', senderId: 'u1', isGroupChat: false, messageType: 'TEXT' as const, content: '', sendTime: '2026-01-01T00:00:00Z', status: 'SENT' as const }];
      const msg = { id: '2', senderId: 'u1', isGroupChat: false, messageType: 'TEXT' as const, content: '', sendTime: '2026-01-01T00:00:00Z', status: 'SENT' as const };
      normalizers.applyMobileMessageToList(list, msg);
      expect(messageAdapter.applyMobileMessageToList).toHaveBeenCalledWith(list, msg);
    });

    it('toSharedMessage delegates to messageAdapter', () => {
      const input = { id: '1', senderId: 'u1', isGroupChat: false, messageType: 'TEXT' as const, content: '', sendTime: '2026-01-01T00:00:00Z', status: 'SENT' as const };
      const result = normalizers.toSharedMessage(input);
      expect(messageAdapter.toSharedMessage).toHaveBeenCalledWith(input);
      expect(result).toHaveProperty('_shared', true);
    });
  });

  // ── sessionAdapter re-exports ────────────────────────────────────────────

  describe('session adapter re-exports', () => {
    it('normalizeSession delegates to sessionAdapter', () => {
      const input = { id: 's1' };
      const result = normalizers.normalizeSession(input, 'u1');
      expect(sessionAdapter.normalizeMobileSession).toHaveBeenCalledWith(input, 'u1');
      expect(result).toHaveProperty('_normalized', true);
    });

    it('resolvePrivateSessionId delegates to sessionAdapter', () => {
      const result = normalizers.resolvePrivateSessionId('u1', 'u2');
      expect(sessionAdapter.resolvePrivateSessionId).toHaveBeenCalledWith('u1', 'u2');
      expect(typeof result).toBe('string');
    });

    it('resolveGroupSessionId delegates to sessionAdapter', () => {
      const result = normalizers.resolveGroupSessionId('g1');
      expect(sessionAdapter.resolveGroupSessionId).toHaveBeenCalledWith('g1');
      expect(typeof result).toBe('string');
    });

    it('resolveMessageSessionId delegates to sessionAdapter', () => {
      const msg = { id: '1', senderId: 'u1', isGroupChat: false, messageType: 'TEXT' as const, content: '', sendTime: '2026-01-01T00:00:00Z', status: 'SENT' as const };
      normalizers.resolveMessageSessionId(msg, 'u1');
      expect(sessionAdapter.resolveMessageSessionId).toHaveBeenCalledWith(msg, 'u1');
    });

    it('createSessionFromMessage delegates to sessionAdapter', () => {
      const msg = { id: '1', senderId: 'u1', isGroupChat: false, messageType: 'TEXT' as const, content: '', sendTime: '2026-01-01T00:00:00Z', status: 'SENT' as const };
      const result = normalizers.createSessionFromMessage(msg, 'u1');
      expect(sessionAdapter.createSessionFromMessage).toHaveBeenCalledWith(msg, 'u1');
      expect(result).toHaveProperty('_created', true);
    });
  });

  // ── Ensure all exports are defined ────────────────────────────────────────

  it('exports every expected binding (22 total)', () => {
    const expected = [
      'asBoolean', 'asNumber', 'asString', 'isRecord',
      'normalizeAiKey', 'normalizeAiSettings', 'normalizeAuthResponse',
      'normalizeFriendRequest', 'normalizeFriendship', 'normalizeGroup',
      'normalizeGroupMember', 'normalizeSettings', 'normalizeUser',
      'normalizeMessage', 'hasSameMobileMessageIdentity', 'applyMobileMessageToList', 'toSharedMessage',
      'normalizeSession', 'resolvePrivateSessionId', 'resolveGroupSessionId',
      'resolveMessageSessionId', 'createSessionFromMessage',
    ];
    for (const name of expected) {
      expect(typeof (normalizers as Record<string, unknown>)[name]).toBe('function');
    }
    const keys = Object.keys(normalizers).filter((k) => expected.includes(k));
    expect(keys).toHaveLength(expected.length);
  });
});
