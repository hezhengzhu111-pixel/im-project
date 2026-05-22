/**
 * Mobile messageStore E2EE inbound message ordering tests.
 *
 * Covers the inbound pipeline ordering guarantees:
 *   1. #2 no-handshake arrives first → pending (no session state, no handshake)
 *   2. #1 handshake arrives later → decrypted (creates session from handshake)
 *   3. Auto drain #2 → decrypted (session now exists)
 *   4. compareE2eeDecryptOrder: conversationSeq first, sendTime fallback, stable key tiebreak
 *   5. processE2eeMessages batch ordering by conversationSeq
 *   6. Recipient mismatch → failed with correct placeholder (regression for issue #9)
 *
 * References: docs/e2ee-message-pipeline.md Chapter 2 (Inbound Pipeline)
 */

import type { MobileMessage } from '@/types/models';

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('@/services/storage/messageRepository');
jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/chat/messageService');
jest.mock('@/services/upload/uploadService');
jest.mock('@/utils/logger');
jest.mock('@/utils/ids', () => ({
  createClientMessageId: jest.fn(() => `client_ib_${Date.now()}`),
  createLocalMessageId: jest.fn(() => `local_ib_${Date.now()}`),
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: { id: '100', nickname: 'Alice', username: 'alice' },
    })),
  },
}));

jest.mock('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: jest.fn(() => ({
      sessions: [],
      currentSession: null,
      upsertSession: jest.fn(),
      markRead: jest.fn(),
      setCurrentSession: jest.fn(),
    })),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────

import { e2eeManager, E2eeEnvelopeRecipientMismatchError } from '@/e2ee/manager/e2eeManager';
import {
  processE2eeMessage,
  processE2eeMessages,
  compareE2eeDecryptOrder,
  hasE2eeHandshake,
  shouldDrainPendingAfterDecrypt,
  E2EE_NOT_FOR_THIS_DEVICE_TEXT,
  type ProcessedE2eeMessage,
} from '@/e2ee/messageProcessor';
import {
  cachePendingEncryptedMessage,
  clearAllPendingEncryptedMessages,
  configurePendingDecryptQueue,
  getPendingEncryptedMessages,
  retryDecryptPendingMessages,
} from '@/e2ee/store/pendingDecryptStore';
import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';

// Note: configurePendingDecryptQueue requires messageStore to be initialized.
// We configure it with a simple handler that delegates to processE2eeMessage.
configurePendingDecryptQueue({
  retryPendingMessages: async (sessionId, entries) => {
    const remaining: typeof entries = [];
    for (const entry of entries) {
      const processed = await processE2eeMessage(entry.message, {
        sessionId,
        currentUserId: '100',
      });
      if (processed.decryptStatus === 'decrypted') {
        continue;
      }
      if (processed.decryptStatus === 'pending') {
        remaining.push({
          ...entry,
          retryCount: entry.retryCount + 1,
          lastError: processed.errorClassification?.safeMessage ?? 'retry failed',
          lastTriedAt: Date.now(),
        });
      }
    }
    return remaining;
  },
  retryVisibleMessages: async () => 0,
});

// ─── Helpers ──────────────────────────────────────────────────────────

const sessionId = '100_200';

const handshakeEnvelope = {
  version: 2 as const,
  algorithm: 'rust-x25519-x3dh-dr-v1' as const,
  senderDeviceId: 'device-200',
  recipientDeviceId: 'device-100',
  sessionId,
  handshake: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  wire: 'HANDSHAKE_WIRE',
};

const noHandshakeEnvelope = {
  version: 2 as const,
  algorithm: 'rust-x25519-x3dh-dr-v1' as const,
  senderDeviceId: 'device-200',
  recipientDeviceId: 'device-100',
  sessionId,
  handshake: undefined,
  wire: 'NORMAL_WIRE',
};

const encryptedMsg = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: `msg-${Date.now()}-${Math.random()}`,
  messageId: `msg-${Date.now()}-${Math.random()}`,
  conversationId: sessionId,
  senderId: '200',
  receiverId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: '',
  encrypted: true,
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('inbound E2EE message ordering', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    clearAllPendingEncryptedMessages();
  });

  // ── Test 1: #2 no-handshake first → pending ─────────────────────────

  describe('message without handshake arrives before session exists', () => {
    it('marks message as pending when no session state and no handshake', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE session state unavailable and envelope has no handshake'),
      );

      const msg2 = encryptedMsg({
        messageId: 'msg-2',
        e2eeEnvelope: noHandshakeEnvelope,
        sendTime: '2024-06-01T10:00:02.000Z',
      });

      const processed = await processE2eeMessage(msg2, {
        sessionId,
        currentUserId: '100',
      });

      expect(processed.decryptStatus).toBe('pending');
      expect(processed.displayMessage.content).toBe(E2EE_UNSUPPORTED_TEXT);
      // Raw message must preserve encrypted data for later retry
      expect(processed.rawMessage.e2eeEnvelope).toBeDefined();
    });

    it('caches the message in pendingDecryptStore', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE session state unavailable and envelope has no handshake'),
      );

      const msg2 = encryptedMsg({
        messageId: 'msg-2',
        e2eeEnvelope: noHandshakeEnvelope,
        sendTime: '2024-06-01T10:00:02.000Z',
      });

      await processE2eeMessage(msg2, { sessionId, currentUserId: '100' });

      // This is what websocketStore.dispatchPayload does after processing
      cachePendingEncryptedMessage(sessionId, msg2);

      const pending = getPendingEncryptedMessages(sessionId);
      expect(pending).toHaveLength(1);
      expect(pending[0].messageId).toBe('msg-2');
    });
  });

  // ── Test 2: #1 handshake arrives → decrypted ────────────────────────

  describe('handshake message creates session and decrypts', () => {
    it('decrypts successfully when handshake is present (no prior state)', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockResolvedValueOnce('hello from handshake');

      const msg1 = encryptedMsg({
        messageId: 'msg-1',
        e2eeEnvelope: handshakeEnvelope,
        sendTime: '2024-06-01T10:00:01.000Z',
      });

      const processed = await processE2eeMessage(msg1, {
        sessionId,
        currentUserId: '100',
      });

      expect(processed.decryptStatus).toBe('decrypted');
      expect(processed.displayMessage.content).toBe('hello from handshake');
      expect(processed.displayMessage.isE2eeDisplayDecrypted).toBe(true);
    });

    it('hasE2eeHandshake returns true for messages with handshake', () => {
      const msg1 = encryptedMsg({
        messageId: 'msg-1',
        e2eeEnvelope: handshakeEnvelope,
      });
      expect(hasE2eeHandshake(msg1)).toBe(true);
    });

    it('shouldDrainPendingAfterDecrypt returns true for decrypted handshake message', () => {
      const msg1 = encryptedMsg({
        messageId: 'msg-1',
        e2eeEnvelope: handshakeEnvelope,
      });
      const processed: ProcessedE2eeMessage = {
        rawMessage: msg1,
        displayMessage: { ...msg1, content: 'hello' },
        decryptStatus: 'decrypted',
      };
      expect(shouldDrainPendingAfterDecrypt(processed)).toBe(true);
    });
  });

  // ── Test 3: auto drain #2 → decrypted ───────────────────────────────

  describe('out-of-order recovery: #2 pending → #1 handshake → drain #2', () => {
    it('drains pending #2 after #1 handshake creates session', async () => {
      const decryptSpy = jest.spyOn(e2eeManager, 'decryptEnvelope');

      // Phase 1: #2 arrives first, no session state, no handshake → pending
      decryptSpy.mockRejectedValueOnce(
        new Error('Rust E2EE session state unavailable and envelope has no handshake'),
      );

      const msg2 = encryptedMsg({
        messageId: 'msg-2',
        e2eeEnvelope: noHandshakeEnvelope,
        sendTime: '2024-06-01T10:00:02.000Z',
      });

      const processed2 = await processE2eeMessage(msg2, {
        sessionId,
        currentUserId: '100',
      });
      expect(processed2.decryptStatus).toBe('pending');

      // Cache in pending queue (simulates websocketStore.dispatchPayload)
      cachePendingEncryptedMessage(sessionId, processed2.rawMessage);
      expect(getPendingEncryptedMessages(sessionId)).toHaveLength(1);

      // Phase 2: #1 arrives, has handshake → decrypts, creates session
      decryptSpy.mockResolvedValueOnce('hello from msg-1');

      const msg1 = encryptedMsg({
        messageId: 'msg-1',
        e2eeEnvelope: handshakeEnvelope,
        sendTime: '2024-06-01T10:00:01.000Z',
      });

      const processed1 = await processE2eeMessage(msg1, {
        sessionId,
        currentUserId: '100',
      });
      expect(processed1.decryptStatus).toBe('decrypted');
      expect(hasE2eeHandshake(processed1.rawMessage)).toBe(true);

      // Phase 3: Drain pending queue — #2 should now decrypt
      // (simulates shouldDrainPendingAfterDecrypt → retryDecryptPendingMessages)
      decryptSpy.mockResolvedValueOnce('hello from msg-2');

      const decrypted = await retryDecryptPendingMessages(sessionId);
      expect(decrypted).toBe(1); // msg-2 decrypted

      // Pending queue should be empty
      expect(getPendingEncryptedMessages(sessionId)).toHaveLength(0);
    });
  });

  // ── Test 4: batch inbound processing ordering ───────────────────────

  describe('batch inbound processing sorts by conversationSeq first', () => {
    it('processes messages in conversationSeq order when seq and sendTime disagree', async () => {
      const decryptOrder: string[] = [];
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockImplementation(async (env) => {
        decryptOrder.push(env.wire);
        return `plaintext-${env.wire.slice(-1)}`;
      });

      // Input order: msg-3, msg-1, msg-2
      // conversationSeq: 3, 1, 2 → expected decrypt order: 1, 2, 3 (WIRE1, WIRE2, WIRE3)
      // sendTime order is deliberately reversed: msg-3 earliest, msg-1 latest
      const input = [
        encryptedMsg({
          messageId: 'msg-3',
          conversationSeq: 3,
          e2eeEnvelope: { ...noHandshakeEnvelope, wire: 'WIRE3' },
          sendTime: '2024-06-01T09:00:00.000Z', // earliest
        }),
        encryptedMsg({
          messageId: 'msg-1',
          conversationSeq: 1,
          e2eeEnvelope: { ...handshakeEnvelope, wire: 'WIRE1' },
          sendTime: '2024-06-01T11:00:00.000Z', // latest
        }),
        encryptedMsg({
          messageId: 'msg-2',
          conversationSeq: 2,
          e2eeEnvelope: { ...noHandshakeEnvelope, wire: 'WIRE2' },
          sendTime: '2024-06-01T10:00:00.000Z', // middle
        }),
      ];

      await processE2eeMessages(input, {
        currentUserId: '100',
        sessionId,
        concurrency: 8,
      });

      // Messages must be processed in conversationSeq order: 1, 2, 3
      expect(decryptOrder).toEqual(['WIRE1', 'WIRE2', 'WIRE3']);
    });

    it('falls back to valid sendTime when no messages have conversationSeq', async () => {
      const decryptOrder: string[] = [];
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockImplementation(async (env) => {
        decryptOrder.push(env.wire);
        return `plaintext-${env.wire.slice(-1)}`;
      });

      // No conversationSeq on any message — must fall back to sendTime
      const input = [
        encryptedMsg({
          messageId: 'msg-3',
          e2eeEnvelope: { ...noHandshakeEnvelope, wire: 'WIRE3' },
          sendTime: '2024-06-01T10:00:03.000Z',
        }),
        encryptedMsg({
          messageId: 'msg-1',
          e2eeEnvelope: { ...handshakeEnvelope, wire: 'WIRE1' },
          sendTime: '2024-06-01T10:00:01.000Z',
        }),
        encryptedMsg({
          messageId: 'msg-2',
          e2eeEnvelope: { ...noHandshakeEnvelope, wire: 'WIRE2' },
          sendTime: '2024-06-01T10:00:02.000Z',
        }),
      ];

      await processE2eeMessages(input, {
        currentUserId: '100',
        sessionId,
        concurrency: 8,
      });

      // Messages must be processed in sendTime order: msg-1, msg-2, msg-3
      expect(decryptOrder).toEqual(['WIRE1', 'WIRE2', 'WIRE3']);
    });
  });

  // ── Test 5: compareE2eeDecryptOrder ─────────────────────────────────

  describe('compareE2eeDecryptOrder', () => {
    // ── conversationSeq priority ─────────────────────────────────────

    it('sorts by conversationSeq first, ignoring sendTime', () => {
      // left has smaller seq (1) but later sendTime → should come first
      const first = encryptedMsg({
        messageId: 'msg-1',
        conversationSeq: 1,
        sendTime: '2024-06-01T10:00:10.000Z',
      });
      const second = encryptedMsg({
        messageId: 'msg-2',
        conversationSeq: 2,
        sendTime: '2024-06-01T10:00:01.000Z',
      });
      expect(compareE2eeDecryptOrder(first, second)).toBeLessThan(0);
      expect(compareE2eeDecryptOrder(second, first)).toBeGreaterThan(0);
    });

    it('reads conversation_seq snake_case field', () => {
      const first = encryptedMsg({ messageId: 'msg-1' });
      (first as unknown as Record<string, unknown>).conversation_seq = 1;
      const second = encryptedMsg({ messageId: 'msg-2' });
      (second as unknown as Record<string, unknown>).conversation_seq = 2;
      expect(compareE2eeDecryptOrder(first, second)).toBeLessThan(0);
    });

    it('parses conversationSeq as numeric string', () => {
      const a = encryptedMsg({ messageId: 'msg-a' });
      (a as unknown as Record<string, unknown>).conversationSeq = '10';
      const b = encryptedMsg({ messageId: 'msg-b' });
      (b as unknown as Record<string, unknown>).conversationSeq = '2';
      // 2 < 10, so b should come before a
      expect(compareE2eeDecryptOrder(b, a)).toBeLessThan(0);
      expect(compareE2eeDecryptOrder(a, b)).toBeGreaterThan(0);
    });

    it('ignores non-numeric conversationSeq and falls back to sendTime', () => {
      const a = encryptedMsg({
        messageId: 'msg-a',
        sendTime: '2024-06-01T10:00:02.000Z',
      });
      (a as unknown as Record<string, unknown>).conversationSeq = 'abc';
      const b = encryptedMsg({
        messageId: 'msg-b',
        sendTime: '2024-06-01T10:00:01.000Z',
      });
      (b as unknown as Record<string, unknown>).conversationSeq = 'xyz';
      // Both have invalid seq → fall back to sendTime: b is earlier
      expect(compareE2eeDecryptOrder(b, a)).toBeLessThan(0);
    });

    it('places message with conversationSeq before message without', () => {
      const withSeq = encryptedMsg({
        messageId: 'msg-with-seq',
        conversationSeq: 5,
        sendTime: '2024-06-01T12:00:00.000Z', // much later
      });
      const withoutSeq = encryptedMsg({
        messageId: 'msg-no-seq',
        sendTime: '2024-06-01T10:00:00.000Z', // much earlier
      });
      // withSeq has conversationSeq → comes first despite later sendTime
      expect(compareE2eeDecryptOrder(withSeq, withoutSeq)).toBeLessThan(0);
      expect(compareE2eeDecryptOrder(withoutSeq, withSeq)).toBeGreaterThan(0);
    });

    it('falls back to stable message key when both conversationSeq and sendTime are equal', () => {
      const a = encryptedMsg({
        messageId: 'msg-a',
        conversationSeq: 1,
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      const b = encryptedMsg({
        messageId: 'msg-b',
        conversationSeq: 1,
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      // Same seq AND same sendTime → fallback to messageId: 'msg-a' < 'msg-b'
      expect(compareE2eeDecryptOrder(a, b)).toBeLessThan(0);
    });

    // ── sendTime fallback ───────────────────────────────────────────

    it('falls back to valid sendTime when conversationSeq is unavailable', () => {
      const early = encryptedMsg({ sendTime: '2024-06-01T10:00:01.000Z' });
      const late = encryptedMsg({ sendTime: '2024-06-01T10:00:02.000Z' });
      expect(compareE2eeDecryptOrder(early, late)).toBeLessThan(0);
      expect(compareE2eeDecryptOrder(late, early)).toBeGreaterThan(0);
    });

    it('does not return NaN when sendTime is invalid', () => {
      const a = encryptedMsg({
        messageId: 'msg-a',
        sendTime: 'not-a-date',
      });
      const b = encryptedMsg({
        messageId: 'msg-b',
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      const result = compareE2eeDecryptOrder(a, b);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('treats missing sendTime as unavailable, not as 1970', () => {
      const missing = encryptedMsg({ messageId: 'msg-missing' });
      delete (missing as Record<string, unknown>).sendTime;
      const hasValid = encryptedMsg({
        messageId: 'msg-has-time',
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      // hasValid has a valid sendTime → should come before missing
      expect(compareE2eeDecryptOrder(hasValid, missing)).toBeLessThan(0);
    });

    it('falls back to stable message key when both sendTime are missing', () => {
      const a = encryptedMsg({ messageId: 'msg-a' });
      delete (a as Record<string, unknown>).sendTime;
      const b = encryptedMsg({ messageId: 'msg-b' });
      delete (b as Record<string, unknown>).sendTime;
      // Both missing sendTime → fallback to messageId
      expect(compareE2eeDecryptOrder(a, b)).toBeLessThan(0);
      expect(compareE2eeDecryptOrder(b, a)).toBeGreaterThan(0);
    });

    it('falls back to stable message key when both have same valid sendTime', () => {
      const a = encryptedMsg({
        sendTime: '2024-06-01T10:00:00.000Z',
        messageId: 'msg-a',
      });
      const b = encryptedMsg({
        sendTime: '2024-06-01T10:00:00.000Z',
        messageId: 'msg-b',
      });
      expect(compareE2eeDecryptOrder(a, b)).toBeLessThan(0);
    });

    // ── stable tiebreak ─────────────────────────────────────────────

    it('returns 0 for identical messages', () => {
      const msg = encryptedMsg({
        messageId: 'same-msg',
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      expect(compareE2eeDecryptOrder(msg, msg)).toBe(0);
    });

    it('uses serverId as stable key when messageId is absent', () => {
      const a = encryptedMsg({ sendTime: '2024-06-01T10:00:00.000Z' });
      delete (a as Record<string, unknown>).messageId;
      (a as MobileMessage).serverId = 'server-a';
      const b = encryptedMsg({ sendTime: '2024-06-01T10:00:00.000Z' });
      delete (b as Record<string, unknown>).messageId;
      (b as MobileMessage).serverId = 'server-b';
      expect(compareE2eeDecryptOrder(a, b)).toBeLessThan(0);
    });
  });

  // ── Test 6: pending safety — no plaintext in pending cache ──────────

  describe('pending cache never stores plaintext', () => {
    it('replaces content with placeholder in pending cache', () => {
      const msg = encryptedMsg({
        messageId: 'secret-msg',
        e2eeEnvelope: noHandshakeEnvelope,
        content: 'ACTUAL_PLAINTEXT_SECRET',
      });

      cachePendingEncryptedMessage(sessionId, msg);

      const [pending] = getPendingEncryptedMessages(sessionId);
      expect(pending?.content).toBe(E2EE_UNSUPPORTED_TEXT);
      expect(pending?.rawJson).not.toContain('ACTUAL_PLAINTEXT_SECRET');
      expect(pending?.rawJson).toContain('e2eeEnvelope');
    });
  });

  // ── Test 7: recipient mismatch regression (issue #9) ────────────────

  describe('recipient device mismatch', () => {
    it('marks as failed with localized placeholder when decryptEnvelope throws E2eeEnvelopeRecipientMismatchError', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new E2eeEnvelopeRecipientMismatchError('device-100', 'device-999', sessionId),
      );

      const msg = encryptedMsg({
        messageId: 'msg-recipient-mismatch',
        e2eeEnvelope: noHandshakeEnvelope,
      });

      const processed = await processE2eeMessage(msg, {
        sessionId,
        currentUserId: '100',
      });

      expect(processed.decryptStatus).toBe('failed');
      expect(processed.displayMessage.content).toBe(E2EE_NOT_FOR_THIS_DEVICE_TEXT);
      expect(processed.errorClassification?.retryable).toBe(false);
    });

    it('marks as failed when error has E2EE_RECIPIENT_DEVICE_MISMATCH code (plain Error fallback)', async () => {
      const error = new Error('E2EE envelope is not addressed to this device');
      (error as any).code = 'E2EE_RECIPIENT_DEVICE_MISMATCH';
      (error as any).nonRetryable = true;

      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(error);

      const msg = encryptedMsg({
        messageId: 'msg-recipient-mismatch-plain',
        e2eeEnvelope: noHandshakeEnvelope,
      });

      const processed = await processE2eeMessage(msg, {
        sessionId,
        currentUserId: '100',
      });

      expect(processed.decryptStatus).toBe('failed');
      expect(processed.displayMessage.content).toBe(E2EE_NOT_FOR_THIS_DEVICE_TEXT);
      expect(processed.errorClassification?.retryable).toBe(false);
    });

    it('does not add the message to pendingDecryptStore after mismatch failure', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new E2eeEnvelopeRecipientMismatchError('device-100', 'device-999', sessionId),
      );

      const msg = encryptedMsg({
        messageId: 'msg-recipient-mismatch-no-pending',
        e2eeEnvelope: noHandshakeEnvelope,
      });

      const processed = await processE2eeMessage(msg, {
        sessionId,
        currentUserId: '100',
      });

      // Only cache if decryptStatus is 'pending'
      if (processed.decryptStatus === 'pending') {
        cachePendingEncryptedMessage(sessionId, processed.rawMessage);
      }

      // Should be 'failed', not 'pending' → no cache entry
      expect(getPendingEncryptedMessages(sessionId)).toHaveLength(0);
    });
  });
});
