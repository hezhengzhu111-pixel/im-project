/**
 * Tests for group normalizers re-exported from @/normalizers/group.
 *
 * The web normalizers are re-exports from @im/shared-normalizers. These tests
 * verify both re-export identity and functional behavior of normalizeGroup
 * and normalizeGroupMember.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeGroup as webNormalizeGroup,
  normalizeGroupMember as webNormalizeGroupMember,
} from '@/normalizers/group';
import {
  normalizeGroup as sharedNormalizeGroup,
  normalizeGroupMember as sharedNormalizeGroupMember,
} from '@im/shared-normalizers';

describe('normalizers/group: re-export identity', () => {
  it('normalizeGroup is the same reference', () => {
    expect(webNormalizeGroup).toBe(sharedNormalizeGroup);
  });

  it('normalizeGroupMember is the same reference', () => {
    expect(webNormalizeGroupMember).toBe(sharedNormalizeGroupMember);
  });

  it('produces identical output for normalizeGroup', () => {
    const raw = { id: 'g1', groupName: 'Team', ownerId: 'u1' };
    expect(webNormalizeGroup(raw)).toEqual(sharedNormalizeGroup(raw));
  });

  it('produces identical output for normalizeGroupMember', () => {
    const raw = { userId: 'u1', role: 1 };
    expect(webNormalizeGroupMember(raw)).toEqual(sharedNormalizeGroupMember(raw));
  });
});

describe('normalizeGroup', () => {
  it('normalizes a full group object with all fields', () => {
    const raw = {
      id: 'group_001',
      groupName: 'Engineering Team',
      name: 'Engineering',
      description: 'Engineering discussion group',
      announcement: 'Welcome to the team!',
      type: 1,
      avatar: 'https://example.com/avatar.png',
      ownerId: 'user_100',
      memberCount: 15,
      maxMembers: 500,
      status: 1,
      unreadCount: 3,
      lastMessageTime: '2024-06-01T12:00:00Z',
      lastActivityAt: '2024-06-01T12:30:00Z',
      createTime: '2024-01-01T00:00:00Z',
    };

    const result = webNormalizeGroup(raw);
    expect(result.id).toBe('group_001');
    expect(result.groupName).toBe('Engineering Team');
    expect(result.name).toBe('Engineering');
    expect(result.description).toBe('Engineering discussion group');
    expect(result.announcement).toBe('Welcome to the team!');
    expect(result.type).toBe(1);
    expect(result.avatar).toBe('https://example.com/avatar.png');
    expect(result.ownerId).toBe('user_100');
    expect(result.memberCount).toBe(15);
    expect(result.maxMembers).toBe(500);
    expect(result.status).toBe(1);
    expect(result.unreadCount).toBe(3);
    expect(result.lastMessageTime).toBe('2024-06-01T12:00:00Z');
    expect(result.lastActivityAt).toBe('2024-06-01T12:30:00Z');
    expect(result.createTime).toBe('2024-01-01T00:00:00Z');
  });

  it('handles snake_case group_id and group_name', () => {
    const raw = {
      group_id: 'g2',
      group_name: 'Snake Case Group',
      owner_id: 'u2',
      member_count: '30',
    };

    const result = webNormalizeGroup(raw);
    expect(result.id).toBe('g2');
    expect(result.groupName).toBe('Snake Case Group');
    expect(result.ownerId).toBe('u2');
    expect(result.memberCount).toBe(30);
    expect(result.name).toBeUndefined();
  });

  it('handles minimal input with only required fields', () => {
    const result = webNormalizeGroup({ id: 'g1', ownerId: 'u1' });
    expect(result.id).toBe('g1');
    expect(result.ownerId).toBe('u1');
    expect(result.memberCount).toBe(0);
    expect(result.createTime).toBe('');
  });

  it('handles null input gracefully', () => {
    const result = webNormalizeGroup(null);
    expect(result.id).toBe('');
    expect(result.ownerId).toBe('');
    expect(result.memberCount).toBe(0);
    expect(result.createTime).toBe('');
  });

  it('handles undefined input gracefully', () => {
    const result = webNormalizeGroup(undefined);
    expect(result.id).toBe('');
    expect(result.ownerId).toBe('');
  });

  it('falls back to announcement for description', () => {
    const raw = { id: 'g1', ownerId: 'u1', announcement: 'Only announcement' };
    expect(webNormalizeGroup(raw).description).toBe('Only announcement');
  });

  it('normalizes numeric memberCount from string', () => {
    const raw = { id: 'g1', ownerId: 'u1', memberCount: '42' };
    expect(webNormalizeGroup(raw).memberCount).toBe(42);
  });

  it('normalizes numeric ownerId from number to string', () => {
    const raw = { id: 'g1', ownerId: 999 };
    expect(webNormalizeGroup(raw).ownerId).toBe('999');
  });

  it('maxMembers is undefined for non-finite values', () => {
    const raw = {
      id: 'g1', ownerId: 'u1', maxMembers: 'not-a-number' as unknown as number,
    };
    expect(webNormalizeGroup(raw).maxMembers).toBeUndefined();
  });

  it('unreadCount is undefined for non-finite values', () => {
    const raw = {
      id: 'g1', ownerId: 'u1', unreadCount: 'NaN' as unknown as number,
    };
    expect(webNormalizeGroup(raw).unreadCount).toBeUndefined();
  });

  it('handles a public group type 2', () => {
    const raw = { id: 'g1', ownerId: 'u1', type: 2 };
    expect(webNormalizeGroup(raw).type).toBe(2);
  });
});

describe('normalizeGroupMember', () => {
  it('normalizes a full group member object', () => {
    const raw = {
      id: 'membership_001',
      groupId: 'group_001',
      userId: 'user_100',
      username: 'alice',
      nickname: 'Alice',
      avatar: 'https://example.com/avatar.png',
      role: 2,
      joinTime: '2024-02-01T00:00:00Z',
    };

    const result = webNormalizeGroupMember(raw);
    expect(result.id).toBe('membership_001');
    expect(result.groupId).toBe('group_001');
    expect(result.userId).toBe('user_100');
    expect(result.username).toBe('alice');
    expect(result.nickname).toBe('Alice');
    expect(result.avatar).toBe('https://example.com/avatar.png');
    expect(result.role).toBe('ADMIN');
    expect(result.joinTime).toBe('2024-02-01T00:00:00Z');
  });

  it('normalizes role OWNER (3)', () => {
    expect(webNormalizeGroupMember({ userId: 'u1', role: 3 }).role).toBe('OWNER');
  });

  it('normalizes role ADMIN (2)', () => {
    expect(webNormalizeGroupMember({ userId: 'u1', role: 2 }).role).toBe('ADMIN');
  });

  it('normalizes role MEMBER (1)', () => {
    expect(webNormalizeGroupMember({ userId: 'u1', role: 1 }).role).toBe('MEMBER');
  });

  it('normalizes role MEMBER for unknown values', () => {
    expect(webNormalizeGroupMember({ userId: 'u1', role: 99 }).role).toBe('MEMBER');
    expect(webNormalizeGroupMember({ userId: 'u1', role: 'MODERATOR' }).role).toBe('MEMBER');
  });

  it('normalizes role from string values', () => {
    expect(webNormalizeGroupMember({ userId: 'u1', role: '3' }).role).toBe('OWNER');
    expect(webNormalizeGroupMember({ userId: 'u1', role: '2' }).role).toBe('ADMIN');
    expect(webNormalizeGroupMember({ userId: 'u1', role: 'OWNER' }).role).toBe('OWNER');
    expect(webNormalizeGroupMember({ userId: 'u1', role: 'ADMIN' }).role).toBe('ADMIN');
  });

  it('falls back to user_id for userId', () => {
    const raw = { user_id: 'u2', role: 1 };
    expect(webNormalizeGroupMember(raw).userId).toBe('u2');
  });

  it('userId falls back to id when userId absent', () => {
    const raw = { id: 'u3', role: 1 };
    expect(webNormalizeGroupMember(raw).userId).toBe('u3');
  });

  it('handles null input gracefully', () => {
    const result = webNormalizeGroupMember(null);
    expect(result.userId).toBe('');
    expect(result.role).toBe('MEMBER');
    expect(result.joinTime).toBe('');
  });

  it('handles undefined input gracefully', () => {
    const result = webNormalizeGroupMember(undefined);
    expect(result.userId).toBe('');
    expect(result.role).toBe('MEMBER');
    expect(result.joinTime).toBe('');
  });

  it('handles group_id snake_case', () => {
    const raw = { userId: 'u1', group_id: 'g2', role: 1 };
    expect(webNormalizeGroupMember(raw).groupId).toBe('g2');
  });

  it('optional fields are undefined when absent', () => {
    const result = webNormalizeGroupMember({ userId: 'u1', role: 1 });
    expect(result.id).toBeUndefined();
    expect(result.groupId).toBeUndefined();
    expect(result.username).toBeUndefined();
    expect(result.nickname).toBeUndefined();
    expect(result.avatar).toBeUndefined();
  });
});
