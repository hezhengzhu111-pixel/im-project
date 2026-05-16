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

  describe('listByConversation', () => {
    it('returns only messages for the specified conversation', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-A', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-B', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 2000, updatedAt: 2000 },
        { localId: 'local-3', conversationId: 'conv-A', sendType: 'group', payloadJson: '{}', clientMessageId: null, status: 'sending', retryCount: 0, createdAt: 3000, updatedAt: 3000 },
      ]);

      const result = pendingMessageRepository.listByConversation('conv-A');

      expect(result).toHaveLength(2);
      expect(result.map((m) => m.localId)).toContain('local-1');
      expect(result.map((m) => m.localId)).toContain('local-3');
    });

    it('returns empty array when conversation has no messages', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-A', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
      ]);

      const result = pendingMessageRepository.listByConversation('conv-empty');

      expect(result).toHaveLength(0);
    });
  });

  describe('listFailed', () => {
    it('returns only failed messages', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'failed', retryCount: 3, createdAt: 2000, updatedAt: 2000, lastError: 'timeout' },
        { localId: 'local-3', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'sent', retryCount: 0, createdAt: 3000, updatedAt: 3000 },
      ]);

      const result = pendingMessageRepository.listFailed();

      expect(result).toHaveLength(1);
      expect(result[0].localId).toBe('local-2');
      expect(result[0].lastError).toBe('timeout');
    });
  });

  describe('listBlocked', () => {
    it('returns only blocked messages', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'blocked', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 2000, updatedAt: 2000 },
        { localId: 'local-3', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'failed', retryCount: 0, createdAt: 3000, updatedAt: 3000 },
      ]);

      const result = pendingMessageRepository.listBlocked();

      expect(result).toHaveLength(1);
      expect(result[0].localId).toBe('local-1');
    });
  });

  describe('listReadyToSend', () => {
    it('excludes messages with nextRetryAt in the future', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000, nextRetryAt: null },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 1, createdAt: 2000, updatedAt: 2000, nextRetryAt: 9999 },
      ]);

      const ready = pendingMessageRepository.listReadyToSend(5000);

      expect(ready).toHaveLength(1);
      expect(ready[0].localId).toBe('local-1');
    });

    it('includes messages with nextRetryAt=0', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000, nextRetryAt: 0 },
      ]);

      const ready = pendingMessageRepository.listReadyToSend(5000);

      expect(ready).toHaveLength(1);
      expect(ready[0].nextRetryAt).toBe(0);
    });

    it('listReady delegates to listReadyToSend', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
      ]);

      const readyFromAlias = pendingMessageRepository.listReady(5000);
      const readyDirect = pendingMessageRepository.listReadyToSend(5000);

      expect(readyFromAlias).toEqual(readyDirect);
    });
  });

  describe('countByStatus', () => {
    it('returns correct counts for each status', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
        { localId: 'local-2', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 2000, updatedAt: 2000 },
        { localId: 'local-3', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'sending', retryCount: 0, createdAt: 3000, updatedAt: 3000 },
        { localId: 'local-4', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'failed', retryCount: 3, createdAt: 4000, updatedAt: 4000 },
        { localId: 'local-5', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'sent', retryCount: 0, createdAt: 5000, updatedAt: 5000 },
        { localId: 'local-6', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'blocked', retryCount: 0, createdAt: 6000, updatedAt: 6000 },
      ]);

      const counts = pendingMessageRepository.countByStatus();

      expect(counts.pending).toBe(2);
      expect(counts.sending).toBe(1);
      expect(counts.failed).toBe(1);
      expect(counts.sent).toBe(1);
      expect(counts.blocked).toBe(1);
    });

    it('returns zeros for all statuses when table is empty', () => {
      fake.seedTable('mobile_pending_messages', []);

      const counts = pendingMessageRepository.countByStatus();

      expect(counts.pending).toBe(0);
      expect(counts.sending).toBe(0);
      expect(counts.failed).toBe(0);
      expect(counts.sent).toBe(0);
      expect(counts.blocked).toBe(0);
    });
  });

  describe('updateStatus', () => {
    it('updates status without overwriting payloadJson', () => {
      const payload = JSON.stringify({ data: { clientMessageId: 'c1', content: 'original' } });
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: payload, clientMessageId: 'c1', status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
      ]);

      pendingMessageRepository.updateStatus('local-1', { status: 'sending' });

      const updated = pendingMessageRepository.get('local-1');
      expect(updated?.status).toBe('sending');
      expect(updated?.payloadJson).toBe(payload);
    });

    it('updates updatedAt on status change', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
      ]);

      const beforeUpdate = Date.now();
      pendingMessageRepository.updateStatus('local-1', { status: 'failed', lastError: 'network error' });

      const updated = pendingMessageRepository.get('local-1');
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
      expect(updated?.lastError).toBe('network error');
    });

    it('allows updating retryCount and nextRetryAt', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000 },
      ]);

      pendingMessageRepository.updateStatus('local-1', { retryCount: 3, nextRetryAt: 99999 });

      const updated = pendingMessageRepository.get('local-1');
      expect(updated?.retryCount).toBe(3);
      expect(updated?.nextRetryAt).toBe(99999);
    });

    it('does nothing when localId does not exist', () => {
      fake.seedTable('mobile_pending_messages', []);

      pendingMessageRepository.updateStatus('nonexistent', { status: 'failed' });

      expect(pendingMessageRepository.countAll()).toBe(0);
    });
  });

  describe('memory fallback consistency', () => {
    it('listReadyToSend works identically with memory fallback', () => {
      __resetForTests();
      __setDbForTests(null);

      pendingMessageRepository.enqueue(makePending({ localId: 'mem-1', status: 'pending', nextRetryAt: undefined }));
      pendingMessageRepository.enqueue(makePending({ localId: 'mem-2', status: 'sending', nextRetryAt: 0, createdAt: 2000, updatedAt: 2000 }));
      pendingMessageRepository.enqueue(makePending({ localId: 'mem-3', status: 'failed', createdAt: 3000, updatedAt: 3000 }));

      const ready = pendingMessageRepository.listReadyToSend(5000);

      expect(ready).toHaveLength(2);
      expect(ready.map((m) => m.localId)).toContain('mem-1');
      expect(ready.map((m) => m.localId)).toContain('mem-2');
    });

    it('nextRetryAt=0 is preserved through normalize in memory mode', () => {
      __resetForTests();
      __setDbForTests(null);

      pendingMessageRepository.enqueue(makePending({ localId: 'mem-1', status: 'pending', nextRetryAt: 0 }));

      const item = pendingMessageRepository.get('mem-1');
      expect(item?.nextRetryAt).toBe(0);
    });
  });

  describe('normalize nextRetryAt fix', () => {
    it('preserves nextRetryAt=0 instead of treating it as falsy', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000, nextRetryAt: 0 },
      ]);

      const rows = pendingMessageRepository.listAll();

      expect(rows[0].nextRetryAt).toBe(0);
      expect(rows[0].nextRetryAt).not.toBeUndefined();
    });

    it('sets nextRetryAt to undefined when row has null', () => {
      fake.seedTable('mobile_pending_messages', [
        { localId: 'local-1', conversationId: 'conv-1', sendType: 'private', payloadJson: '{}', clientMessageId: null, status: 'pending', retryCount: 0, createdAt: 1000, updatedAt: 1000, nextRetryAt: null },
      ]);

      const rows = pendingMessageRepository.listAll();

      expect(rows[0].nextRetryAt).toBeUndefined();
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
