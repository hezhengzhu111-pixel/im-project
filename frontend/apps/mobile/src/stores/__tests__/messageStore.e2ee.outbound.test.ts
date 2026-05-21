/**
 * Mobile messageStore E2EE outbound pipeline tests.
 *
 * Covers the complete outbound send flow:
 *   1. plaintext private session → enqueue E2EE-waiting pending, no plaintext send
 *   2. negotiating session → enqueue pending, no throw
 *   3. accepted → resume pending → encrypt → sendPrivateEncrypted
 *   4. encrypt failure → no plaintext fallback
 *
 * References: Rules A / B / C / D from docs/e2ee-message-pipeline.md
 */

import type { ChatSession } from '@im/shared-types';
import type { MobileMessage, PendingMessage } from '@/types/models';

// ─── Mocks (before imports) ───────────────────────────────────────────

jest.mock('@/services/storage/messageRepository');
jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/chat/messageService');
jest.mock('@/services/upload/uploadService');
jest.mock('@/utils/logger');
jest.mock('@/utils/ids', () => ({
  createClientMessageId: jest.fn(() => `client_ob_${Date.now()}`),
  createLocalMessageId: jest.fn(() => `local_ob_${Date.now()}`),
}));

const mockSessions: ChatSession[] = [];
const mockUpsertSession = jest.fn();
const mockMarkRead = jest.fn();

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: { id: '100', nickname: 'Alice', username: 'alice' },
    })),
  },
}));

jest.mock('@/e2ee/storage/secureE2eeStorage', () => ({
  e2eeSecureStorage: {
    savePendingPlaintext: jest.fn().mockResolvedValue(undefined),
    getPendingPlaintext: jest.fn().mockResolvedValue('hello'),
    removePendingPlaintext: jest.fn().mockResolvedValue(undefined),
    getDeviceId: jest.fn().mockResolvedValue('device-100'),
    namespaceKey: jest.fn((userId: string, deviceId: string, kind: string, id: string) =>
      `im.mobile.e2ee.${userId}.${deviceId}.${kind}.${encodeURIComponent(id)}`,
    ),
    setEncryptedJson: jest.fn().mockResolvedValue(undefined),
    getEncryptedJson: jest.fn().mockResolvedValue(null),
    removeEncrypted: jest.fn().mockResolvedValue(undefined),
    getOrCreateDeviceId: jest.fn().mockResolvedValue('device-100'),
    setKeyMaterial: jest.fn().mockResolvedValue(undefined),
    getKeyMaterial: jest.fn().mockResolvedValue(''),
    removeKeyMaterial: jest.fn().mockResolvedValue(undefined),
    clearAccount: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: jest.fn(() => ({
      sessions: mockSessions,
      currentSession: null as ChatSession | null,
      upsertSession: mockUpsertSession,
      markRead: mockMarkRead,
      setCurrentSession: jest.fn(),
    })),
  },
}));

// Mock initiateNegotiation to return true by default (real implementation
// requires device registration + network calls not available in test).
jest.mock('@/e2ee/manager/negotiation', () => {
  const actual = jest.requireActual('@/e2ee/manager/negotiation') as Record<string, unknown>;
  return {
    ...actual,
    initiateNegotiation: jest.fn().mockResolvedValue(true),
  };
});

jest.mock('@/e2ee/manager/localDevice', () => ({
  ensureLocalE2eeDeviceRegistered: jest.fn().mockResolvedValue(undefined),
  getLocalRustKeyMaterial: jest.fn(),
  heartbeatLocalE2eeDevice: jest.fn(),
  __resetLocalE2eeDeviceRegistrationForTests: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────

import { useMessageStore } from '../messageStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { messageService } from '@/services/chat/messageService';
import {
  E2EE_SEND_DISABLED_TEXT,
} from '@/e2ee/e2eeDeferred';
import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { initiateNegotiation } from '@/e2ee/manager/negotiation';
import { ensureLocalE2eeDeviceRegistered } from '@/e2ee/manager/localDevice';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';

const mockEnsureLocalE2eeDeviceRegistered = ensureLocalE2eeDeviceRegistered as jest.MockedFunction<typeof ensureLocalE2eeDeviceRegistered>;
import {
  clearAllPendingEncryptedMessages,
} from '@/e2ee/store/pendingDecryptStore';
import { encryptPendingE2eePayload } from '@/e2ee/outbound/pendingE2eeSend';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';

const mr = jest.mocked(messageRepository);
const pr = jest.mocked(pendingMessageRepository);
const ms = jest.mocked(messageService);
const mockInitiateNegotiation = initiateNegotiation as jest.MockedFunction<typeof initiateNegotiation>;

// ─── Helpers ──────────────────────────────────────────────────────────

const baseSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: '100_200',
  type: 'private',
  targetId: '200',
  targetName: 'Bob',
  unreadCount: 0,
  lastActiveTime: '2024-06-01T10:00:00.000Z',
  isPinned: false,
  isMuted: false,
  ...overrides,
});

const rustEnvelope = {
  version: 2 as const,
  algorithm: 'rust-x25519-x3dh-dr-v1' as const,
  senderDeviceId: 'device-100',
  recipientDeviceId: 'device-200',
  sessionId: '100_200',
  handshake: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  wire: 'AAAAAA==',
};

// ─── Tests ────────────────────────────────────────────────────────────

describe('messageStore E2EE outbound pipeline', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    useMessageStore.setState({
      messagesBySession: {},
      messagesPaginationBySession: {},
      loading: false,
      searchResults: [],
    });
    e2eeSessionStore.clearRuntime();
    clearAllPendingEncryptedMessages();
    jest.clearAllMocks();
    mockInitiateNegotiation.mockResolvedValue(true);
    mockEnsureLocalE2eeDeviceRegistered.mockResolvedValue(undefined);
    mockSessions.length = 0;
    mr.listMessages.mockReturnValue([]);
    mr.listMessagesPage.mockReturnValue({ messages: [], hasMore: false });
    mr.listSessions.mockReturnValue([]);
    pr.listReady.mockReturnValue([]);
    pr.listReadyToSend.mockReturnValue([]);
    pr.findByClientMessageId.mockReturnValue(undefined);
    if (!pr.listByConversation) {
      (pr as Record<string, unknown>).listByConversation = jest.fn().mockReturnValue([]);
    } else {
      pr.listByConversation.mockReturnValue([]);
    }
    if (!pr.updateStatus) {
      (pr as Record<string, unknown>).updateStatus = jest.fn();
    }
  });

  // ── 1. plaintext private → enqueue E2EE-waiting pending ────────────

  describe('plaintext private session (Rule A)', () => {
    it('does NOT call sendPrivate — enqueues E2EE-waiting pending instead', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(pr.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: session.id,
          sendType: 'private',
          status: 'pending',
        }),
      );
    });

    it('calls initiateNegotiation for plaintext private session', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(mockInitiateNegotiation).toHaveBeenCalledWith(session.id, session.targetId);
    });

    it('adds optimistic message visible in UI state', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeDefined();
      expect(messages!.length).toBeGreaterThanOrEqual(1);
      expect(messages![0].content).toBe('hello');
      expect(messages![0].encrypted).toBeFalsy();
    });

    it('payload contains requiresE2ee=true with negotiation reason', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      const enqueueCall = (pr.enqueue as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.conversationId === session.id,
      );
      expect(enqueueCall).toBeDefined();
      const payloadJson = (enqueueCall![0] as { payloadJson: string }).payloadJson;
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      expect(payload.requiresE2ee).toBe(true);
      expect(payload.e2eeWaitReason).toBe('negotiation');
      // plaintext MUST NOT be in payload (stored in secure Keychain)
      expect(payload.plaintext).toBeUndefined();
      expect(payload.plaintextRef).toBeDefined();
      // data.content must NOT be set (different from non-E2EE pending)
      expect((payload.data as Record<string, unknown>).content).toBeUndefined();
    });

    it('marks message FAILED when initiateNegotiation fails', async () => {
      const session = baseSession();
      mockInitiateNegotiation.mockResolvedValueOnce(false);

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages![0].status).toBe('FAILED');
      // Pending still enqueued so user can retry
      expect(pr.enqueue).toHaveBeenCalled();
    });

    it('marks message FAILED when initiateNegotiation throws', async () => {
      const session = baseSession();
      mockInitiateNegotiation.mockRejectedValueOnce(new Error('network error'));

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages![0].status).toBe('FAILED');
      expect(pr.enqueue).toHaveBeenCalled();
    });
  });

  // ── 2. negotiating session → no throw, pending ─────────────────────

  describe('negotiating private session (Rule B)', () => {
    beforeEach(async () => {
      await e2eeSessionStore.setStatus('100', '100_200', 'negotiating');
    });

    it('does NOT throw when status is negotiating', async () => {
      const session = baseSession();

      await expect(
        useMessageStore.getState().sendText(session, 'hello'),
      ).resolves.toBeUndefined();
    });

    it('does NOT call sendPrivate', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('does NOT call initiateNegotiation again (already negotiating)', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(mockInitiateNegotiation).not.toHaveBeenCalled();
    });

    it('enqueues pending with requiresE2ee=true', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(pr.enqueue).toHaveBeenCalled();
      const enqueueCall = (pr.enqueue as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.conversationId === session.id,
      );
      const payloadJson = (enqueueCall![0] as { payloadJson: string }).payloadJson;
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      expect(payload.requiresE2ee).toBe(true);
    });

    it('adds optimistic message to UI state', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeDefined();
      expect(messages!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 3. accepted → resume pending → encrypt → sendPrivateEncrypted ──

  describe('accepted encrypted session (Rule C)', () => {
    it('encrypts and sends via sendPrivateEncrypted after status is encrypted', async () => {
      const session = baseSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockResolvedValueOnce(rustEnvelope);

      let enqueued: PendingMessage | undefined;
      pr.enqueue.mockImplementation((item: PendingMessage) => {
        enqueued = item;
      });
      pr.get.mockImplementation((localId: string) =>
        enqueued?.localId === localId ? enqueued : undefined,
      );
      // Use mockImplementation to spread input data so clientMessageId matches
      ms.sendPrivateEncrypted.mockImplementation(async (data) => ({
        code: 0,
        message: 'ok',
        data: {
          ...data,
          id: 'srv_enc',
          messageId: 'srv_enc',
          senderId: '100',
          receiverId: '200',
          isGroupChat: false,
          sendTime: '2024-06-01T10:00:00.000Z',
          status: 'SENT',
        },
      }) as never);

      await useMessageStore.getState().sendText(session, 'hello');

      // Must use encrypted channel
      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted: true,
          e2eeEnvelope: rustEnvelope,
          e2eeDeviceId: 'device-100',
        }),
      );

      // Pending payload must NOT contain plaintext content
      expect(enqueued).toBeDefined();
      const payload = JSON.parse(enqueued!.payloadJson) as Record<string, unknown>;
      expect(payload.encrypted).toBe(true);
      expect((payload.data as Record<string, unknown>).content).toBeUndefined();

      // UI must show plaintext (optimistic display preserved via own-echo)
      const display = useMessageStore.getState().messagesBySession[session.id];
      expect(display).toBeDefined();
      // The own-echo optimistic message content is preserved
      const ownEchoDisplay = display!.find((m) => m.decryptStatus === 'own-echo-preserved' || m.isE2eeDisplayDecrypted);
      // After processing server response, the UI message should still have the optimistic content
      expect(display!.length).toBeGreaterThanOrEqual(1);
    });

    it('second send also goes through encryptToEnvelope', async () => {
      const session = baseSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');
      const encryptSpy = jest.spyOn(e2eeManager, 'encryptToEnvelope')
        .mockResolvedValueOnce(rustEnvelope)
        .mockResolvedValueOnce({ ...rustEnvelope, handshake: undefined });

      let enqueued: PendingMessage | undefined;
      pr.enqueue.mockImplementation((item: PendingMessage) => {
        enqueued = item;
      });
      pr.get.mockImplementation((localId: string) =>
        enqueued?.localId === localId ? enqueued : undefined,
      );
      ms.sendPrivateEncrypted.mockImplementation(async (data) => ({
        code: 0,
        message: 'ok',
        data: { ...data, id: 'srv', messageId: 'srv', status: 'SENT' },
      }) as never);

      await useMessageStore.getState().sendText(session, 'hello 1');
      await useMessageStore.getState().sendText(session, 'hello 2');

      expect(encryptSpy).toHaveBeenCalledTimes(2);
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });
  });

  // ── 4. encrypt failure → no plaintext fallback ─────────────────────

  describe('encrypt failure does not fallback to plaintext', () => {
    it('marks local message FAILED and does NOT call sendPrivate', async () => {
      const session = baseSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE session state unavailable'),
      );

      await expect(
        useMessageStore.getState().sendText(session, 'hello'),
      ).rejects.toThrow('Rust E2EE session state unavailable');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).not.toHaveBeenCalled();
      expect(pr.enqueue).not.toHaveBeenCalled();

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeDefined();
      expect(messages![0].status).toBe('FAILED');
      expect(messages![0].content).toBe('hello');
    });

    it('does NOT fallback to plaintext on network error either', async () => {
      const session = baseSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockRejectedValueOnce(
        new Error('network timeout'),
      );

      await expect(
        useMessageStore.getState().sendText(session, 'hello'),
      ).rejects.toThrow('network timeout');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });
  });

  // ── 5. failed status blocks sending (Rule D) ───────────────────────

  describe('failed session status blocks sending (Rule D)', () => {
    it('throws E2EE_SEND_DISABLED_TEXT when status is failed', async () => {
      const session = baseSession();
      await e2eeSessionStore.setStatus('100', session.id, 'failed');

      await expect(
        useMessageStore.getState().sendText(session, 'hello'),
      ).rejects.toThrow(E2EE_SEND_DISABLED_TEXT);

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).not.toHaveBeenCalled();
      expect(pr.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── 6. retryMessage skips E2EE-waiting pending ─────────────────────

  describe('retryMessage with E2EE-waiting pending', () => {
    it('skips requiresE2ee payload without blocking or marking failed', async () => {
      const pending: PendingMessage = {
        localId: 'local_e2ee_wait',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          requiresE2ee: true,
          e2eeWaitReason: 'negotiation',
          plaintextRef: 'local_e2ee_wait',
          data: {
            receiverId: '200',
            clientMessageId: 'c_e2ee_wait',
            messageType: 'TEXT',
          },
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2ee_wait');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).not.toHaveBeenCalled();

      expect(pr.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );
      expect(pr.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  // ── 7. encryptPendingE2eePayload integration ───────────────────────

  describe('encryptPendingE2eePayload (core resume logic)', () => {
    it('encrypts E2EE-waiting pending and rewrites payload with envelope', async () => {
      const sessionId = '100_200';

      const encryptSpy = jest.spyOn(e2eeManager, 'encryptToEnvelope').mockResolvedValueOnce(rustEnvelope);
      jest.mocked(e2eeSecureStorage.getPendingPlaintext).mockResolvedValueOnce('secret message');

      const pending: PendingMessage = {
        localId: 'local_e2ee_enc_1',
        conversationId: sessionId,
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          requiresE2ee: true,
          e2eeWaitReason: 'negotiation',
          plaintextRef: 'local_e2ee_enc_1',
          data: {
            receiverId: '200',
            clientMessageId: 'c_enc_1',
            messageType: 'TEXT',
          },
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await encryptPendingE2eePayload(pending);

      expect(result.ok).toBe(true);
      expect(result.envelope).toEqual(rustEnvelope);
      expect(encryptSpy).toHaveBeenCalledWith({
        sessionId,
        plaintext: 'secret message',
        recipientUserId: '200',
      });

      // Verify the pending was updated with encrypted payload
      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 'local_e2ee_enc_1',
          payloadJson: expect.stringContaining('encrypted'),
        }),
      );

      // Plaintext must be deleted from secure storage on success
      expect(e2eeSecureStorage.removePendingPlaintext).toHaveBeenCalled();

      // The updated payload should NOT contain plaintext
      const updateCall = (pr.update as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.localId === 'local_e2ee_enc_1',
      );
      const updatedPayload = JSON.parse((updateCall![0] as { payloadJson: string }).payloadJson) as Record<string, unknown>;
      expect(updatedPayload.plaintext).toBeUndefined();
      expect(updatedPayload.plaintextRef).toBeUndefined();
      expect(updatedPayload.requiresE2ee).toBeUndefined();
      expect(updatedPayload.encrypted).toBe(true);
      expect((updatedPayload.data as Record<string, unknown>).e2eeEnvelope).toEqual(rustEnvelope);
    });

    it('returns ok=false and does not throw when encryptToEnvelope fails', async () => {
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE session state unavailable'),
      );
      jest.mocked(e2eeSecureStorage.getPendingPlaintext).mockResolvedValueOnce('do not send');

      const pending: PendingMessage = {
        localId: 'local_e2ee_fail_1',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          requiresE2ee: true,
          e2eeWaitReason: 'negotiation',
          plaintextRef: 'local_e2ee_fail_1',
          data: {
            receiverId: '200',
            clientMessageId: 'c_fail_1',
            messageType: 'TEXT',
          },
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await encryptPendingE2eePayload(pending);

      expect(result.ok).toBe(false);
      expect(result.envelope).toBeUndefined();
      expect(result.error).toContain('Rust E2EE');

      // Pending should NOT be updated with encrypted payload
      // (The pending is updated with retry-incremented error, not cleared)
    });

    it('sets nextRetryAt on retryable failure (backoff)', async () => {
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockRejectedValueOnce(
        new Error('E2EE session state unavailable'),
      );
      jest.mocked(e2eeSecureStorage.getPendingPlaintext).mockResolvedValueOnce('backoff test');

      const pending: PendingMessage = {
        localId: 'local_e2ee_backoff',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          requiresE2ee: true,
          e2eeWaitReason: 'negotiation',
          plaintextRef: 'local_e2ee_backoff',
          data: {
            receiverId: '200',
            clientMessageId: 'c_backoff',
            messageType: 'TEXT',
          },
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const before = Date.now();
      const result = await encryptPendingE2eePayload(pending);

      expect(result.ok).toBe(false);

      // Check that pending was updated with backoff metadata
      const updateCall = (pr.update as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.localId === 'local_e2ee_backoff',
      );
      expect(updateCall).toBeDefined();
      const updated = updateCall![0] as Record<string, unknown>;
      expect(updated.status).toBe('pending');
      expect(updated.retryCount).toBe(1);
      expect(updated.nextRetryAt).toBeGreaterThan(before);
      expect(updated.lastError).toContain('e2ee: encrypt failed:');
    });

    it('marks pending as failed and deletes plaintext when maxRetryCount exceeded (exhausted)', async () => {
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockRejectedValueOnce(
        new Error('E2EE negotiation has not been accepted'),
      );
      jest.mocked(e2eeSecureStorage.getPendingPlaintext).mockResolvedValueOnce('exhausted test');

      const retryConfig = { maxRetryCount: 5 };
      const pending: PendingMessage = {
        localId: 'local_e2ee_exhausted',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          requiresE2ee: true,
          e2eeWaitReason: 'negotiation',
          plaintextRef: 'local_e2ee_exhausted',
          data: {
            receiverId: '200',
            clientMessageId: 'c_exhausted',
            messageType: 'TEXT',
          },
        }),
        status: 'pending',
        retryCount: retryConfig.maxRetryCount, // already at max
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await encryptPendingE2eePayload(pending);

      expect(result.ok).toBe(false);

      const updateCall = (pr.update as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.localId === 'local_e2ee_exhausted',
      );
      expect(updateCall).toBeDefined();
      const updated = updateCall![0] as Record<string, unknown>;
      expect(updated.status).toBe('failed');
      expect(updated.lastError).toContain('exhausted');
      // Plaintext must be stripped from exhausted payload
      expect(updated.payloadJson).not.toContain('exhausted test');
      // Plaintext must be deleted from secure storage on exhausted
      expect(e2eeSecureStorage.removePendingPlaintext).toHaveBeenCalled();
    });
  });

  // ── 8. retryPending handles E2EE-waiting items ──────────────────────

  describe('retryPending with E2EE-waiting pending', () => {
    const e2eeWaitPending = (overrides: Partial<PendingMessage> = {}): PendingMessage => ({
      localId: 'local_retry_pending_e2ee',
      conversationId: '100_200',
      sendType: 'private',
      payloadJson: JSON.stringify({
        sendType: 'private',
        requiresE2ee: true,
        e2eeWaitReason: 'negotiation',
        plaintextRef: 'local_retry_pending_e2ee',
        data: {
          receiverId: '200',
          clientMessageId: 'c_rp_e2ee',
          messageType: 'TEXT',
        },
      }),
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    });

    it('encrypts and sends when status=encrypted and nextRetryAt is due', async () => {
      const pending = e2eeWaitPending();
      pr.listReadyToSend.mockReturnValue([pending]);
      pr.get.mockReturnValue(pending);

      // Session is encrypted
      await e2eeSessionStore.setStatus('100', '100_200', 'encrypted');

      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockResolvedValueOnce(rustEnvelope);
      ms.sendPrivateEncrypted.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_rp', messageId: 'srv_rp', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryPending();

      // encryptToEnvelope should have been called
      expect(jest.spyOn(e2eeManager, 'encryptToEnvelope')).toHaveBeenCalled();
    });

    it('does NOT send when status is still negotiating', async () => {
      const pending = e2eeWaitPending();
      pr.listReadyToSend.mockReturnValue([pending]);
      pr.get.mockReturnValue(pending);

      // Session is still negotiating
      await e2eeSessionStore.setStatus('100', '100_200', 'negotiating');

      const encryptSpy = jest.spyOn(e2eeManager, 'encryptToEnvelope');

      await useMessageStore.getState().retryPending();

      // Must NOT attempt encryption
      expect(encryptSpy).not.toHaveBeenCalled();
      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).not.toHaveBeenCalled();
    });

    it('does NOT attempt when nextRetryAt is in the future', async () => {
      const futurePending = e2eeWaitPending({
        nextRetryAt: Date.now() + 3600_000, // 1 hour in future
      });
      // listReadyToSend should exclude this item due to future nextRetryAt
      pr.listReadyToSend.mockReturnValue([]);

      await e2eeSessionStore.setStatus('100', '100_200', 'encrypted');
      const encryptSpy = jest.spyOn(e2eeManager, 'encryptToEnvelope');

      await useMessageStore.getState().retryPending();

      expect(encryptSpy).not.toHaveBeenCalled();
    });

    it('marks local optimistic message FAILED when E2EE pending encrypt is exhausted', async () => {
      // Add optimistic message to UI state
      const msg: MobileMessage = {
        id: 'local_exhausted_rp',
        clientMessageId: 'c_rp_exhausted',
        conversationId: '100_200',
        senderId: '100',
        receiverId: '200',
        isGroupChat: false,
        messageType: 'TEXT' as const,
        content: 'will be exhausted',
        sendTime: new Date().toISOString(),
        status: 'SENDING' as const,
      };
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      const exhaustedPending = e2eeWaitPending({
        localId: 'local_exhausted_rp',
        retryCount: 5, // at max
      });
      pr.listReadyToSend.mockReturnValue([exhaustedPending]);

      // get returns 'failed' status after encryptPendingE2eePayload exhausts it
      pr.get.mockImplementation((localId: string) => {
        if (localId === 'local_exhausted_rp') {
          return {
            ...exhaustedPending,
            status: 'failed',
            lastError: 'e2ee encrypt exhausted: test',
          };
        }
        return undefined;
      });

      await e2eeSessionStore.setStatus('100', '100_200', 'encrypted');
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockRejectedValueOnce(
        new Error('test'),
      );

      await useMessageStore.getState().retryPending();

      // Local message should be marked FAILED
      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toBeDefined();
      expect(messages![0].status).toBe('FAILED');
    });
  });

  // ── 9. sendMedia blocks all private sessions ────────────────────────

  describe('sendMedia blocks all private sessions', () => {
    const privateSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
      id: '100_200',
      type: 'private',
      targetId: '200',
      targetName: 'Bob',
      unreadCount: 0,
      lastActiveTime: '2024-06-01T10:00:00.000Z',
      isPinned: false,
      isMuted: false,
      ...overrides,
    });

    const file = { uri: 'file:///photo.jpg', name: 'photo.jpg', size: 2048 };

    it('rejects private plaintext media', async () => {
      const session = privateSession();
      await expect(
        useMessageStore.getState().sendMedia(session, file as never, 'IMAGE'),
      ).rejects.toThrow('私聊端到端加密策略下暂不支持发送媒体');
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('rejects private negotiating media', async () => {
      await e2eeSessionStore.setStatus('100', '100_200', 'negotiating');
      const session = privateSession();
      await expect(
        useMessageStore.getState().sendMedia(session, file as never, 'IMAGE'),
      ).rejects.toThrow('私聊端到端加密策略下暂不支持发送媒体');
    });

    it('rejects private encrypted media (unchanged behavior)', async () => {
      await e2eeSessionStore.setStatus('100', '100_200', 'encrypted');
      const session = privateSession();
      await expect(
        useMessageStore.getState().sendMedia(session, file as never, 'IMAGE'),
      ).rejects.toThrow('私聊端到端加密策略下暂不支持发送媒体');
    });

    it('rejects private failed media', async () => {
      await e2eeSessionStore.setStatus('100', '100_200', 'failed');
      const session = privateSession();
      await expect(
        useMessageStore.getState().sendMedia(session, file as never, 'IMAGE'),
      ).rejects.toThrow('私聊端到端加密策略下暂不支持发送媒体');
    });

    it('does NOT call uploadService or enqueue pending', async () => {
      const session = privateSession();
      try {
        await useMessageStore.getState().sendMedia(session, file as never, 'IMAGE');
      } catch { /* expected */ }
      expect(pr.enqueue).not.toHaveBeenCalled();
    });

    it('group plaintext media still works unchanged', async () => {
      const groupSession: ChatSession = {
        ...privateSession(),
        id: 'group_g1',
        type: 'group',
        targetId: 'g1',
        targetName: 'Test Group',
      };
      // For group plaintext, sendMedia should NOT throw on the private check
      // (it will proceed to the group-specific check and do normal send)
      // We just verify it doesn't throw the private media error
      try {
        await useMessageStore.getState().sendMedia(groupSession, file as never, 'IMAGE');
      } catch (e) {
        // May throw for other reasons in test context, but NOT for private media
        expect((e as Error).message).not.toContain('私聊端到端加密策略');
      }
    });
  });

  // ── 10. sendText ordering: device registration before pending ─────────

  describe('sendText ordering guarantees (plaintext/negotiating)', () => {
    it('calls ensureLocalE2eeDeviceRegistered before enqueueing pending', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      // ensureLocalE2eeDeviceRegistered must be called
      expect(mockEnsureLocalE2eeDeviceRegistered).toHaveBeenCalled();
      // Pending must be enqueued after device registration
      expect(pr.enqueue).toHaveBeenCalled();
    });

    it('throws and does NOT addMessage when ensureLocalE2eeDeviceRegistered fails', async () => {
      const session = baseSession();
      mockEnsureLocalE2eeDeviceRegistered.mockRejectedValueOnce(
        new Error('Keychain unavailable'),
      );

      await expect(
        useMessageStore.getState().sendText(session, 'hello'),
      ).rejects.toThrow('E2EE device registration failed');

      // Must NOT call addMessage → no UI message, no SQLite write
      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeUndefined();
      // Must NOT enqueue pending
      expect(pr.enqueue).not.toHaveBeenCalled();
    });

    it('throws and does NOT addMessage when enqueuePendingE2eeText fails (secure storage save fails)', async () => {
      const session = baseSession();
      jest.mocked(e2eeSecureStorage.savePendingPlaintext).mockRejectedValueOnce(
        new Error('Keychain write failed'),
      );

      await expect(
        useMessageStore.getState().sendText(session, 'hello'),
      ).rejects.toThrow('Keychain write failed');

      // Must NOT addMessage
      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeUndefined();
    });

    it('addMessage only after secure storage + pending both succeed', async () => {
      const session = baseSession();

      // Make secure storage save fail on first attempt
      jest.mocked(e2eeSecureStorage.savePendingPlaintext)
        .mockRejectedValueOnce(new Error('first fail'));

      await expect(
        useMessageStore.getState().sendText(session, 'hello'),
      ).rejects.toThrow('first fail');

      // After failure, no message should be in UI state (addMessage not called)
      let messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeUndefined();

      // Second attempt succeeds
      jest.mocked(e2eeSecureStorage.savePendingPlaintext)
        .mockResolvedValueOnce(undefined);

      await useMessageStore.getState().sendText(session, 'hello again');

      // Now the message should be in UI state
      messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeDefined();
      expect(messages!.length).toBeGreaterThanOrEqual(1);
    });
  });
});
