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
});
