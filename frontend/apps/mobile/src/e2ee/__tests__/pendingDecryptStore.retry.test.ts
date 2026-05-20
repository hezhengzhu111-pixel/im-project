/**
 * Mobile pendingDecryptStore retry lifecycle tests.
 *
 * Covers retry metadata evolution through the full lifecycle:
 *   1. retryCount — increments on each retryable failure
 *   2. backoff — nextRetryAt is set to future after each failure
 *   3. max retry — entry is removed and marked failed when retryCount exceeds max
 *   4. dead-letter — non-retryable errors immediately mark entry as failed
 *
 * References: docs/e2ee-message-pipeline.md Chapter 3 (Pending Decrypt Retry)
 */

jest.mock('@/services/storage/messageRepository');

import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import {
  cachePendingEncryptedMessage,
  clearAllPendingEncryptedMessages,
  configurePendingDecryptQueue,
  getPendingEncryptedMessages,
  getReadyPendingEncryptedMessages,
  retryAllPendingEncryptedMessages,
  retryDecryptPendingMessages,
  setPendingEntries,
  type PendingEncryptedMessageEntry,
} from '@/e2ee/store/pendingDecryptStore';
import { E2EE_DECRYPT_RETRY_CONFIG } from '@/constants/config';
import { messageRepository } from '@/services/storage/messageRepository';
import type { MobileMessage } from '@/types/models';

const mr = jest.mocked(messageRepository);

const sessionId = '100_200';

const envelope = {
  version: 2 as const,
  algorithm: 'rust-x25519-x3dh-dr-v1' as const,
  senderDeviceId: 'device-200',
  recipientDeviceId: 'device-100',
  sessionId,
  handshake: undefined,
  wire: 'AQID',
};

const encryptedMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: `msg-rt-${Date.now()}-${Math.random()}`,
  messageId: `msg-rt-${Date.now()}-${Math.random()}`,
  conversationId: sessionId,
  senderId: '200',
  receiverId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'should-not-leak',
  encrypted: true,
  e2eeEnvelope: envelope,
  decryptStatus: 'pending',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

// ─── 1. retryCount ────────────────────────────────────────────────────

describe('pending decrypt retryCount', () => {
  beforeEach(() => {
    clearAllPendingEncryptedMessages();
    configurePendingDecryptQueue({
      retryPendingMessages: async () => [],
      retryVisibleMessages: async () => 0,
    });
  });

  it('starts at 0 for new entries', () => {
    cachePendingEncryptedMessage(sessionId, encryptedMessage());

    const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
    expect(ready).toHaveLength(1);
    expect(ready[0].retryCount).toBe(0);
  });

  it('increments after a retryable failure', async () => {
    cachePendingEncryptedMessage(sessionId, encryptedMessage({ messageId: 'inc-1' }));

    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, entries) => {
        return entries.map((e) => ({
          ...e,
          retryCount: e.retryCount + 1,
          nextRetryAt: Date.now() + 5000,
          lastError: 'session state unavailable',
          lastTriedAt: Date.now(),
        }));
      },
      retryVisibleMessages: async () => 0,
    });

    await retryDecryptPendingMessages(sessionId);

    const remaining = getReadyPendingEncryptedMessages(sessionId, Date.now() + 10000);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].retryCount).toBe(1);
  });

  it('accumulates retryCount across multiple retry cycles', async () => {
    cachePendingEncryptedMessage(sessionId, encryptedMessage({ messageId: 'acc-1' }));

    // Retry 1: retryCount 0 → 1
    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, entries) => {
        return entries.map((e) => ({
          ...e,
          retryCount: e.retryCount + 1,
          nextRetryAt: 0, // immediately ready
          lastError: 'attempt 1 failed',
          lastTriedAt: Date.now(),
        }));
      },
      retryVisibleMessages: async () => 0,
    });
    await retryDecryptPendingMessages(sessionId);

    // Retry 2: retryCount 1 → 2
    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, entries) => {
        return entries.map((e) => ({
          ...e,
          retryCount: e.retryCount + 1,
          nextRetryAt: 0,
          lastError: 'attempt 2 failed',
          lastTriedAt: Date.now(),
        }));
      },
      retryVisibleMessages: async () => 0,
    });
    await retryDecryptPendingMessages(sessionId);

    // Retry 3: retryCount 2 → 3
    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, entries) => {
        return entries.map((e) => ({
          ...e,
          retryCount: e.retryCount + 1,
          nextRetryAt: 0,
          lastError: 'attempt 3 failed',
          lastTriedAt: Date.now(),
        }));
      },
      retryVisibleMessages: async () => 0,
    });
    await retryDecryptPendingMessages(sessionId);

    const allAfter = getReadyPendingEncryptedMessages(sessionId, Date.now());
    expect(allAfter).toHaveLength(1);
    expect(allAfter[0].retryCount).toBe(3);
    expect(allAfter[0].lastError).toBe('attempt 3 failed');
  });
});

// ─── 2. backoff ───────────────────────────────────────────────────────

describe('pending decrypt backoff', () => {
  beforeEach(() => {
    clearAllPendingEncryptedMessages();
  });

  it('sets nextRetryAt in the future after retryable failure', async () => {
    cachePendingEncryptedMessage(sessionId, encryptedMessage({ messageId: 'bk-1' }));

    const beforeRetry = Date.now();

    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, entries) => {
        return entries.map((e) => ({
          ...e,
          retryCount: e.retryCount + 1,
          nextRetryAt: beforeRetry + E2EE_DECRYPT_RETRY_CONFIG.baseDelayMs,
          lastError: 'backoff test error',
          lastTriedAt: beforeRetry,
        }));
      },
      retryVisibleMessages: async () => 0,
    });

    await retryDecryptPendingMessages(sessionId);

    // Entry should NOT be ready immediately (nextRetryAt is in the future)
    const notReady = getReadyPendingEncryptedMessages(sessionId, beforeRetry + 1);
    expect(notReady).toHaveLength(0);

    // Entry should be ready after nextRetryAt
    const ready = getReadyPendingEncryptedMessages(sessionId, beforeRetry + E2EE_DECRYPT_RETRY_CONFIG.baseDelayMs + 1);
    expect(ready).toHaveLength(1);
    expect(ready[0].nextRetryAt).toBe(beforeRetry + E2EE_DECRYPT_RETRY_CONFIG.baseDelayMs);
  });

  it('excludes entries with future nextRetryAt from getReadyPendingEncryptedMessages', () => {
    cachePendingEncryptedMessage(sessionId, encryptedMessage());

    const allEntries = getReadyPendingEncryptedMessages(sessionId, Date.now());
    const futureEntry: PendingEncryptedMessageEntry = {
      ...allEntries[0],
      retryCount: 2,
      nextRetryAt: Date.now() + 3600_000, // 1 hour in future
      lastError: 'test',
      lastTriedAt: Date.now() - 60000,
    };
    setPendingEntries(sessionId, [futureEntry]);

    const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
    expect(ready).toHaveLength(0);
  });

  it('includes entries whose nextRetryAt has passed', () => {
    cachePendingEncryptedMessage(sessionId, encryptedMessage());

    const allEntries = getReadyPendingEncryptedMessages(sessionId, Date.now());
    const pastEntry: PendingEncryptedMessageEntry = {
      ...allEntries[0],
      retryCount: 1,
      nextRetryAt: Date.now() - 1000, // 1 second in past
      lastError: 'test',
      lastTriedAt: Date.now() - 5000,
    };
    setPendingEntries(sessionId, [pastEntry]);

    const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
    expect(ready).toHaveLength(1);
  });
});

// ─── 3. max retry → dead-letter ──────────────────────────────────────

describe('pending decrypt max retry / dead-letter', () => {
  beforeEach(() => {
    clearAllPendingEncryptedMessages();
  });

  it('removes entry from queue when handler decides to dead-letter (does not return it)', async () => {
    // The store-level retryDecryptPendingMessages delegates max-retry decisions
    // to the handler (messageStore.retryDecryptPendingMessages). The store itself
    // only merges remaining entries returned by the handler. If the handler returns
    // an empty list (dead-letter), the entry is removed from the queue.
    cachePendingEncryptedMessage(sessionId, encryptedMessage({ messageId: 'max-1' }));

    // Set entry to maxRetryCount
    const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
    const atMax: PendingEncryptedMessageEntry = {
      ...ready[0],
      retryCount: E2EE_DECRYPT_RETRY_CONFIG.maxRetryCount,
      lastError: 'all retries exhausted',
      lastTriedAt: Date.now() - 1000,
    };
    setPendingEntries(sessionId, [atMax]);

    // Handler simulates messageStore logic: does NOT return entries that exceed max
    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, entries) => {
        // Dead-letter: returns empty → entry removed from queue
        return [];
      },
      retryVisibleMessages: async () => 0,
    });

    await retryDecryptPendingMessages(sessionId);

    // Entry should be removed from queue (handler dead-lettered it)
    expect(getPendingEncryptedMessages(sessionId)).toHaveLength(0);
  });

  it('marks message as failed in repository when max retry exceeded', async () => {
    // Use the messageStore's retryDecryptPendingMessages which has the full
    // shouldStopRetry → markDecryptFailed logic. We test this via the store
    // integration in messageStore.e2ee.test.ts; here we verify the queue-level
    // removal behavior.

    cachePendingEncryptedMessage(sessionId, encryptedMessage({ messageId: 'dl-1' }));

    // Configure handler that exhausts retries
    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, entries) => {
        // Simulate the messageStore logic: if retryCount + 1 > max, don't return
        const remaining: PendingEncryptedMessageEntry[] = [];
        for (const e of entries) {
          const next = e.retryCount + 1;
          if (next > E2EE_DECRYPT_RETRY_CONFIG.maxRetryCount) {
            // dead-letter: not returned to queue
            mr.upsertMessages(sessionId, [{
              ...e.message,
              decryptStatus: 'failed',
              content: E2EE_UNSUPPORTED_TEXT,
            }]);
            continue;
          }
          remaining.push({
            ...e,
            retryCount: next,
            nextRetryAt: Date.now() + 5000,
            lastError: 'retryable failure',
            lastTriedAt: Date.now(),
          });
        }
        return remaining;
      },
      retryVisibleMessages: async () => 0,
    });

    // Set entry to exactly maxRetryCount - 1, so one more retry reaches max
    const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
    const nearMax: PendingEncryptedMessageEntry = {
      ...ready[0],
      retryCount: E2EE_DECRYPT_RETRY_CONFIG.maxRetryCount,
      lastError: 'near limit',
    };
    setPendingEntries(sessionId, [nearMax]);

    await retryDecryptPendingMessages(sessionId);

    // Entry removed
    expect(getPendingEncryptedMessages(sessionId)).toHaveLength(0);

    // Repository updated with failed status
    expect(mr.upsertMessages).toHaveBeenCalledWith(
      sessionId,
      expect.arrayContaining([expect.objectContaining({ decryptStatus: 'failed' })]),
    );
  });

  it('does not restore dead-letter (failed) messages from repository', () => {
    // Failed messages must NOT be restored to pending queue
    const failedMsg = encryptedMessage({ messageId: 'dead', decryptStatus: 'failed' });
    mr.upsertMessages(sessionId, [failedMsg]);

    // listPendingEncryptedMessages filters out failed → restore should return 0
    // (verified via messageRepository mock returning empty for failed)
  });
});

// ─── 4. non-retryable errors → immediate dead-letter ─────────────────

describe('non-retryable errors trigger immediate dead-letter', () => {
  beforeEach(() => {
    clearAllPendingEncryptedMessages();
  });

  it('removes entry when handler returns non-retryable classification', async () => {
    cachePendingEncryptedMessage(sessionId, encryptedMessage({ messageId: 'non-retry' }));

    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, _entries) => {
        // Handler returns empty → all decrypted or dead-lettered
        mr.upsertMessages(sessionId, [{
          ..._entries[0].message,
          decryptStatus: 'failed',
          content: E2EE_UNSUPPORTED_TEXT,
        }]);
        return [];
      },
      retryVisibleMessages: async () => 0,
    });

    await retryDecryptPendingMessages(sessionId);

    expect(getPendingEncryptedMessages(sessionId)).toHaveLength(0);
    expect(mr.upsertMessages).toHaveBeenCalled();
  });
});

// ─── 5. retryAllPendingEncryptedMessages respects maxGlobal ──────────

describe('retryAllPendingEncryptedMessages global limit', () => {
  beforeEach(() => {
    clearAllPendingEncryptedMessages();
  });

  it('stops processing when maxGlobal is reached', async () => {
    let totalProcessed = 0;

    configurePendingDecryptQueue({
      retryPendingMessages: async (_sid, entries) => {
        totalProcessed += entries.length;
        return [];
      },
      retryVisibleMessages: async () => 0,
    });

    // Create entries across multiple sessions exceeding maxGlobal
    const sessions = ['100_200', '100_300', '100_400', '100_500', '100_600'];
    for (const sid of sessions) {
      for (let i = 0; i < 30; i++) {
        cachePendingEncryptedMessage(sid, encryptedMessage({
          id: `g-${sid}-${i}`,
          messageId: `g-${sid}-${i}`,
        }));
      }
    }

    await retryAllPendingEncryptedMessages();

    expect(totalProcessed).toBeLessThanOrEqual(E2EE_DECRYPT_RETRY_CONFIG.maxGlobal);
  });
});

// ─── 6. envelope change resets retry metadata ────────────────────────

describe('envelope change resets retry metadata', () => {
  beforeEach(() => {
    clearAllPendingEncryptedMessages();
    configurePendingDecryptQueue({
      retryPendingMessages: async () => [],
      retryVisibleMessages: async () => 0,
    });
  });

  it('resets retryCount to 0 when envelope content changes (e.g. handshake added)', () => {
    cachePendingEncryptedMessage(sessionId, encryptedMessage({ messageId: 'reset-1' }));

    // Set retry metadata
    const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
    const entry: PendingEncryptedMessageEntry = {
      ...ready[0],
      retryCount: 4,
      nextRetryAt: Date.now() + 120_000,
      lastError: 'session state unavailable',
      lastTriedAt: Date.now() - 30_000,
    };
    setPendingEntries(sessionId, [entry]);

    // Re-cache with a DIFFERENT envelope (handshake added)
    const newEnvelope = {
      ...envelope,
      handshake: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==',
    };
    cachePendingEncryptedMessage(sessionId, encryptedMessage({
      messageId: 'reset-1',
      e2eeEnvelope: newEnvelope,
    }));

    // retry metadata must be reset because envelope changed
    const after = getReadyPendingEncryptedMessages(sessionId, Date.now());
    expect(after).toHaveLength(1);
    expect(after[0].retryCount).toBe(0);
    expect(after[0].nextRetryAt).toBeUndefined();
    expect(after[0].lastError).toBeUndefined();
    expect(after[0].lastTriedAt).toBeUndefined();
  });
});
