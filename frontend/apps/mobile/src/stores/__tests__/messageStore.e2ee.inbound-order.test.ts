/**
 * Mobile messageStore E2EE inbound message ordering tests.
 *
 * Covers the inbound pipeline ordering guarantees:
 *   1. #2 no-handshake arrives first → pending (no session state, no handshake)
 *   2. #1 handshake arrives later → decrypted (creates session from handshake)
 *   3. Auto drain #2 → decrypted (session now exists)
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

import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import {
  processE2eeMessage,
  processE2eeMessages,
  compareE2eeDecryptOrder,
  hasE2eeHandshake,
  shouldDrainPendingAfterDecrypt,
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

  // ── Test 4: concurrent inbound via processE2eeMessages ──────────────

  describe('batch inbound processing sorts by sendTime', () => {
    it('processes messages in sendTime order regardless of input order', async () => {
      const decryptOrder: string[] = [];
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockImplementation(async (env) => {
        decryptOrder.push(env.wire);
        return `plaintext-${env.wire.slice(-1)}`;
      });

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

  // ── Test 5: compareE2eeDecryptOrder tie-breaking ────────────────────

  describe('compareE2eeDecryptOrder', () => {
    it('sorts by sendTime first', () => {
      const early = encryptedMsg({ sendTime: '2024-06-01T10:00:01.000Z' });
      const late = encryptedMsg({ sendTime: '2024-06-01T10:00:02.000Z' });
      expect(compareE2eeDecryptOrder(early, late)).toBeLessThan(0);
      expect(compareE2eeDecryptOrder(late, early)).toBeGreaterThan(0);
    });

    it('sorts by messageId when sendTime is equal', () => {
      const a = encryptedMsg({ sendTime: '2024-06-01T10:00:00.000Z', messageId: 'msg-a' });
      const b = encryptedMsg({ sendTime: '2024-06-01T10:00:00.000Z', messageId: 'msg-b' });
      expect(compareE2eeDecryptOrder(a, b)).toBeLessThan(0);
    });

    it('returns 0 for identical messages', () => {
      const msg = encryptedMsg({
        messageId: 'same-msg',
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      expect(compareE2eeDecryptOrder(msg, msg)).toBe(0);
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
});
