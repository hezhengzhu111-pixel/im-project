import { pendingMessageRepository } from '../pendingMessageRepository';
import {
  __setDbForTests,
  __resetForTests,
} from '../messageDatabase';
import { createFakeDb, FakeDbConnection } from '../__testutils__/fakeDbConnection';
import type { PendingMessage } from '@/types/models';

function makePending(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    localId: 'local-1',
    conversationId: 'conv-1',
    sendType: 'private',
    payloadJson: JSON.stringify({ data: { clientMessageId: 'client-1', content: 'hello' } }),
    status: 'pending',
    retryCount: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('pendingMessageRepository', () => {
  let fake: FakeDbConnection;

  beforeEach(() => {
    __resetForTests();
    fake = createFakeDb();
    __setDbForTests(fake);
  });

  afterEach(() => {
    __resetForTests();
  });

  describe('enqueue', () => {
    it('writes clientMessageId from item.clientMessageId when present', () => {
      const item = makePending({ clientMessageId: 'direct-id' });

      pendingMessageRepository.enqueue(item);

      const rows = fake.getTableRows('mobile_pending_messages');
      expect(rows).toHaveLength(1);
      expect(rows[0].clientMessageId).toBe('direct-id');
    });

    it('writes clientMessageId from payloadJson.data.clientMessageId when item has none', () => {
      const item = makePending();

      pendingMessageRepository.enqueue(item);

      const rows = fake.getTableRows('mobile_pending_messages');
      expect(rows).toHaveLength(1);
      expect(rows[0].clientMessageId).toBe('client-1');
    });

    it('writes null clientMessageId when neither source has one', () => {
      const item = makePending({
        clientMessageId: undefined,
        payloadJson: JSON.stringify({ data: {} }),
      });

      pendingMessageRepository.enqueue(item);

      const rows = fake.getTableRows('mobile_pending_messages');
      expect(rows).toHaveLength(1);
      expect(rows[0].clientMessageId).toBeNull();
    });

    it('includes clientMessageId column in INSERT statement', () => {
      const item = makePending({ clientMessageId: 'test-id' });

      pendingMessageRepository.enqueue(item);

      const insertSql = fake.executedSql.find((s) => s.includes('INSERT'));
      expect(insertSql).toContain('clientMessageId');
    });
  });

  describe('findByClientMessageId', () => {
    it('finds pending by clientMessageId column directly', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: 'target-id', status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 2000 },
      ]);

      const result = pendingMessageRepository.findByClientMessageId('target-id');

      expect(result).toBeDefined();
      expect(result?.localId).toBe('local-1');
      expect(result?.clientMessageId).toBe('target-id');
    });

    it('returns undefined for empty clientMessageId', () => {
      const result = pendingMessageRepository.findByClientMessageId('  ');

      expect(result).toBeUndefined();
    });

    it('returns undefined when no matching pending exists', () => {
      // 使用空表确保没有匹配
      fake.seedTable('mobile_pending_messages', []);

      const result = pendingMessageRepository.findByClientMessageId('nonexistent');

      expect(result).toBeUndefined();
    });

    it('fallback: finds by parsing payloadJson when clientMessageId column is null', () => {
      fake.seedTable('mobile_pending_messages', [
        {
          localId: 'local-old',
          conversationId: 'conv-1',
          sendType: 'private',
          payloadJson: JSON.stringify({ data: { clientMessageId: 'legacy-id' } }),
          clientMessageId: null,
          status: 'pending',
          retryCount: 0,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]);

      const result = pendingMessageRepository.findByClientMessageId('legacy-id');

      expect(result).toBeDefined();
      expect(result?.localId).toBe('local-old');
    });

    it('prefers direct column match over payloadJson fallback', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-direct', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: 'same-id', status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 2000 },
        {
          localId: 'local-legacy',
          conversationId: 'conv-1',
          sendType: 'private',
          payloadJson: JSON.stringify({ data: { clientMessageId: 'same-id' } }),
          clientMessageId: null,
          status: 'pending',
          retryCount: 0,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]);

      const result = pendingMessageRepository.findByClientMessageId('same-id');

      expect(result).toBeDefined();
      expect(result?.localId).toBe('local-direct');
    });
  });

  describe('removeByClientMessageId', () => {
    it('calls remove with localId found by findByClientMessageId', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: 'target-id', status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
      ]);

      const removeSpy = jest.spyOn(pendingMessageRepository, 'remove');

      pendingMessageRepository.removeByClientMessageId('target-id');

      expect(removeSpy).toHaveBeenCalledWith('local-1');
      removeSpy.mockRestore();
    });

    it('does nothing when clientMessageId not found', () => {
      // 空表确保 findByClientMessageId 返回 undefined
      fake.seedTable('mobile_pending_messages', []);

      const removeSpy = jest.spyOn(pendingMessageRepository, 'remove');

      pendingMessageRepository.removeByClientMessageId('nonexistent');

      expect(removeSpy).not.toHaveBeenCalled();
      removeSpy.mockRestore();
    });
  });

  describe('normalize', () => {
    it('maps clientMessageId from row', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: 'mapped-id', status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
      ]);

      const rows = pendingMessageRepository.listAll();

      expect(rows[0].clientMessageId).toBe('mapped-id');
    });

    it('sets clientMessageId to undefined when row has null', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
      ]);

      const rows = pendingMessageRepository.listAll();

      expect(rows[0].clientMessageId).toBeUndefined();
    });
  });

  describe('listReady', () => {
    it('returns only pending and sending status messages', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'sending', retryCount: 0, createdAt: 2000, updatedAt: 2000 },
        { localId: 'local-3', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'sent', retryCount: 0, createdAt: 3000, updatedAt: 3000 },
        { localId: 'local-4', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'failed', retryCount: 0, createdAt: 4000, updatedAt: 4000 },
      ]);

      const ready = pendingMessageRepository.listReady(5000);

      expect(ready).toHaveLength(2);
      expect(ready.map((m) => m.localId)).toContain('local-1');
      expect(ready.map((m) => m.localId)).toContain('local-2');
    });

    it('excludes messages with nextRetryAt in the future', () => {
      const now = 5000;
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000, nextRetryAt: null },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 1, createdAt: 2000, updatedAt: 2000, nextRetryAt: 3000 },
        { localId: 'local-3', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 2, createdAt: 3000, updatedAt: 3000, nextRetryAt: 6000 },
      ]);

      const ready = pendingMessageRepository.listReady(now);

      expect(ready).toHaveLength(2);
      expect(ready.map((m) => m.localId)).toContain('local-1');
      expect(ready.map((m) => m.localId)).toContain('local-2');
      expect(ready.map((m) => m.localId)).not.toContain('local-3');
    });

    it('includes messages with nextRetryAt in the past', () => {
      const now = 5000;
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 1, createdAt: 1000, updatedAt: 1000, nextRetryAt: 4000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 2, createdAt: 2000, updatedAt: 2000, nextRetryAt: 5000 },
      ]);

      const ready = pendingMessageRepository.listReady(now);

      expect(ready).toHaveLength(2);
    });

    it('includes messages with nextRetryAt equal to now', () => {
      const now = 5000;
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 1, createdAt: 1000, updatedAt: 1000, nextRetryAt: 5000 },
      ]);

      const ready = pendingMessageRepository.listReady(now);

      expect(ready).toHaveLength(1);
      expect(ready[0].localId).toBe('local-1');
    });

    it('uses Date.now() when now parameter is not provided', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000, nextRetryAt: null },
      ]);

      const ready = pendingMessageRepository.listReady();

      expect(ready).toHaveLength(1);
    });

    it('returns empty array when no messages are ready', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'sent', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 1, createdAt: 2000, updatedAt: 2000, nextRetryAt: 999999 },
      ]);

      const ready = pendingMessageRepository.listReady(1000);

      expect(ready).toHaveLength(0);
    });
  });

  describe('listAll', () => {
    it('returns all messages sorted by createdAt ascending', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-3', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 3000, updatedAt: 3000 },
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 2000, updatedAt: 2000 },
      ]);

      const all = pendingMessageRepository.listAll();

      expect(all).toHaveLength(3);
      // ORDER BY createdAt ASC
      expect(all[0].localId).toBe('local-1');
      expect(all[1].localId).toBe('local-2');
      expect(all[2].localId).toBe('local-3');
    });
  });

  describe('countAll', () => {
    it('returns correct count', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 2000, updatedAt: 2000 },
      ]);

      expect(pendingMessageRepository.countAll()).toBe(2);
    });

    it('returns 0 for empty table', () => {
      fake.seedTable('mobile_pending_messages', []);

      expect(pendingMessageRepository.countAll()).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all messages', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 2000, updatedAt: 2000 },
      ]);

      pendingMessageRepository.clear();

      expect(pendingMessageRepository.countAll()).toBe(0);
      expect(fake.executedSql.some((s) => s.toUpperCase().includes('DELETE FROM MOBILE_PENDING_MESSAGES'))).toBe(true);
    });
  });
});
