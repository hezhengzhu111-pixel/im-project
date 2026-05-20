import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import {
  cachePendingEncryptedMessage,
  clearAllPendingEncryptedMessages,
  configurePendingDecryptQueue,
  getPendingEncryptedMessages,
  getReadyPendingEncryptedMessages,
  listPendingEncryptedSessionIds,
  replacePendingEncryptedMessages,
  restorePendingEncryptedMessagesFromRepository,
  retryAllPendingEncryptedMessages,
  retryDecryptPendingMessages,
  setPendingEntries,
  type PendingEncryptedMessageEntry,
} from '@/e2ee/store/pendingDecryptStore';
import { E2EE_DECRYPT_RETRY_CONFIG } from '@/constants/config';
import { messageRepository } from '@/services/storage/messageRepository';
import { __resetForTests as resetMessageDatabaseForTests } from '@/services/storage/messageDatabase';
import { clearCurrentE2eeAccountState } from '@/e2ee/clearE2eeState';
import type { MobileMessage } from '@/types/models';

const envelope = {
  version: 2 as const,
  algorithm: 'rust-x25519-x3dh-dr-v1' as const,
  senderDeviceId: 'device-200',
  recipientDeviceId: 'device-100',
  sessionId: '100_200',
  handshake: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  wire: 'AQID',
};

const encryptedMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'msg-pending-1',
  messageId: 'msg-pending-1',
  conversationId: '100_200',
  senderId: '200',
  receiverId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'ciphertext-or-plaintext-must-not-leak',
  encrypted: true,
  e2eeEnvelope: envelope,
  decryptStatus: 'pending',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

describe('pending decrypt runtime queue recovery', () => {
  beforeEach(() => {
    resetMessageDatabaseForTests();
    clearAllPendingEncryptedMessages();
    configurePendingDecryptQueue({
      retryPendingMessages: async () => [],
      retryVisibleMessages: async () => 0,
    });
  });

  it('restores pending encrypted messages from messageRepository after runtime queue reset', () => {
    messageRepository.upsertMessages('100_200', [encryptedMessage()]);
    clearAllPendingEncryptedMessages();

    expect(restorePendingEncryptedMessagesFromRepository()).toBe(1);

    const restored = getPendingEncryptedMessages('100_200');
    expect(restored).toHaveLength(1);
    expect(restored[0]?.e2eeEnvelope).toMatchObject({ wire: 'AQID' });
  });

  it('clears runtime pending entry after successful decrypt retry', async () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());
    configurePendingDecryptQueue({
      retryPendingMessages: async () => {
        clearAllPendingEncryptedMessages();
        return [];
      },
      retryVisibleMessages: async () => 0,
    });

    await expect(retryDecryptPendingMessages('100_200')).resolves.toBe(1);
    expect(getPendingEncryptedMessages('100_200')).toHaveLength(0);
  });

  it('clear session cleanup removes current runtime pending entries', async () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    await clearCurrentE2eeAccountState();

    expect(getPendingEncryptedMessages('100_200')).toHaveLength(0);
  });

  it('does not retain plaintext content in pending encrypted rawJson', () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage({ content: 'local plaintext secret' }));

    const [pending] = getPendingEncryptedMessages('100_200');

    expect(pending?.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(pending?.rawJson).not.toContain('local plaintext secret');
    expect(pending?.rawJson).toContain('e2eeEnvelope');
  });
});

// ─── Retry metadata and scheduling tests ─────────────────────────────

describe('pending decrypt retry metadata', () => {
  beforeEach(() => {
    resetMessageDatabaseForTests();
    clearAllPendingEncryptedMessages();
    configurePendingDecryptQueue({
      retryPendingMessages: async () => [],
      retryVisibleMessages: async () => 0,
    });
  });

  // Test 1: new entry has retryCount=0 and no nextRetryAt
  it('creates new pending entry with retryCount=0', () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    const ready = getReadyPendingEncryptedMessages('100_200', Date.now());
    expect(ready).toHaveLength(1);
    expect(ready[0].retryCount).toBe(0);
    expect(ready[0].nextRetryAt).toBeUndefined();
    expect(ready[0].lastError).toBeUndefined();
    expect(ready[0].lastTriedAt).toBeUndefined();
  });

  // Test 3: nextRetryAt not reached → getReadyPendingEncryptedMessages excludes it
  it('excludes entries whose nextRetryAt has not been reached', () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    // Simulate an entry with nextRetryAt in the future
    const futureTime = Date.now() + 60_000;
    const allEntries = getReadyPendingEncryptedMessages('100_200', Date.now());
    const entry = allEntries[0];
    const futureEntry: PendingEncryptedMessageEntry = {
      ...entry,
      retryCount: 1,
      nextRetryAt: futureTime,
      lastError: 'test error',
      lastTriedAt: Date.now(),
    };
    setPendingEntries('100_200', [futureEntry]);

    // Now check ready entries: the future one should be excluded
    const now = futureTime - 1;
    const ready = getReadyPendingEncryptedMessages('100_200', now);
    expect(ready).toHaveLength(0);
  });

  // Test 4: nextRetryAt reached → getReadyPendingEncryptedMessages includes it
  it('includes entries whose nextRetryAt has been reached', () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    const pastTime = Date.now() - 1_000;
    const allEntries = getReadyPendingEncryptedMessages('100_200', Date.now());
    const entry = allEntries[0];
    const pastEntry: PendingEncryptedMessageEntry = {
      ...entry,
      retryCount: 2,
      nextRetryAt: pastTime,
      lastError: 'test error',
      lastTriedAt: Date.now() - 10_000,
    };
    setPendingEntries('100_200', [pastEntry]);

    const ready = getReadyPendingEncryptedMessages('100_200', Date.now());
    expect(ready).toHaveLength(1);
    expect(ready[0].retryCount).toBe(2);
  });

  // Test 9: decrypted entry removed from queue
  it('removes entry from queue after successful decrypt (handler returns no remaining)', async () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    // Handler returns empty array → all decrypted, none remaining
    configurePendingDecryptQueue({
      retryPendingMessages: async () => [],
      retryVisibleMessages: async () => 0,
    });

    await retryDecryptPendingMessages('100_200');

    expect(getPendingEncryptedMessages('100_200')).toHaveLength(0);
  });

  // Test: cachePendingEncryptedMessage preserves retry metadata for existing entry
  it('preserves retry metadata when re-caching the same message with unchanged envelope', () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    // Manually set retry metadata on the entry
    const ready = getReadyPendingEncryptedMessages('100_200', Date.now());
    const updated: PendingEncryptedMessageEntry = {
      ...ready[0],
      retryCount: 3,
      nextRetryAt: Date.now() + 30_000,
      lastError: 'previous error',
      lastTriedAt: Date.now(),
    };
    setPendingEntries('100_200', [updated]);

    // Re-cache the same message (same envelope)
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    // nextRetryAt is in the future, so getReady filters it out with current time.
    // Verify with a future timestamp that the retry metadata is preserved.
    const after = getReadyPendingEncryptedMessages('100_200', Date.now());
    expect(after).toHaveLength(0);

    const allAfter = getReadyPendingEncryptedMessages('100_200', Date.now() + 60_000);
    expect(allAfter).toHaveLength(1);
    expect(allAfter[0].retryCount).toBe(3);
    expect(allAfter[0].lastError).toBe('previous error');
  });

  // Test: cachePendingEncryptedMessage resets retryCount when envelope changes
  it('resets retry metadata when envelope content changes', () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    const ready = getReadyPendingEncryptedMessages('100_200', Date.now());
    const updated: PendingEncryptedMessageEntry = {
      ...ready[0],
      retryCount: 3,
      nextRetryAt: Date.now() + 30_000,
      lastError: 'previous error',
      lastTriedAt: Date.now(),
    };
    setPendingEntries('100_200', [updated]);

    // Re-cache with a different envelope (handshake added)
    const newEnvelope = { ...envelope, handshake: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==' };
    cachePendingEncryptedMessage('100_200', encryptedMessage({ e2eeEnvelope: newEnvelope }));

    const allAfter = getReadyPendingEncryptedMessages('100_200', Date.now());
    expect(allAfter).toHaveLength(1);
    expect(allAfter[0].retryCount).toBe(0);
    expect(allAfter[0].nextRetryAt).toBeUndefined();
    expect(allAfter[0].lastError).toBeUndefined();
  });
});

// ─── Batch limit tests ───────────────────────────────────────────────

describe('pending decrypt batch limits', () => {
  beforeEach(() => {
    resetMessageDatabaseForTests();
    clearAllPendingEncryptedMessages();
  });

  // Test 7: retryAllPendingEncryptedMessages does not process unlimited entries per session
  it('limits retryAllPendingEncryptedMessages to maxPerSession entries per session', async () => {
    // Create maxPerSession + 5 ready entries for one session
    const totalMessages = E2EE_DECRYPT_RETRY_CONFIG.maxPerSession + 5;
    for (let i = 0; i < totalMessages; i++) {
      cachePendingEncryptedMessage('100_200', encryptedMessage({
        id: `msg-${i}`,
        messageId: `msg-${i}`,
      }));
    }

    let processedCount = 0;
    configurePendingDecryptQueue({
      retryPendingMessages: async (_sessionId, entries) => {
        processedCount = entries.length;
        return [];
      },
      retryVisibleMessages: async () => 0,
    });

    await retryAllPendingEncryptedMessages();

    expect(processedCount).toBeLessThanOrEqual(E2EE_DECRYPT_RETRY_CONFIG.maxPerSession);
    expect(processedCount).toBe(E2EE_DECRYPT_RETRY_CONFIG.maxPerSession);
  });

  // Test: retryAllPendingEncryptedMessages respects maxGlobal limit
  it('stops processing when maxGlobal limit is reached across sessions', async () => {
    // Create multiple sessions with many entries each
    const sessions = ['100_200', '100_300', '100_400', '100_500', '100_600'];
    let totalProcessed = 0;

    configurePendingDecryptQueue({
      retryPendingMessages: async (_sessionId, entries) => {
        totalProcessed += entries.length;
        return [];
      },
      retryVisibleMessages: async () => 0,
    });

    // Create 30 entries per session (5 sessions × 30 = 150, exceeding maxGlobal=100)
    for (const sid of sessions) {
      for (let i = 0; i < 30; i++) {
        cachePendingEncryptedMessage(sid, encryptedMessage({
          id: `msg-${sid}-${i}`,
          messageId: `msg-${sid}-${i}`,
        }));
      }
    }

    await retryAllPendingEncryptedMessages();

    expect(totalProcessed).toBeLessThanOrEqual(E2EE_DECRYPT_RETRY_CONFIG.maxGlobal);
  });

  // Test: retryAllPendingEncryptedMessages only processes ready entries
  it('skips sessions with no ready entries', async () => {
    // Cache a message for session 100_200
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    // Set nextRetryAt far in the future so it's not ready
    const ready = getReadyPendingEncryptedMessages('100_200', Date.now());
    const futureEntry: PendingEncryptedMessageEntry = {
      ...ready[0],
      retryCount: 1,
      nextRetryAt: Date.now() + 3600_000,
    };
    setPendingEntries('100_200', [futureEntry]);

    let processedCount = 0;
    configurePendingDecryptQueue({
      retryPendingMessages: async (_sessionId, entries) => {
        processedCount += entries.length;
        return [];
      },
      retryVisibleMessages: async () => 0,
    });

    await retryAllPendingEncryptedMessages();
    expect(processedCount).toBe(0);
  });
});

// ─── Repository restore tests ────────────────────────────────────────

describe('restorePendingEncryptedMessagesFromRepository', () => {
  beforeEach(() => {
    resetMessageDatabaseForTests();
    clearAllPendingEncryptedMessages();
    configurePendingDecryptQueue({
      retryPendingMessages: async () => [],
      retryVisibleMessages: async () => 0,
    });
  });

  // Test 8: does not restore failed messages
  it('does not restore messages with decryptStatus=failed', () => {
    const failedMessage = encryptedMessage({ decryptStatus: 'failed' });
    messageRepository.upsertMessages('100_200', [failedMessage]);

    const restored = restorePendingEncryptedMessagesFromRepository();
    expect(restored).toBe(0);

    const pending = getPendingEncryptedMessages('100_200');
    expect(pending).toHaveLength(0);
  });

  it('restores messages with decryptStatus=pending', () => {
    const pendingMessage = encryptedMessage({ decryptStatus: 'pending' });
    messageRepository.upsertMessages('100_200', [pendingMessage]);

    const restored = restorePendingEncryptedMessagesFromRepository();
    expect(restored).toBe(1);

    const pending = getPendingEncryptedMessages('100_200');
    expect(pending).toHaveLength(1);
  });

  it('restores messages that were persisted after decrypt (sanitizeE2eeMessageForPersist resets decryptStatus)', () => {
    // sanitizeE2eeMessageForPersist resets decryptStatus to 'pending' for all
    // non-failed encrypted messages. This means a previously-decrypted message
    // (decryptStatus='decrypted') becomes 'pending' after persist and WILL be
    // restored. This is a known behavior: the restored message will be
    // re-processed through processE2eeMessage and likely decrypted again.
    const decryptedMessage = encryptedMessage({
      decryptStatus: 'decrypted',
      isE2eeDisplayDecrypted: true,
      content: 'hello',
    });
    messageRepository.upsertMessages('100_200', [decryptedMessage]);

    const restored = restorePendingEncryptedMessagesFromRepository();
    // After sanitizeE2eeMessageForPersist, decryptStatus becomes 'pending',
    // so listPendingEncryptedMessages includes it.
    expect(restored).toBe(1);

    const pending = getPendingEncryptedMessages('100_200');
    expect(pending).toHaveLength(1);
  });
});

// ─── replacePendingEncryptedMessages metadata preservation ───────────

describe('replacePendingEncryptedMessages preserves retry metadata', () => {
  beforeEach(() => {
    resetMessageDatabaseForTests();
    clearAllPendingEncryptedMessages();
  });

  it('preserves retry metadata for messages that stay in the queue', () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    // Set retry metadata
    const ready = getReadyPendingEncryptedMessages('100_200', Date.now());
    const entry: PendingEncryptedMessageEntry = {
      ...ready[0],
      retryCount: 2,
      nextRetryAt: Date.now() + 60_000,
      lastError: 'session state unavailable',
      lastTriedAt: Date.now() - 5_000,
    };
    setPendingEntries('100_200', [entry]);

    // Replace with the same message (simulating handler returning remaining messages)
    replacePendingEncryptedMessages('100_200', [encryptedMessage()]);

    const allAfter = getReadyPendingEncryptedMessages('100_200', Date.now() + 120_000);
    expect(allAfter[0].retryCount).toBe(2);
    expect(allAfter[0].lastError).toBe('session state unavailable');
  });
});
