/**
 * E24.3 / E25.3 / E5.4: Mobile pending queue must block encrypted payloads
 * and never retry them as plaintext.
 */
import type { ChatSession } from '@im/shared-types';
import type { PendingMessage } from '@/types/models';

// Auto-mock dependencies
jest.mock('@/services/storage/messageRepository');
jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/chat/messageService');
jest.mock('@/services/upload/uploadService');
jest.mock('@/utils/logger');
jest.mock('@/utils/ids', () => ({
  createClientMessageId: jest.fn(() => 'client_test'),
  createLocalMessageId: jest.fn(() => 'local_test'),
}));

const mockSessions: ChatSession[] = [];
const mockUpsertSession = jest.fn();

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
      upsertSession: mockUpsertSession,
      markRead: jest.fn(),
      setCurrentSession: jest.fn(),
    })),
  },
}));

import { useMessageStore } from '../messageStore';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { messageService } from '@/services/chat/messageService';

const pr = jest.mocked(pendingMessageRepository);
const ms = jest.mocked(messageService);

const makePending = (payloadJson: string, overrides: Partial<PendingMessage> = {}): PendingMessage => ({
  localId: 'local_1',
  conversationId: '100_200',
  sendType: 'private',
  payloadJson,
  status: 'pending',
  retryCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

const plaintextPayload = JSON.stringify({
  sendType: 'private',
  data: { clientMessageId: 'c1', messageType: 'TEXT', content: 'hello' },
});

const encryptedTopLevelPayload = JSON.stringify({
  sendType: 'private',
  encrypted: true,
  data: { clientMessageId: 'c2', messageType: 'TEXT', content: 'ciphertext_blob' },
});

const encryptedNestedPayload = JSON.stringify({
  sendType: 'private',
  data: { clientMessageId: 'c3', messageType: 'TEXT', content: 'ciphertext_blob', encrypted: true },
});

describe('pendingEncryptedBlock — E24.3 / E25.3 / E5.4', () => {
  beforeEach(() => {
    useMessageStore.setState({ messagesBySession: {}, loading: false, searchResults: [] });
    jest.clearAllMocks();
    pr.listReady.mockReturnValue([]);
    pr.findByClientMessageId.mockReturnValue(undefined);
    if (!pr.updateStatus) {
      (pr as Record<string, unknown>).updateStatus = jest.fn();
    }
  });

  // ── 1. Top-level encrypted payload is blocked ──────────────────────────
  it('blocks pending with top-level encrypted: true', async () => {
    const pending = makePending(encryptedTopLevelPayload);
    pr.get.mockReturnValue(pending);

    await useMessageStore.getState().retryMessage('local_1');

    expect(pr.update).toHaveBeenCalledWith(
      expect.objectContaining({
        localId: 'local_1',
        status: 'blocked',
        lastError: 'E2EE deferred',
      }),
    );
  });

  // ── 2. data.encrypted payload is blocked ───────────────────────────────
  it('blocks pending with data.encrypted: true', async () => {
    const pending = makePending(encryptedNestedPayload);
    pr.get.mockReturnValue(pending);

    await useMessageStore.getState().retryMessage('local_1');

    expect(pr.update).toHaveBeenCalledWith(
      expect.objectContaining({
        localId: 'local_1',
        status: 'blocked',
        lastError: 'E2EE deferred',
      }),
    );
  });

  // ── 3. Unencrypted pending proceeds normally ───────────────────────────
  it('does not block plaintext pending and sends normally', async () => {
    const pending = makePending(plaintextPayload);
    pr.get.mockReturnValue(pending);
    ms.sendPrivate.mockResolvedValueOnce({
      code: 0,
      message: 'ok',
      data: {
        id: 'srv_1',
        clientMessageId: 'c1',
        messageId: 'srv_1',
        senderId: '100',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: new Date().toISOString(),
        status: 'SENT',
      } as any,
    });

    await useMessageStore.getState().retryMessage('local_1');

    expect(ms.sendPrivate).toHaveBeenCalledWith(
      expect.objectContaining({ clientMessageId: 'c1', content: 'hello' }),
    );
    expect(pr.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'blocked' }),
    );
  });

  // ── 4. Blocked pending does NOT call messageService ────────────────────
  it('does not call sendPrivate or sendGroup when blocked', async () => {
    const pending = makePending(encryptedTopLevelPayload);
    pr.get.mockReturnValue(pending);

    await useMessageStore.getState().retryMessage('local_1');

    expect(ms.sendPrivate).not.toHaveBeenCalled();
    expect(ms.sendGroup).not.toHaveBeenCalled();
  });

  it('does not call sendGroup for encrypted group pending', async () => {
    const groupPayload = JSON.stringify({
      sendType: 'group',
      encrypted: true,
      data: { groupId: 'g1', clientMessageId: 'c4', messageType: 'TEXT', content: 'blob' },
    });
    const pending = makePending(groupPayload, { sendType: 'group' });
    pr.get.mockReturnValue(pending);

    await useMessageStore.getState().retryMessage('local_1');

    expect(ms.sendGroup).not.toHaveBeenCalled();
    expect(ms.sendPrivate).not.toHaveBeenCalled();
    expect(pr.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'blocked' }),
    );
  });

  // ── 5. Blocked status is identifiable by UI or logs ────────────────────
  it('sets status to blocked (identifiable value)', async () => {
    const pending = makePending(encryptedTopLevelPayload);
    pr.get.mockReturnValue(pending);

    await useMessageStore.getState().retryMessage('local_1');

    const updateCall = (pr.update as jest.Mock).mock.calls[0][0] as PendingMessage;
    expect(updateCall.status).toBe('blocked');
    expect(updateCall.lastError).toBe('E2EE deferred');
  });

  it('blocked status is in the PendingMessage status union type', () => {
    // Compile-time check: if 'blocked' is removed from the union, this test file won't compile.
    const status: PendingMessage['status'] = 'blocked';
    expect(status).toBe('blocked');
  });

  // ── 6. retryPending also blocks encrypted payloads ─────────────────────
  it('retryPending blocks all encrypted items in the queue', async () => {
    const plaintext = makePending(plaintextPayload, { localId: 'plain_1' });
    const encrypted = makePending(encryptedTopLevelPayload, { localId: 'enc_1' });

    pr.listReadyToSend.mockReturnValue([plaintext, encrypted]);
    pr.get.mockImplementation((id: string) => {
      if (id === 'plain_1') return plaintext;
      if (id === 'enc_1') return encrypted;
      return undefined;
    });
    ms.sendPrivate.mockResolvedValueOnce({
      code: 0,
      message: 'ok',
      data: {
        id: 'srv_plain',
        clientMessageId: 'c1',
        messageId: 'srv_plain',
        senderId: '100',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: new Date().toISOString(),
        status: 'SENT',
      } as any,
    });

    await useMessageStore.getState().retryPending();

    // plaintext was sent
    expect(ms.sendPrivate).toHaveBeenCalledTimes(1);

    // encrypted was blocked
    expect(pr.update).toHaveBeenCalledWith(
      expect.objectContaining({ localId: 'enc_1', status: 'blocked' }),
    );
  });

  // ── 7. Blocked pending does not get removed from repository ────────────
  it('does not remove blocked pending from repository', async () => {
    const pending = makePending(encryptedTopLevelPayload);
    pr.get.mockReturnValue(pending);

    await useMessageStore.getState().retryMessage('local_1');

    expect(pr.remove).not.toHaveBeenCalled();
    expect(pr.removeByClientMessageId).not.toHaveBeenCalled();
  });
});
