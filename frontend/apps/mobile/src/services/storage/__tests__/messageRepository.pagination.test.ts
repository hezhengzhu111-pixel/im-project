/**
 * Phase 3 — messageRepository.listMessagesPage pagination tests.
 *
 * Focused on the pagination contract of the repository layer:
 *   - initial page returns most-recent N messages (sendTime ASC)
 *   - older/newer cursor queries
 *   - hasMore boundary computation
 *   - cross-page dedup when messages overlap
 *   - conversation isolation
 *
 * Runs against the memory-fallback path (default in test env).
 */
import type { MobileMessage } from '@/types/models';
import { messageRepository } from '../messageRepository';

const makeMessage = (
  id: string,
  sendTime: string,
  conversationId = 'conv_p',
  overrides: Partial<MobileMessage> = {},
): MobileMessage => ({
  id,
  serverId: id,
  conversationId,
  senderId: 'u1',
  receiverId: 'u2',
  isGroupChat: false,
  messageType: 'TEXT',
  content: `content ${id}`,
  sendTime,
  status: 'SENT',
  ...overrides,
});

const SEED = Array.from({ length: 12 }, (_, i) =>
  makeMessage(`m${i + 1}`, `2024-07-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
);

describe('messageRepository.listMessagesPage — Phase 3 pagination', () => {
  beforeEach(() => {
    messageRepository.clearAllCache();
    messageRepository.upsertMessages('conv_p', SEED);
  });

  // ── 本地初始分页 ────────────────────────────────────────────────────────
  describe('initial page (local)', () => {
    it('returns the most recent limit messages sorted by sendTime ASC', () => {
      const result = messageRepository.listMessagesPage('conv_p', { limit: 5 });

      expect(result.messages).toHaveLength(5);
      // Most recent 5: m8..m12
      expect(result.messages.map((m) => m.id)).toEqual(['m8', 'm9', 'm10', 'm11', 'm12']);
      expect(result.hasMore).toBe(true);
      expect(result.oldestMessage?.id).toBe('m8');
      expect(result.newestMessage?.id).toBe('m12');
    });

    it('returns all messages when fewer than limit', () => {
      messageRepository.upsertMessages('conv_small', [
        makeMessage('s1', '2024-08-01T10:00:00Z', 'conv_small'),
        makeMessage('s2', '2024-08-02T10:00:00Z', 'conv_small'),
      ]);

      const result = messageRepository.listMessagesPage('conv_small', { limit: 50 });

      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('returns empty result for non-existent conversation', () => {
      const result = messageRepository.listMessagesPage('no_such_conv', { limit: 10 });

      expect(result.messages).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.oldestMessage).toBeUndefined();
      expect(result.newestMessage).toBeUndefined();
    });
  });

  // ── 本地 older 分页 ─────────────────────────────────────────────────────
  describe('older page (local)', () => {
    it('returns messages strictly before beforeTime', () => {
      const result = messageRepository.listMessagesPage('conv_p', {
        limit: 3,
        beforeTime: '2024-07-06T10:00:00.000Z',
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages.map((m) => m.id)).toEqual(['m3', 'm4', 'm5']);
      expect(result.hasMore).toBe(true);
    });

    it('returns hasMore=false when fewer messages remain', () => {
      const result = messageRepository.listMessagesPage('conv_p', {
        limit: 100,
        beforeTime: '2024-07-03T10:00:00.000Z',
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(result.hasMore).toBe(false);
    });

    it('returns empty when beforeTime is earlier than all messages', () => {
      const result = messageRepository.listMessagesPage('conv_p', {
        limit: 10,
        beforeTime: '2020-01-01T00:00:00.000Z',
      });

      expect(result.messages).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  // ── 远端 newer 参数 (repository supports afterTime) ────────────────────
  describe('newer page (local)', () => {
    it('returns messages strictly after afterTime', () => {
      const result = messageRepository.listMessagesPage('conv_p', {
        limit: 3,
        afterTime: '2024-07-09T10:00:00.000Z',
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages.map((m) => m.id)).toEqual(['m10', 'm11', 'm12']);
      expect(result.hasMore).toBe(false);
    });

    it('returns hasMore=true when more messages exist beyond limit', () => {
      const result = messageRepository.listMessagesPage('conv_p', {
        limit: 2,
        afterTime: '2024-07-01T10:00:00.000Z',
      });

      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });

  // ── hasMore 边界计算 ───────────────────────────────────────────────────
  describe('hasMore boundary', () => {
    it('hasMore=false when exactly limit messages exist', () => {
      const result = messageRepository.listMessagesPage('conv_p', { limit: 12 });

      expect(result.messages).toHaveLength(12);
      expect(result.hasMore).toBe(false);
    });

    it('hasMore=true when one more than limit exists', () => {
      const result = messageRepository.listMessagesPage('conv_p', { limit: 11 });

      expect(result.messages).toHaveLength(11);
      expect(result.hasMore).toBe(true);
    });
  });

  // ── 分页去重 (cross-page dedup) ────────────────────────────────────────
  describe('cross-page dedup', () => {
    it('messages from older page do not duplicate when re-fetched in initial page', () => {
      // Fetch older page that overlaps with the initial page range
      // beforeTime covers all 12 messages, limit 9 returns m4-m12
      const olderPage = messageRepository.listMessagesPage('conv_p', {
        limit: 9,
        beforeTime: '2024-07-13T10:00:00.000Z',
      });
      expect(olderPage.messages).toHaveLength(9);

      // Fetch initial page — most recent 5: m8-m12
      const initialPage = messageRepository.listMessagesPage('conv_p', { limit: 5 });
      expect(initialPage.messages).toHaveLength(5);

      // The overlap region (m8-m12) should appear in both pages
      const olderIds = new Set(olderPage.messages.map((m) => m.id));
      const initialIds = initialPage.messages.map((m) => m.id);
      const overlap = initialIds.filter((id) => olderIds.has(id));
      expect(overlap.length).toBeGreaterThan(0);
      // But no duplicates within the initial page
      expect(new Set(initialIds).size).toBe(initialIds.length);
    });

    it('stabilises sort when multiple messages share the same sendTime', () => {
      messageRepository.upsertMessages('conv_tie', [
        makeMessage('t_c', '2024-08-01T12:00:00Z', 'conv_tie'),
        makeMessage('t_a', '2024-08-01T12:00:00Z', 'conv_tie'),
        makeMessage('t_b', '2024-08-01T12:00:00Z', 'conv_tie'),
      ]);

      const result = messageRepository.listMessagesPage('conv_tie', { limit: 10 });
      expect(result.messages.map((m) => m.id)).toEqual(['t_a', 't_b', 't_c']);
    });
  });

  // ── conversationId 隔离 ────────────────────────────────────────────────
  describe('conversation isolation', () => {
    it('does not leak messages across conversations', () => {
      messageRepository.upsertMessages('conv_other', [
        makeMessage('o1', '2024-07-01T10:00:00Z', 'conv_other'),
      ]);

      const resultP = messageRepository.listMessagesPage('conv_p', { limit: 100 });
      const resultO = messageRepository.listMessagesPage('conv_other', { limit: 100 });

      expect(resultP.messages.every((m) => m.conversationId === 'conv_p')).toBe(true);
      expect(resultO.messages.every((m) => m.conversationId === 'conv_other')).toBe(true);
    });
  });
});
