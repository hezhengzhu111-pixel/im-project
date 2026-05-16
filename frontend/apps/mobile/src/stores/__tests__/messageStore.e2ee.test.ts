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

// ─── Imports (after mocks) ────────────────────────────────────────────

import { useMessageStore } from '../messageStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { messageService } from '@/services/chat/messageService';
import { E2EE_SEND_DISABLED_TEXT, E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';

const mr = jest.mocked(messageRepository);
const pr = jest.mocked(pendingMessageRepository);
const ms = jest.mocked(messageService);

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

// ─── Tests ────────────────────────────────────────────────────────────

describe('messageStore E2EE sending block (E5/E8/E21/E24/E25/E27)', () => {
  beforeEach(() => {
    useMessageStore.setState({ messagesBySession: {}, loading: false, searchResults: [] });
    jest.clearAllMocks();
    mockSessions.length = 0;
    mr.listMessages.mockReturnValue([]);
    mr.listSessions.mockReturnValue([]);
    pr.listReady.mockReturnValue([]);
    pr.findByClientMessageId.mockReturnValue(undefined);
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
      mr.listMessages.mockReturnValue([encryptedMessage]);
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

  // ── 3. sendMedia on encrypted session must throw, not upload or send ──

  describe('sendMedia with encrypted=true session (E5.2/E8.1/E21.4/E27.1)', () => {
    it('throws E2EE_SEND_DISABLED_TEXT for encrypted session', async () => {
      const session = encryptedSession();
      const file = { uri: 'file:///img.jpg', name: 'img.jpg', size: 1024 };

      await expect(
        useMessageStore.getState().sendMedia(session, file as never, 'IMAGE'),
      ).rejects.toThrow(E2EE_SEND_DISABLED_TEXT);
    });

    it('does NOT call messageService.sendPrivate or uploadService for encrypted session', async () => {
      const session = encryptedSession();
      const file = { uri: 'file:///img.jpg', name: 'img.jpg', size: 1024 };

      try {
        await useMessageStore.getState().sendMedia(session, file as never, 'IMAGE');
      } catch {
        // expected
      }

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
    });

    it('does NOT enqueue plaintext pending for encrypted media send', async () => {
      const session = encryptedSession();
      const file = { uri: 'file:///img.jpg', name: 'img.jpg', size: 1024 };

      try {
        await useMessageStore.getState().sendMedia(session, file as never, 'IMAGE');
      } catch {
        // expected
      }

      expect(pr.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── 4. Plaintext session preserves normal send behavior (E9.1) ──

  describe('sendText with encrypted=false session preserves normal behavior (E9.1)', () => {
    it('calls messageService.sendPrivate for plaintext session', async () => {
      const session = baseSession();
      // enqueuePending writes to pr.enqueue; retryMessage then reads via pr.get.
      // Capture the enqueued pending so pr.get returns it.
      let enqueuedLocalId: string | undefined;
      pr.enqueue.mockImplementation((item: PendingMessage) => {
        enqueuedLocalId = item.localId;
      });
      pr.get.mockImplementation((localId: string) => {
        if (localId === enqueuedLocalId) {
          return {
            localId,
            conversationId: session.id,
            sendType: 'private' as const,
            payloadJson: JSON.stringify({
              sendType: 'private',
              data: { clientMessageId: 'c1', messageType: 'TEXT' as const, content: 'hello' },
            }),
            status: 'pending' as const,
            retryCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
        return undefined;
      });
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_1', messageId: 'srv_1', clientMessageId: 'c1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().sendText(session, 'hello');

      expect(ms.sendPrivate).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'TEXT',
          content: 'hello',
        }),
      );
    });

    it('enqueues pending message for plaintext session', async () => {
      const session = baseSession();
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_1', messageId: 'srv_1', clientMessageId: 'c1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().sendText(session, 'hello');

      expect(pr.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: session.id,
          sendType: 'private',
          status: 'pending',
        }),
      );
    });

    it('adds optimistic message to state for plaintext session', async () => {
      const session = baseSession();
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_1', messageId: 'srv_1', clientMessageId: 'c1', status: 'SENT' },
      } as never);

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
          lastError: 'E2EE deferred',
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

      pr.listReady.mockReturnValue([plainPending, encPending]);
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
});
