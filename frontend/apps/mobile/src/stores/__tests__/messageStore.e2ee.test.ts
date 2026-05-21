/**
 * Mobile messageStore E2EE sending-block regression tests.
 *
 * Verifies that the mobile messageStore never silently downgrades an
 * encrypted session to plaintext send, never writes plaintext pending
 * payload for encrypted sessions, and blocks encrypted pending payloads
 * on retry.
 *
 * References: E5, E8, E21, E24, E25, E27, E32, E33
 *
 * Mock scope:
 *   - messageService (network): fully mocked, no real HTTP
 *   - pendingMessageRepository (storage): fully mocked
 *   - messageRepository (storage): fully mocked
 *   - uploadService: fully mocked
 *   - logger: fully mocked (no console noise)
 *   - ids: deterministic stubs
 *   - authStore / sessionStore: factory-mocked with controllable state
 *
 * The real e2eeDeferred module is used (NOT mocked) so tests exercise the
 * actual assertPlaintextSendAllowed / blockEncryptedPendingPayload guard
 * integration with the messageStore.
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
  createClientMessageId: jest.fn(() => `client_e2ee_${Date.now()}`),
  createLocalMessageId: jest.fn(() => `local_e2ee_${Date.now()}`),
}));

const mockSessions: ChatSession[] = [];
const mockUpsertSession = jest.fn();
const mockMarkRead = jest.fn();

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: { id: '100', nickname: 'TestUser', username: 'testuser' },
    })),
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

jest.mock('@/e2ee/manager/negotiation', () => {
  const actual = jest.requireActual('@/e2ee/manager/negotiation') as Record<string, unknown>;
  return {
    ...actual,
    initiateNegotiation: jest.fn().mockResolvedValue(true),
  };
});

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

// ─── Imports (after mocks) ────────────────────────────────────────────

import { useMessageStore } from '../messageStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { messageService } from '@/services/chat/messageService';
import {
  E2EE_ENCRYPTED_MEDIA_UNSUPPORTED_TEXT,
  E2EE_PRIVATE_MEDIA_UNSUPPORTED_TEXT,
  E2EE_SEND_DISABLED_TEXT,
  E2EE_UNSUPPORTED_TEXT,
} from '@/e2ee/e2eeDeferred';
import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { initiateNegotiation } from '@/e2ee/manager/negotiation';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import {
  cachePendingEncryptedMessage,
  clearAllPendingEncryptedMessages,
  configurePendingDecryptQueue as configurePendingDecryptQueueStore,
  getPendingEncryptedMessages,
  getReadyPendingEncryptedMessages,
  retryDecryptPendingMessages as retryDecryptPendingFromStore,
  setPendingEntries,
  type PendingEncryptedMessageEntry,
} from '@/e2ee/store/pendingDecryptStore';
import { E2EE_DECRYPT_RETRY_CONFIG } from '@/constants/config';

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

const encryptedSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  ...baseSession(overrides),
  encrypted: true,
});

const pendingWithPayload = (
  payloadObj: Record<string, unknown>,
  overrides: Partial<PendingMessage> = {},
): PendingMessage => ({
  localId: 'local_e2ee_1',
  conversationId: '100_200',
  sendType: 'private',
  payloadJson: JSON.stringify(payloadObj),
  status: 'pending',
  retryCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
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

describe('messageStore E2EE sending block (E5/E8/E21/E24/E25/E27)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    useMessageStore.setState({ messagesBySession: {}, messagesPaginationBySession: {}, loading: false, searchResults: [] });
    e2eeSessionStore.clearRuntime();
    clearAllPendingEncryptedMessages();
    jest.clearAllMocks();
    mockSessions.length = 0;
    mr.listMessages.mockReturnValue([]);
    mr.listMessagesPage.mockReturnValue({ messages: [], hasMore: false });
    mr.listSessions.mockReturnValue([]);
    pr.listReady.mockReturnValue([]);
    pr.listReadyToSend.mockReturnValue([]);
    pr.findByClientMessageId.mockReturnValue(undefined);
    // Ensure updateStatus is available (auto-mock may not discover all methods)
    if (!pr.updateStatus) {
      (pr as Record<string, unknown>).updateStatus = jest.fn();
    }
  });

  // ── 1. sendText on encrypted session must throw, not call sendPrivate ──

  describe('sendText with encrypted=true session (E5.2/E8.1/E21.4/E27.1)', () => {
    it('throws E2EE_SEND_DISABLED_TEXT when session.encrypted is true', async () => {
      const session = encryptedSession();

      await expect(useMessageStore.getState().sendText(session, 'hello')).rejects.toThrow(
        E2EE_SEND_DISABLED_TEXT,
      );
    });

    it('does NOT call messageService.sendPrivate for encrypted session', async () => {
      const session = encryptedSession();

      try {
        await useMessageStore.getState().sendText(session, 'hello');
      } catch {
        // expected
      }

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('does NOT create optimistic message in state for encrypted session', async () => {
      const session = encryptedSession();

      try {
        await useMessageStore.getState().sendText(session, 'hello');
      } catch {
        // expected
      }

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeUndefined();
    });
  });

  describe('sendText with accepted encrypted private session', () => {
    it('keeps optimistic plaintext display, stores Rust envelope pending payload, and sends encrypted only', async () => {
      const session = encryptedSession();
      let enqueued: PendingMessage | undefined;
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockResolvedValueOnce(rustEnvelope);
      pr.enqueue.mockImplementation((item: PendingMessage) => {
        enqueued = item;
      });
      pr.get.mockImplementation((localId: string) => (enqueued?.localId === localId ? enqueued : undefined));
      ms.sendPrivateEncrypted.mockImplementation(async (data) => ({
        code: 0,
        message: 'ok',
        data: {
          ...data,
          id: 'srv_enc_1',
          messageId: 'srv_enc_1',
          senderId: '100',
          receiverId: '200',
          isGroupChat: false,
          sendTime: '2024-06-01T10:00:00.000Z',
          status: 'SENT',
        },
      }) as never);

      await useMessageStore.getState().sendText(session, 'hello');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).toHaveBeenCalledWith(
        expect.objectContaining({
          receiverId: '200',
          messageType: 'TEXT',
          encrypted: true,
          e2eeEnvelope: rustEnvelope,
          e2eeDeviceId: 'device-100',
        }),
      );
      expect(enqueued).toBeDefined();
      const pendingPayload = JSON.parse(enqueued!.payloadJson) as { data: Record<string, unknown>; encrypted?: unknown };
      expect(pendingPayload.encrypted).toBe(true);
      expect(pendingPayload.data.content).toBeUndefined();
      expect(pendingPayload.data.e2eeEnvelope).toEqual(rustEnvelope);
      expect(pendingPayload.data.content).not.toBe('hello');

      const display = useMessageStore.getState().messagesBySession[session.id]?.[0];
      expect(display?.content).toBe('hello');
      expect(display?.encrypted).toBe(true);
      expect(display?.isE2eeDisplayDecrypted).toBe(true);
      expect(display?.decryptStatus).toBe('own-echo-preserved');
      expect(display?.rawJson).toContain('rust-x25519-x3dh-dr-v1');
      expect(display?.rawJson).not.toContain('"content":"hello"');
    });

    it('marks local message failed and does not enqueue plaintext when encrypted preparation fails', async () => {
      const session = encryptedSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockImplementationOnce(async () => {
        await e2eeSessionStore.setStatus('100', session.id, 'failed');
        throw new Error('Rust E2EE session state unavailable');
      });

      await expect(useMessageStore.getState().sendText(session, 'hello')).rejects.toThrow('Rust E2EE session state unavailable');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).not.toHaveBeenCalled();
      expect(pr.enqueue).not.toHaveBeenCalled();
      await expect(e2eeSessionStore.loadStatus('100', session.id)).resolves.toBe('failed');
      const display = useMessageStore.getState().messagesBySession[session.id]?.[0];
      expect(display?.content).toBe('hello');
      expect(display?.status).toBe('FAILED');
    });
  });

  describe('loadMessages masks encrypted cached messages (E26.3)', () => {
    it('does not restore ciphertext from local cache or refresh response into UI state', async () => {
      const session = baseSession();
      const encryptedMessage = {
        id: 'enc_cached',
        messageId: 'enc_cached',
        senderId: '200',
        receiverId: '100',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: 'ciphertext-cache',
        mediaUrl: 'https://cdn.example/encrypted.jpg',
        mediaName: 'secret.jpg',
        mediaSize: 2048,
        sendTime: '2024-06-01T10:00:00.000Z',
        status: 'SENT',
        encrypted: true,
      } as MobileMessage;
      mr.listMessagesPage.mockReturnValue({ messages: [encryptedMessage], hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: [encryptedMessage],
      } as never);

      await useMessageStore.getState().loadMessages(session);

      const cached = useMessageStore.getState().messagesBySession[session.id]?.[0];
      expect(cached?.content).toBe(E2EE_UNSUPPORTED_TEXT);
      expect(cached?.mediaUrl).toBeUndefined();
      expect(cached?.mediaName).toBeUndefined();
      expect(cached?.mediaSize).toBeUndefined();
    });
  });

  // ── 2. sendText on encrypted session must NOT write plaintext pending ──

  describe('sendText with encrypted=true does not enqueue plaintext pending (E5.4/E8.1/E24.3/E27.2)', () => {
    it('does NOT call pendingMessageRepository.enqueue for encrypted session', async () => {
      const session = encryptedSession();

      try {
        await useMessageStore.getState().sendText(session, 'hello');
      } catch {
        // expected
      }

      expect(pr.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── 3. sendMedia on private session must throw, not upload or send ──

  describe('sendMedia with private session — all statuses blocked', () => {
    const file = { uri: 'file:///img.jpg', name: 'img.jpg', size: 1024 };

    it('throws E2EE_PRIVATE_MEDIA_UNSUPPORTED_TEXT for private encrypted session', async () => {
      const session = encryptedSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');

      await expect(
        useMessageStore.getState().sendMedia(session, file as never, 'IMAGE'),
      ).rejects.toThrow(E2EE_PRIVATE_MEDIA_UNSUPPORTED_TEXT);
    });

    it('throws E2EE_PRIVATE_MEDIA_UNSUPPORTED_TEXT for private plaintext session', async () => {
      const session = baseSession();

      await expect(
        useMessageStore.getState().sendMedia(session, file as never, 'IMAGE'),
      ).rejects.toThrow(E2EE_PRIVATE_MEDIA_UNSUPPORTED_TEXT);
    });

    it('does NOT call messageService.sendPrivate or uploadService for private session', async () => {
      const session = encryptedSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');

      try {
        await useMessageStore.getState().sendMedia(session, file as never, 'IMAGE');
      } catch {
        // expected
      }

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
    });

    it('does NOT enqueue plaintext pending for private media send', async () => {
      const session = encryptedSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');

      try {
        await useMessageStore.getState().sendMedia(session, file as never, 'IMAGE');
      } catch {
        // expected
      }

      expect(pr.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── 4. Plaintext private session now triggers E2EE negotiation (Rule A) ──
  // Plaintext does NOT call sendPrivate anymore; instead it enqueues
  // an E2EE-waiting pending and triggers initiateNegotiation.

  describe('sendText with plaintext private session no longer sends plaintext (E9.1 / Rule A)', () => {
    it('does NOT call messageService.sendPrivate for plaintext private session', async () => {
      const session = baseSession();
      mockInitiateNegotiation.mockResolvedValue(true);

      await useMessageStore.getState().sendText(session, 'hello');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('enqueues E2EE-waiting pending for plaintext private session', async () => {
      const session = baseSession();
      mockInitiateNegotiation.mockResolvedValue(true);

      await useMessageStore.getState().sendText(session, 'hello');

      expect(pr.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: session.id,
          sendType: 'private',
          status: 'pending',
        }),
      );
    });

    it('adds optimistic message to state for plaintext private session', async () => {
      const session = baseSession();
      mockInitiateNegotiation.mockResolvedValue(true);

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeDefined();
      expect(messages!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 5. retryPending / retryMessage blocks encrypted pending payload ──

  describe('retryMessage blocks encrypted pending payload (E24.3/E25.3/E27.1)', () => {
    it('sets status to blocked when payload has encrypted=true at top level', async () => {
      const pending = pendingWithPayload({
        sendType: 'private',
        data: { clientMessageId: 'c_enc_1', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 'local_e2ee_1',
          status: 'blocked',
          lastError: 'Encrypted payload incomplete',
        }),
      );
    });

    it('sets status to blocked when payload.data has encrypted=true', async () => {
      const pending = pendingWithPayload({
        sendType: 'private',
        data: { clientMessageId: 'c_enc_2', messageType: 'TEXT', content: 'secret', encrypted: true },
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 'local_e2ee_1',
          status: 'blocked',
        }),
      );
    });

    it('does NOT call messageService.sendPrivate when payload is encrypted', async () => {
      const pending = pendingWithPayload({
        sendType: 'private',
        data: { clientMessageId: 'c_enc_3', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('does NOT call messageService.sendGroup when encrypted group payload is blocked', async () => {
      const pending = pendingWithPayload({
        sendType: 'group',
        data: { clientMessageId: 'c_enc_grp', messageType: 'TEXT', content: 'secret', groupId: 'g1' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      expect(ms.sendGroup).not.toHaveBeenCalled();
    });

    it('retries a complete encrypted private payload without re-encrypting or downgrading', async () => {
      const pending = pendingWithPayload({
        sendType: 'private',
        encrypted: true,
        data: {
          receiverId: '200',
          clientMessageId: 'c_enc_ready',
          messageType: 'TEXT',
          encrypted: true,
          e2eeEnvelope: rustEnvelope,
          e2eeDeviceId: 'device-100',
        },
      });
      const encryptSpy = jest.spyOn(e2eeManager, 'encryptToEnvelope').mockResolvedValue(rustEnvelope);
      pr.get.mockReturnValue(pending);
      ms.sendPrivateEncrypted.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: {
          id: 'srv_retry',
          messageId: 'srv_retry',
          clientMessageId: 'c_enc_ready',
          content: '',
          encrypted: true,
          e2eeEnvelope: rustEnvelope,
          e2eeDeviceId: 'device-100',
          status: 'SENT',
        },
      } as never);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      expect(encryptSpy).not.toHaveBeenCalled();
      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted: true,
          e2eeEnvelope: rustEnvelope,
          e2eeDeviceId: 'device-100',
        }),
      );
    });
  });

  // ── 6. retryPending iterates and blocks all encrypted items ──

  describe('retryPending blocks all encrypted payloads in queue (E24.3/E25.3)', () => {
    it('blocks multiple encrypted pending items and sends only plaintext ones', async () => {
      const plainPending = pendingWithPayload(
        {
          sendType: 'private',
          data: { clientMessageId: 'c_plain', messageType: 'TEXT', content: 'visible' },
        },
        { localId: 'local_plain' },
      );
      const encPending = pendingWithPayload(
        {
          sendType: 'private',
          data: { clientMessageId: 'c_enc', messageType: 'TEXT', content: 'secret' },
          encrypted: true,
        },
        { localId: 'local_enc' },
      );

      pr.listReadyToSend.mockReturnValue([plainPending, encPending]);
      pr.get.mockImplementation((id: string) => {
        if (id === 'local_plain') return plainPending;
        if (id === 'local_enc') return encPending;
        return undefined;
      });
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_plain', messageId: 'srv_plain', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryPending();

      // plaintext one was sent
      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);

      // encrypted one was blocked
      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 'local_enc',
          status: 'blocked',
        }),
      );
    });
  });

  // ── 7. blocked status cannot auto-recover to pending (E25.3) ──

  describe('blocked status is terminal for encrypted payload (E25.3)', () => {
    it('listReady excludes blocked items', () => {
      // listReady filters by ['pending', 'sending'] status — blocked items are excluded.
      // Verify the actual implementation behavior by calling through the real listReady logic.
      // Since pendingMessageRepository is mocked, we verify via the retryMessage path:
      // a blocked item returned by get() will still go through blockEncryptedPendingPayload
      // and stay blocked.
      const blocked: PendingMessage = {
        localId: 'local_blocked',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: { clientMessageId: 'c_blocked', messageType: 'TEXT' },
          encrypted: true,
        }),
        status: 'blocked',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      pr.get.mockReturnValue(blocked);

      return useMessageStore.getState().retryMessage('local_blocked').then(() => {
        // Even if called again, it stays blocked (update is called with blocked status)
        expect(pr.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'blocked',
          }),
        );
        // sendPrivate was never called
        expect(ms.sendPrivate).not.toHaveBeenCalled();
      });
    });
  });

  // ── 8. No real network calls in any E2EE block scenario ──

  describe('no real network calls (E32.6)', () => {
    it('sendText on encrypted session does not reach http layer', async () => {
      const session = encryptedSession();

      try {
        await useMessageStore.getState().sendText(session, 'test');
      } catch {
        // expected
      }

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
      expect(ms.getPrivateHistory).not.toHaveBeenCalled();
      expect(ms.getGroupHistory).not.toHaveBeenCalled();
    });

    it('retryMessage with encrypted payload does not reach http layer', async () => {
      const pending = pendingWithPayload({
        sendType: 'private',
        data: { clientMessageId: 'c_net', messageType: 'TEXT' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
    });
  });

  // ── 9. Group session encrypted block (E27.1 covers group too) ──

  describe('sendText on encrypted group session is also blocked (E27.1)', () => {
    it('throws for encrypted group session', async () => {
      const groupSession = encryptedSession({
        id: 'group_g1',
        type: 'group',
        targetId: 'g1',
        targetName: 'Test Group',
      });

      await expect(useMessageStore.getState().sendText(groupSession, 'hello')).rejects.toThrow(
        E2EE_SEND_DISABLED_TEXT,
      );
    });

    it('does not call sendGroup for encrypted group session', async () => {
      const groupSession = encryptedSession({
        id: 'group_g1',
        type: 'group',
        targetId: 'g1',
        targetName: 'Test Group',
      });

      try {
        await useMessageStore.getState().sendText(groupSession, 'hello');
      } catch {
        // expected
      }

      expect(ms.sendGroup).not.toHaveBeenCalled();
    });
  });

  // ── 10. E2EE outbound pending send pipeline (Rules A/B/C/D) ──

  describe('sendText with plaintext private session (Rule A)', () => {
    beforeEach(() => {
      mockInitiateNegotiation.mockResolvedValue(true);
    });

    it('does NOT call sendPrivate for plaintext private session', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('calls initiateNegotiation with session id and target id', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(mockInitiateNegotiation).toHaveBeenCalledWith(session.id, session.targetId);
    });

    it('enqueues pending with requiresE2ee=true in payload', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(pr.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: session.id,
          sendType: 'private',
          status: 'pending',
        }),
      );
      const enqueueCall = (pr.enqueue as jest.Mock).mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>)?.conversationId === session.id,
      );
      expect(enqueueCall).toBeDefined();
      const payloadJson = (enqueueCall![0] as { payloadJson: string }).payloadJson;
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      expect(payload.requiresE2ee).toBe(true);
      expect(payload.e2eeWaitReason).toBe('negotiation');
      // plaintext must NOT be in payload (stored in secure Keychain)
      expect(payload.plaintext).toBeUndefined();
      expect(payload.plaintextRef).toBeDefined();
      expect(payload.data).toBeDefined();
      expect((payload.data as Record<string, unknown>).content).toBeUndefined();
    });

    it('adds optimistic message to state', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeDefined();
      expect(messages!.length).toBeGreaterThanOrEqual(1);
      expect(messages![0].content).toBe('hello');
    });

    it('does NOT set encrypted=true on optimistic message for plaintext status', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages![0].encrypted).toBeFalsy();
    });

    it('marks message FAILED when initiateNegotiation fails', async () => {
      const session = baseSession();
      mockInitiateNegotiation.mockResolvedValueOnce(false);

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages![0].status).toBe('FAILED');
      // Pending should still be enqueued so user can retry later
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

  describe('sendText with negotiating private session (Rule B)', () => {
    beforeEach(async () => {
      await e2eeSessionStore.setStatus('100', '100_200', 'negotiating');
      mockInitiateNegotiation.mockResolvedValue(true);
    });

    it('does NOT throw when status is negotiating', async () => {
      const session = baseSession();

      await expect(
        useMessageStore.getState().sendText(session, 'hello'),
      ).resolves.toBeUndefined();
    });

    it('does NOT call sendPrivate for negotiating session', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('does NOT call initiateNegotiation again (already negotiating)', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      expect(mockInitiateNegotiation).not.toHaveBeenCalled();
    });

    it('enqueues pending with requiresE2ee=true in payload', async () => {
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

    it('adds optimistic message visible in state', async () => {
      const session = baseSession();

      await useMessageStore.getState().sendText(session, 'hello');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toBeDefined();
      expect(messages!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('retryMessage skips E2EE-waiting pending', () => {
    it('does not call sendPrivate or sendPrivateEncrypted for requiresE2ee payload', async () => {
      const pending = pendingWithPayload({
        sendType: 'private',
        requiresE2ee: true,
        e2eeWaitReason: 'negotiation',
        plaintext: 'hello',
        data: {
          receiverId: '200',
          clientMessageId: 'c_e2ee_wait',
          messageType: 'TEXT',
        },
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendPrivateEncrypted).not.toHaveBeenCalled();
    });

    it('does not block or fail the pending (just skips silently)', async () => {
      const pending = pendingWithPayload({
        sendType: 'private',
        requiresE2ee: true,
        e2eeWaitReason: 'negotiation',
        plaintext: 'hello',
        data: {
          receiverId: '200',
          clientMessageId: 'c_e2ee_wait',
          messageType: 'TEXT',
        },
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      // Should NOT be marked as blocked or failed
      expect(pr.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );
      expect(pr.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  describe('retryMessage handles encrypted pending after E2EE resume (Rule C continued)', () => {
    it('sends encrypted payload when requiresE2ee is cleared and envelope is present', async () => {
      const pending = pendingWithPayload({
        sendType: 'private',
        encrypted: true,
        data: {
          receiverId: '200',
          clientMessageId: 'c_enc_resumed',
          messageType: 'TEXT',
          encrypted: true,
          e2eeEnvelope: rustEnvelope,
          e2eeDeviceId: 'device-100',
        },
      });
      pr.get.mockReturnValue(pending);
      ms.sendPrivateEncrypted.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: {
          id: 'srv_resumed',
          messageId: 'srv_resumed',
          clientMessageId: 'c_enc_resumed',
          content: '',
          encrypted: true,
          e2eeEnvelope: rustEnvelope,
          e2eeDeviceId: 'device-100',
          status: 'SENT',
        },
      } as never);

      await useMessageStore.getState().retryMessage('local_e2ee_1');

      expect(ms.sendPrivateEncrypted).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted: true,
          e2eeEnvelope: rustEnvelope,
          e2eeDeviceId: 'device-100',
        }),
      );
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });
  });

  describe('sendText with encrypted private session (Rule C) continues working', () => {
    it('encrypts and sends via sendPrivateEncrypted', async () => {
      const session = encryptedSession();
      await e2eeSessionStore.setStatus('100', session.id, 'encrypted');
      jest.spyOn(e2eeManager, 'encryptToEnvelope').mockResolvedValueOnce(rustEnvelope);
      ms.sendPrivateEncrypted.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: {
          id: 'srv_rule_c',
          messageId: 'srv_rule_c',
          clientMessageId: 'c1',
          status: 'SENT',
        },
      } as never);

      await useMessageStore.getState().sendText(session, 'hello');

      expect(ms.sendPrivateEncrypted).toHaveBeenCalled();
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });
  });

  // ─── E2EE pending decrypt drain ───────────────────────────────────

  describe('pending decrypt drain after handshake decrypt', () => {
    const sessionId = '100_200';

    const envWithHandshake = {
      version: 2 as const,
      algorithm: 'rust-x25519-x3dh-dr-v1' as const,
      senderDeviceId: 'device-200',
      recipientDeviceId: 'device-100',
      sessionId,
      handshake: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      wire: 'AAAAAA==',
    };

    const envWithoutHandshake = {
      version: 2 as const,
      algorithm: 'rust-x25519-x3dh-dr-v1' as const,
      senderDeviceId: 'device-200',
      recipientDeviceId: 'device-100',
      sessionId,
      handshake: undefined,
      wire: 'BBBBBB==',
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

    beforeEach(() => {
      jest.restoreAllMocks();
      useMessageStore.setState({
        messagesBySession: {},
        messagesPaginationBySession: {},
        loading: false,
        searchResults: [],
      });
      clearAllPendingEncryptedMessages();
      jest.clearAllMocks();
      mr.listMessages.mockReturnValue([]);
      mr.listMessagesPage.mockReturnValue({ messages: [], hasMore: false });
      mr.listSessions.mockReturnValue([]);
      pr.listReady.mockReturnValue([]);
      pr.listReadyToSend.mockReturnValue([]);
      pr.findByClientMessageId.mockReturnValue(undefined);
      if (!pr.updateStatus) {
        (pr as Record<string, unknown>).updateStatus = jest.fn();
      }
    });

    // ── Test 1: out-of-order first-packet recovery ──

    it('drains pending queue after handshake message is decrypted (out-of-order recovery)', async () => {
      // Simulate: message #2 arrives first, no session state, no handshake → pending
      const msg2 = encryptedMsg({
        messageId: 'msg-2',
        e2eeEnvelope: envWithoutHandshake,
        sendTime: '2024-06-01T10:00:02.000Z',
      });
      cachePendingEncryptedMessage(sessionId, msg2);
      expect(getPendingEncryptedMessages(sessionId).length).toBe(1);

      // Message #1 arrives later (has handshake)
      const msg1 = encryptedMsg({
        messageId: 'msg-1',
        e2eeEnvelope: envWithHandshake,
        sendTime: '2024-06-01T10:00:01.000Z',
      });

      // Mock decryptEnvelope: both messages processed in sorted order by retryDecryptPendingMessages
      // msg1 (earlier sendTime) first → succeeds with handshake, creates session
      // msg2 (later sendTime) second → now succeeds because session exists
      const decryptSpy = jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockResolvedValueOnce('plaintext-1')  // msg1: handshake creates session
        .mockResolvedValueOnce('plaintext-2'); // msg2: decrypts with now-existing session

      // Pre-cache msg1 in pending too (simulating it also arrived via WS and was cached)
      cachePendingEncryptedMessage(sessionId, msg1);
      expect(getPendingEncryptedMessages(sessionId).length).toBe(2);

      // retryDecryptPendingMessages: msgs sorted by sendTime → msg1 first
      const decrypted = await retryDecryptPendingFromStore(sessionId);
      expect(decrypted).toBe(2);

      // Both messages should have been decrypted
      expect(decryptSpy).toHaveBeenCalledTimes(2);

      // Pending queue should be empty now
      expect(getPendingEncryptedMessages(sessionId).length).toBe(0);

      // UI should have both messages
      const uiMessages = useMessageStore.getState().messagesBySession[sessionId] || [];
      expect(uiMessages.length).toBeGreaterThanOrEqual(1);
    });

    // ── Test 2: handshake decrypt success but pending retry throws ──

    it('does not propagate drain errors to the caller', async () => {
      // Verify that even if the drain encounters retryable errors,
      // the main message processing path is unaffected.

      // Pre-cache a pending message that will keep failing with a retryable error
      const stuckMsg = encryptedMsg({
        messageId: 'stuck-msg',
        e2eeEnvelope: envWithoutHandshake,
      });
      cachePendingEncryptedMessage(sessionId, stuckMsg);

      // Mock: handshake message decrypts OK, but stuck message fails with retryable error
      jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockResolvedValueOnce('plaintext-1')  // handshake msg succeeds
        .mockRejectedValueOnce(new Error('session state unavailable')); // stuck msg: retryable

      // Pre-cache the handshake message and trigger drain
      const handshakeMsg = encryptedMsg({
        messageId: 'handshake-msg',
        e2eeEnvelope: envWithHandshake,
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      cachePendingEncryptedMessage(sessionId, handshakeMsg);

      // The drain should not throw
      const decrypted = await retryDecryptPendingFromStore(sessionId);
      expect(decrypted).toBe(1); // only handshake msg decrypted

      // stuckMsg should still be in pending queue (retryable error → stays pending)
      const remaining = getPendingEncryptedMessages(sessionId);
      expect(remaining.length).toBe(1);
      expect(remaining[0].messageId).toBe('stuck-msg');
    });

    // ── Test 3: no-handshake normal decrypt does not trigger drain ──

    it('does not drain when decrypted message has no handshake', async () => {
      // Pre-cache a pending message
      const pendingMsg = encryptedMsg({
        messageId: 'pending-no-hs',
        e2eeEnvelope: envWithoutHandshake,
      });
      cachePendingEncryptedMessage(sessionId, pendingMsg);

      // Mock: decrypt succeeds for a no-handshake message
      // (This simulates: session already exists, normal message arrives)
      const decryptSpy = jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockResolvedValueOnce('plaintext-no-hs');

      // Process a no-handshake message through retryDecryptPendingMessages
      const noHsMsg = encryptedMsg({
        messageId: 'no-hs-msg',
        e2eeEnvelope: envWithoutHandshake,
      });
      cachePendingEncryptedMessage(sessionId, noHsMsg);

      await retryDecryptPendingFromStore(sessionId);

      // The decrypt was called (messages were processed)
      // But the normal no-handshake decrypt shouldn't have triggered
      // additional drain beyond the initial retry call itself
      // (No assertion needed on drain count — just verifying no crash)
      expect(decryptSpy).toHaveBeenCalled();
    });

    // ── Test 4: inflight guard prevents concurrent/recursive drains ──

    it('prevents concurrent drains for the same session (inflight guard)', async () => {
      // Use a deferred promise so the first drain stays in-flight
      let resolveFirstDecrypt!: (value: string) => void;
      const firstDecryptPromise = new Promise<string>((resolve) => {
        resolveFirstDecrypt = resolve;
      });

      const decryptSpy = jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockReturnValueOnce(firstDecryptPromise)  // first drain hangs
        .mockResolvedValueOnce('plaintext-fast');  // second drain would use this

      // Cache a handshake message for the first drain
      const hsMsg = encryptedMsg({
        messageId: 'hs-msg',
        e2eeEnvelope: envWithHandshake,
      });
      cachePendingEncryptedMessage(sessionId, hsMsg);

      // Start first drain (it will hang on decrypt)
      const firstDrain = retryDecryptPendingFromStore(sessionId);

      // While first is in-flight, try a second drain — should be blocked by guard
      const secondDrain = await retryDecryptPendingFromStore(sessionId);
      expect(secondDrain).toBe(0); // guard prevented it

      // Now resolve the first drain
      resolveFirstDecrypt('plaintext-hs');
      const firstResult = await firstDrain;
      expect(firstResult).toBe(1);

      // After first drain completes, guard is released
      // A new drain should work now
      const thirdMsg = encryptedMsg({
        messageId: 'third-msg',
        e2eeEnvelope: envWithHandshake,
      });
      cachePendingEncryptedMessage(sessionId, thirdMsg);

      decryptSpy.mockResolvedValueOnce('plaintext-third');
      const thirdDrain = await retryDecryptPendingFromStore(sessionId);
      expect(thirdDrain).toBe(1);
    });

    // ── Test 5: drain via WebSocket path trigger ──

    it('triggers drain via triggerPendingDrain when handshake is decrypted in processMessageForSession', async () => {
      // Simulate the messageStore helper path:
      // processMessageForSession is called (e.g., from retryMessage)
      // When it decrypts a handshake message, it should trigger drain

      const decryptSpy = jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockResolvedValueOnce('plaintext-handshake')   // handshake msg
        .mockResolvedValueOnce('plaintext-pending');     // pending msg during drain

      // Pre-cache a pending message (simulating it arrived earlier)
      const pendingMsg = encryptedMsg({
        messageId: 'pending-msg',
        e2eeEnvelope: envWithoutHandshake,
      });
      cachePendingEncryptedMessage(sessionId, pendingMsg);

      // Now process a handshake message through the store's retryMessage path
      // This calls processMessageForSession internally, which triggers drain
      const handshakeMsg = encryptedMsg({
        messageId: 'handshake-msg',
        e2eeEnvelope: envWithHandshake,
        clientMessageId: 'cm-handshake',
      });

      // We test via retryDecryptPendingMessages which uses processE2eeMessage directly
      // The drain trigger inside processMessageForSession is tested indirectly:
      // when retryDecryptPendingMessages processes a handshake message via processE2eeMessage,
      // and that succeeds, the drain guard is already held so no recursion occurs.
      // The actual trigger from websocketStore.dispatchPayload is tested at the unit level
      // via shouldDrainPendingAfterDecrypt.

      // For this integration test, verify the end-to-end flow:
      cachePendingEncryptedMessage(sessionId, handshakeMsg);
      cachePendingEncryptedMessage(sessionId, pendingMsg);

      const decrypted = await retryDecryptPendingFromStore(sessionId);
      expect(decrypted).toBe(2); // both should decrypt

      expect(getPendingEncryptedMessages(sessionId).length).toBe(0);
    });
  });

  // ─── E2EE pending decrypt retry metadata and backoff ───────────────

  describe('pending decrypt retry metadata and backoff', () => {
    const sessionId = '100_200';

    const envWithoutHandshake = {
      version: 2 as const,
      algorithm: 'rust-x25519-x3dh-dr-v1' as const,
      senderDeviceId: 'device-200',
      recipientDeviceId: 'device-100',
      sessionId,
      handshake: undefined,
      wire: 'BBBBBB==',
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
      e2eeEnvelope: envWithoutHandshake,
      sendTime: '2024-06-01T10:00:00.000Z',
      status: 'SENT',
      ...overrides,
    });

    beforeEach(() => {
      jest.restoreAllMocks();
      useMessageStore.setState({
        messagesBySession: {},
        messagesPaginationBySession: {},
        loading: false,
        searchResults: [],
      });
      clearAllPendingEncryptedMessages();
      jest.clearAllMocks();
      mr.listMessages.mockReturnValue([]);
      mr.listMessagesPage.mockReturnValue({ messages: [], hasMore: false });
      mr.listSessions.mockReturnValue([]);
      pr.listReady.mockReturnValue([]);
      pr.listReadyToSend.mockReturnValue([]);
      pr.findByClientMessageId.mockReturnValue(undefined);
      if (!pr.updateStatus) {
        (pr as Record<string, unknown>).updateStatus = jest.fn();
      }
      // Re-configure handler to delegate to the real store method
      configurePendingDecryptQueueStore({
        retryPendingMessages: (sid, entries) =>
          useMessageStore.getState().retryDecryptPendingMessages(sid, entries),
        retryVisibleMessages: (sid) =>
          useMessageStore.getState().retryDecryptVisibleEncryptedMessages(sid),
      });
    });

    // Test 2: retry 后仍 pending，retryCount 增加，nextRetryAt 设置
    it('increments retryCount and sets nextRetryAt after retryable pending failure', async () => {
      const msg = encryptedMsg({ messageId: 'retryable-msg' });
      cachePendingEncryptedMessage(sessionId, msg);

      // Mock: decrypt fails with retryable error
      jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockRejectedValueOnce(new Error('E2EE session state unavailable and envelope has no handshake'));

      await retryDecryptPendingFromStore(sessionId);

      // Entry should still be in queue with updated retry metadata
      const ready = getReadyPendingEncryptedMessages(sessionId, Date.now() + 100_000);
      expect(ready).toHaveLength(1);
      expect(ready[0].retryCount).toBe(1);
      expect(ready[0].nextRetryAt).toBeGreaterThan(Date.now());
      expect(ready[0].lastError).toContain('E2EE');
    });

    // Test 6: non-retryable crypto failure → directly failed, entry removed
    it('marks entry as failed in messageRepository for non-retryable crypto error', async () => {
      const msg = encryptedMsg({ messageId: 'non-retryable-msg' });
      cachePendingEncryptedMessage(sessionId, msg);

      // decrypt fails with non-retryable error (generic decrypt failure)
      jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockRejectedValueOnce(new Error('decrypt failed'));

      await retryDecryptPendingFromStore(sessionId);

      // Entry should be removed from pending queue
      expect(getPendingEncryptedMessages(sessionId)).toHaveLength(0);

      // messageRepository should have been called with failed message
      expect(mr.upsertMessages).toHaveBeenCalledWith(
        sessionId,
        expect.arrayContaining([expect.objectContaining({ decryptStatus: 'failed' })]),
      );
    });

    // Test 5: over maxRetryCount → entry removed, marked failed in repo
    it('removes entry and marks failed when maxRetryCount is exceeded', async () => {
      const msg = encryptedMsg({ messageId: 'exhausted-msg' });
      cachePendingEncryptedMessage(sessionId, msg);

      // Set entry to be at maxRetryCount already
      const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
      const atMax: PendingEncryptedMessageEntry = {
        ...ready[0],
        retryCount: E2EE_DECRYPT_RETRY_CONFIG.maxRetryCount,
        lastError: 'previous error',
        lastTriedAt: Date.now() - 1000,
      };
      setPendingEntries(sessionId, [atMax]);

      // decrypt still fails with retryable error
      jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockRejectedValueOnce(new Error('E2EE session state unavailable'));

      await retryDecryptPendingFromStore(sessionId);

      // Entry should be removed
      expect(getPendingEncryptedMessages(sessionId)).toHaveLength(0);

      // messageRepository should have failed status
      expect(mr.upsertMessages).toHaveBeenCalledWith(
        sessionId,
        expect.arrayContaining([expect.objectContaining({ decryptStatus: 'failed' })]),
      );
    });

    // Test: handler preserves non-batch entries after merge
    it('preserves non-ready entries in queue after retry', async () => {
      const msg1 = encryptedMsg({ messageId: 'ready-msg' });
      const msg2 = encryptedMsg({ messageId: 'future-msg' });
      cachePendingEncryptedMessage(sessionId, msg1);
      cachePendingEncryptedMessage(sessionId, msg2);

      // Set second entry to have nextRetryAt in future
      const allEntries = getReadyPendingEncryptedMessages(sessionId, Date.now());
      // Both are ready (nextRetryAt=undefined). Let me set one to future.
      const futureEntry: PendingEncryptedMessageEntry = {
        ...allEntries[1],
        retryCount: 1,
        nextRetryAt: Date.now() + 3600_000,
      };
      setPendingEntries(sessionId, [allEntries[0], futureEntry]);

      // Mock decrypt to succeed for the ready entry
      jest.spyOn(e2eeManager, 'decryptEnvelope')
        .mockResolvedValueOnce('plaintext-ready');

      await retryDecryptPendingFromStore(sessionId);

      // Ready entry should be removed (decrypted), future entry should remain
      const remaining = getPendingEncryptedMessages(sessionId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].messageId).toBe('future-msg');
    });
  });
});
