import {
  createInitialPaginationState,
  getMessageCursor,
  mergePagedMessages,
} from '../messagePagination';
import type { MobileMessage, MessagePaginationState } from '@/types/models';

const msg = (
  id: string,
  sendTime: string,
  overrides: Partial<MobileMessage> = {},
): MobileMessage => ({
  id,
  messageId: id,
  senderId: 'u1',
  isGroupChat: false,
  messageType: 'TEXT',
  content: `msg ${id}`,
  sendTime,
  status: 'SENT',
  ...overrides,
});

describe('messagePagination', () => {
  // ─── createInitialPaginationState ──────────────────────────────────────
  describe('createInitialPaginationState', () => {
    it('returns correct defaults', () => {
      const state = createInitialPaginationState();
      expect(state).toEqual<MessagePaginationState>({
        loadingInitial: false,
        loadingOlder: false,
        refreshingLatest: false,
        hasMoreBefore: true,
        hasMoreAfter: false,
        initialized: false,
      });
    });

    it('returns a fresh object each time (no shared reference)', () => {
      const a = createInitialPaginationState();
      const b = createInitialPaginationState();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── getMessageCursor ──────────────────────────────────────────────────
  describe('getMessageCursor', () => {
    it('returns undefined cursor for empty list', () => {
      const cursor = getMessageCursor([]);
      expect(cursor.oldestMessageId).toBeUndefined();
      expect(cursor.oldestMessageTime).toBeUndefined();
      expect(cursor.newestMessageId).toBeUndefined();
      expect(cursor.newestMessageTime).toBeUndefined();
    });

    it('extracts oldest and newest from sorted list', () => {
      const messages = [
        msg('a', '2024-06-01T10:00:00.000Z'),
        msg('b', '2024-06-02T10:00:00.000Z'),
        msg('c', '2024-06-03T10:00:00.000Z'),
      ];
      const cursor = getMessageCursor(messages);
      expect(cursor.oldestMessageId).toBe('a');
      expect(cursor.oldestMessageTime).toBe('2024-06-01T10:00:00.000Z');
      expect(cursor.newestMessageId).toBe('c');
      expect(cursor.newestMessageTime).toBe('2024-06-03T10:00:00.000Z');
    });

    it('uses serverId as fallback for oldestMessageId', () => {
      const messages = [
        msg('srv_1', '2024-06-01T10:00:00.000Z', { id: '', serverId: 'srv_1' }),
      ];
      const cursor = getMessageCursor(messages);
      expect(cursor.oldestMessageId).toBe('srv_1');
    });

    it('handles single message as both oldest and newest', () => {
      const messages = [msg('only', '2024-06-01T10:00:00.000Z')];
      const cursor = getMessageCursor(messages);
      expect(cursor.oldestMessageId).toBe('only');
      expect(cursor.newestMessageId).toBe('only');
      expect(cursor.oldestMessageTime).toBe(cursor.newestMessageTime);
    });
  });

  // ─── mergePagedMessages: replace ──────────────────────────────────────
  describe('mergePagedMessages — replace', () => {
    it('replaces existing list with incoming', () => {
      const existing = [msg('old', '2024-06-01T10:00:00.000Z')];
      const incoming = [
        msg('new1', '2024-06-02T10:00:00.000Z'),
        msg('new2', '2024-06-03T10:00:00.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'replace');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('new1');
      expect(result[1].id).toBe('new2');
    });

    it('deduplicates within incoming on replace', () => {
      const incoming = [
        msg('a', '2024-06-01T10:00:00.000Z'),
        msg('a', '2024-06-01T10:00:01.000Z', { content: 'updated' }),
      ];
      const result = mergePagedMessages([], incoming, 'replace');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('updated');
    });
  });

  // ─── mergePagedMessages: prependOlder ──────────────────────────────────
  describe('mergePagedMessages — prependOlder', () => {
    it('prepends older messages and keeps ascending sort', () => {
      const existing = [
        msg('b', '2024-06-02T10:00:00.000Z'),
        msg('c', '2024-06-03T10:00:00.000Z'),
      ];
      const incoming = [
        msg('a', '2024-06-01T10:00:00.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'prependOlder');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
      expect(result[2].id).toBe('c');
    });

    it('deduplicates against existing messages', () => {
      const existing = [
        msg('a', '2024-06-01T10:00:00.000Z'),
        msg('b', '2024-06-02T10:00:00.000Z'),
      ];
      const incoming = [
        msg('a', '2024-06-01T10:00:00.000Z'),
        msg('z', '2024-05-01T10:00:00.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'prependOlder');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('z');
    });

    it('returns existing when incoming is empty', () => {
      const existing = [msg('a', '2024-06-01T10:00:00.000Z')];
      const result = mergePagedMessages(existing, [], 'prependOlder');
      expect(result).toEqual(existing);
    });
  });

  // ─── mergePagedMessages: appendNewer ───────────────────────────────────
  describe('mergePagedMessages — appendNewer', () => {
    it('appends newer messages and keeps ascending sort', () => {
      const existing = [
        msg('a', '2024-06-01T10:00:00.000Z'),
        msg('b', '2024-06-02T10:00:00.000Z'),
      ];
      const incoming = [
        msg('c', '2024-06-03T10:00:00.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'appendNewer');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
      expect(result[2].id).toBe('c');
    });

    it('deduplicates against existing messages', () => {
      const existing = [
        msg('a', '2024-06-01T10:00:00.000Z'),
        msg('b', '2024-06-02T10:00:00.000Z'),
      ];
      const incoming = [
        msg('b', '2024-06-02T10:00:01.000Z', { content: 'updated b' }),
        msg('c', '2024-06-03T10:00:00.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'appendNewer');
      expect(result).toHaveLength(3);
      const updatedB = result.find((m) => m.id === 'b');
      expect(updatedB?.content).toBe('updated b');
    });

    it('returns existing when incoming is empty', () => {
      const existing = [msg('a', '2024-06-01T10:00:00.000Z')];
      const result = mergePagedMessages(existing, [], 'appendNewer');
      expect(result).toEqual(existing);
    });
  });

  // ─── mergePagedMessages: upsertRealtime ────────────────────────────────
  describe('mergePagedMessages — upsertRealtime', () => {
    it('appends a new realtime message', () => {
      const existing = [
        msg('a', '2024-06-01T10:00:00.000Z'),
      ];
      const incoming = msg('b', '2024-06-02T10:00:00.000Z');
      const result = mergePagedMessages(existing, [incoming], 'upsertRealtime');
      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('b');
    });

    it('does not duplicate a message with the same serverId', () => {
      const existing = [
        msg('srv_1', '2024-06-01T10:00:00.000Z', { content: 'original' }),
      ];
      const incoming = msg('srv_1', '2024-06-01T10:00:00.000Z', { content: 'updated' });
      const result = mergePagedMessages(existing, [incoming], 'upsertRealtime');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('updated');
    });

    it('does not duplicate by clientMessageId', () => {
      const existing = [
        msg('local_1', '2024-06-01T10:00:00.000Z', {
          clientMessageId: 'cm_1',
          status: 'SENDING',
        }),
      ];
      const incoming = msg('srv_ws', '2024-06-01T10:00:01.000Z', {
        clientMessageId: 'cm_1',
        status: 'SENT',
      });
      const result = mergePagedMessages(existing, [incoming], 'upsertRealtime');
      expect(result).toHaveLength(1);
      expect(result[0].clientMessageId).toBe('cm_1');
    });
  });

  // ─── Pending local message preservation ────────────────────────────────
  describe('pending local message preservation', () => {
    it('preserves pending SENDING messages not matched by incoming', () => {
      const existing = [
        msg('local_pending', '2024-06-01T10:00:00.000Z', {
          status: 'SENDING',
          clientMessageId: 'cm_pending',
        }),
        msg('server_1', '2024-06-01T10:00:01.000Z'),
      ];
      const incoming = [
        msg('server_2', '2024-06-01T10:00:02.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'appendNewer');
      expect(result).toHaveLength(3);
      const pending = result.find((m) => m.id === 'local_pending');
      expect(pending).toBeDefined();
      expect(pending?.status).toBe('SENDING');
    });

    it('preserves FAILED messages not matched by incoming', () => {
      const existing = [
        msg('local_failed', '2024-06-01T10:00:00.000Z', {
          status: 'FAILED',
          clientMessageId: 'cm_failed',
        }),
      ];
      const incoming = [
        msg('server_new', '2024-06-01T10:00:02.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'appendNewer');
      expect(result).toHaveLength(2);
      const failed = result.find((m) => m.id === 'local_failed');
      expect(failed?.status).toBe('FAILED');
    });
  });

  // ─── Same clientMessageId merge ────────────────────────────────────────
  describe('same clientMessageId merge', () => {
    it('merges local SENDING pending with server SENT response via clientMessageId', () => {
      const existing = [
        msg('local_1', '2024-06-01T10:00:00.000Z', {
          status: 'SENDING',
          clientMessageId: 'cm_merge',
          content: 'hello',
        }),
      ];
      const incoming = [
        msg('srv_1', '2024-06-01T10:00:01.000Z', {
          status: 'SENT',
          clientMessageId: 'cm_merge',
          content: 'hello',
          serverId: 'srv_1',
        }),
      ];
      const result = mergePagedMessages(existing, incoming, 'appendNewer');
      expect(result).toHaveLength(1);
      expect(result[0].clientMessageId).toBe('cm_merge');
      expect(result[0].status).toBe('SENT');
    });

    it('merges local FAILED pending with server response and prefers server status', () => {
      const existing = [
        msg('local_2', '2024-06-01T10:00:00.000Z', {
          status: 'FAILED',
          clientMessageId: 'cm_retry',
        }),
      ];
      const incoming = [
        msg('srv_2', '2024-06-01T10:00:01.000Z', {
          status: 'DELIVERED',
          clientMessageId: 'cm_retry',
          serverId: 'srv_2',
        }),
      ];
      const result = mergePagedMessages(existing, incoming, 'upsertRealtime');
      expect(result).toHaveLength(1);
      expect(result[0].clientMessageId).toBe('cm_retry');
      expect(result[0].status).toBe('DELIVERED');
    });

    it('merges pending with server in prependOlder mode', () => {
      const existing = [
        msg('local_old', '2024-06-02T10:00:00.000Z', {
          status: 'SENDING',
          clientMessageId: 'cm_old',
        }),
      ];
      const incoming = [
        msg('srv_old', '2024-06-01T10:00:00.000Z', {
          status: 'SENT',
          clientMessageId: 'cm_old',
          serverId: 'srv_old',
        }),
      ];
      const result = mergePagedMessages(existing, incoming, 'prependOlder');
      expect(result).toHaveLength(1);
      expect(result[0].clientMessageId).toBe('cm_old');
      expect(result[0].status).toBe('SENT');
    });
  });

  // ─── mergePagedMessages — replace with pending preservation ────────────
  describe('mergePagedMessages — replace with pending preservation', () => {
    it('preserves SENDING messages in replace mode', () => {
      const existing = [
        msg('local_pending', '2024-06-01T10:00:00.000Z', {
          status: 'SENDING',
          clientMessageId: 'cm_pending',
        }),
      ];
      const incoming = [
        msg('srv_1', '2024-06-01T10:00:01.000Z'),
        msg('srv_2', '2024-06-01T10:00:02.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'replace');
      expect(result).toHaveLength(3);
      const pending = result.find((m) => m.id === 'local_pending');
      expect(pending).toBeDefined();
      expect(pending?.status).toBe('SENDING');
    });

    it('preserves FAILED messages in replace mode', () => {
      const existing = [
        msg('local_failed', '2024-06-01T10:00:00.000Z', {
          status: 'FAILED',
          clientMessageId: 'cm_failed',
        }),
      ];
      const incoming = [
        msg('srv_1', '2024-06-01T10:00:01.000Z'),
      ];
      const result = mergePagedMessages(existing, incoming, 'replace');
      expect(result).toHaveLength(2);
      const failed = result.find((m) => m.id === 'local_failed');
      expect(failed).toBeDefined();
      expect(failed?.status).toBe('FAILED');
    });

    it('merges pending with server when same clientMessageId in replace mode', () => {
      const existing = [
        msg('local_1', '2024-06-01T10:00:00.000Z', {
          status: 'SENDING',
          clientMessageId: 'cm_1',
        }),
      ];
      const incoming = [
        msg('srv_1', '2024-06-01T10:00:01.000Z', {
          status: 'SENT',
          clientMessageId: 'cm_1',
        }),
      ];
      const result = mergePagedMessages(existing, incoming, 'replace');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('SENT');
      expect(result[0].clientMessageId).toBe('cm_1');
    });
  });

  // ─── Stable sort with same sendTime ────────────────────────────────────
  describe('stable sort with same sendTime', () => {
    it('sorts by id when sendTime is identical', () => {
      const time = '2024-06-01T10:00:00.000Z';
      const existing = [
        msg('z', time),
        msg('a', time),
        msg('m', time),
      ];
      const incoming = [
        msg('b', time),
      ];
      const result = mergePagedMessages(existing, incoming, 'appendNewer');
      expect(result).toHaveLength(4);
      expect(result.map((m) => m.id)).toEqual(['a', 'b', 'm', 'z']);
    });

    it('maintains ascending order across all modes with same sendTime', () => {
      const time = '2024-06-01T10:00:00.000Z';
      const messages = [
        msg('c', time),
        msg('a', time),
        msg('b', time),
      ];
      const result = mergePagedMessages([], messages, 'replace');
      expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    });

    it('sort is stable in upsertRealtime with same sendTime', () => {
      const time = '2024-06-01T10:00:00.000Z';
      const existing = [
        msg('a', time),
        msg('c', time),
      ];
      const incoming = msg('b', time);
      const result = mergePagedMessages(existing, [incoming], 'upsertRealtime');
      expect(result).toHaveLength(3);
      expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    });
  });
});
