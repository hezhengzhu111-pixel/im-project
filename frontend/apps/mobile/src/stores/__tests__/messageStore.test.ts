import type { ChatSession } from '@im/shared-types';
import type { MobileMessage, PendingMessage } from '@/types/models';

// Auto-mock simple dependencies (no factory)
jest.mock('@/services/storage/messageRepository');
jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/chat/messageService');
jest.mock('@/services/upload/uploadService');
jest.mock('@/e2ee/e2eeDeferred');
jest.mock('@/utils/logger');
jest.mock('@/utils/ids', () => ({
  createClientMessageId: jest.fn(() => `client_${Date.now()}`),
  createLocalMessageId: jest.fn(() => `local_${Date.now()}`),
}));

const mockMaskEncryptedMessage = jest.fn((msg: MobileMessage) => msg);
jest.mock('@/e2ee/e2eeDeferred', () => ({
  maskEncryptedMessage: (msg: MobileMessage) => mockMaskEncryptedMessage(msg),
  assertPlaintextSendAllowed: jest.fn(),
  blockEncryptedPendingPayload: jest.fn(() => false),
}));

// Store mocks need factory because they export Zustand stores with getState()
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

// ─── Imports (after mocks) ──────────────────────────────────────────────
import { useMessageStore } from '../messageStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { messageService } from '@/services/chat/messageService';
import { createClientMessageId, createLocalMessageId } from '@/utils/ids';

const mr = jest.mocked(messageRepository);
const pr = jest.mocked(pendingMessageRepository);
const ms = jest.mocked(messageService);

const baseMobileMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'msg_1',
  messageId: 'msg_1',
  senderId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'hello',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  conversationId: '100_200',
  ...overrides,
});

const makeMessages = (count: number, baseTime: string, prefix = 'msg'): MobileMessage[] => {
  const base = new Date(baseTime).getTime();
  return Array.from({ length: count }, (_, i) =>
    baseMobileMessage({
      id: `${prefix}_${i + 1}`,
      messageId: `${prefix}_${i + 1}`,
      sendTime: new Date(base + i * 1000).toISOString(),
    }),
  );
};

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

describe('messageStore', () => {
  beforeEach(() => {
    useMessageStore.setState({ messagesBySession: {}, messagesPaginationBySession: {}, loading: false, searchResults: [] });
    jest.clearAllMocks();
    mockSessions.length = 0;
    mockMaskEncryptedMessage.mockImplementation((msg: MobileMessage) => msg);
    // Set default return values
    mr.listMessages.mockReturnValue([]);
    mr.listMessagesPage.mockReturnValue({ messages: [], hasMore: false });
    mr.listSessions.mockReturnValue([]);
    pr.listReady.mockReturnValue([]);
    pr.listReadyToSend.mockReturnValue([]);
    // Ensure updateStatus is available (auto-mock may not discover all methods)
    if (!pr.updateStatus) {
      (pr as Record<string, unknown>).updateStatus = jest.fn();
    }
    (createClientMessageId as jest.Mock).mockReturnValue(`client_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    (createLocalMessageId as jest.Mock).mockReturnValue(`local_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  });

  describe('addMessage', () => {
    it('adds message to the correct session', () => {
      const msg = baseMobileMessage({ id: 'msg_1', conversationId: '100_200' });
      useMessageStore.getState().addMessage(msg, '100_200');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('msg_1');
    });

    it('persists message via messageRepository.upsertMessages', () => {
      const msg = baseMobileMessage();
      useMessageStore.getState().addMessage(msg, '100_200');

      expect(mr.upsertMessages).toHaveBeenCalledWith('100_200', expect.arrayContaining([
        expect.objectContaining({ id: 'msg_1' }),
      ]));
    });

    it('calls sessionStore.upsertSession when session exists', () => {
      const session = baseSession({ id: '100_200' });
      mockSessions.push(session);

      const msg = baseMobileMessage({ sendTime: '2024-06-02T10:00:00.000Z' });
      useMessageStore.getState().addMessage(msg, '100_200');

      expect(mockUpsertSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '100_200',
          lastMessage: expect.objectContaining({ id: 'msg_1' }),
        }),
      );
    });

    it('does not call sessionStore.upsertSession when session does not exist', () => {
      const msg = baseMobileMessage();
      useMessageStore.getState().addMessage(msg, 'nonexistent_session');

      expect(mockUpsertSession).not.toHaveBeenCalled();
    });

    it('deduplicates messages with same identity', () => {
      const existing = baseMobileMessage({ id: 'msg_1', serverId: 'srv_1', status: 'SENDING' });
      const incoming = baseMobileMessage({ id: 'srv_1', serverId: 'srv_1', status: 'SENT' });

      useMessageStore.setState({ messagesBySession: { '100_200': [existing] } });
      useMessageStore.getState().addMessage(incoming, '100_200');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
    });
  });

  describe('retryMessage', () => {
    it('increments retryCount on failure', async () => {
      const pending: PendingMessage = {
        localId: 'local_1',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: { clientMessageId: 'c1', messageType: 'TEXT', content: 'hi' },
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      pr.get.mockReturnValue(pending);
      pr.findByClientMessageId.mockReturnValue(undefined);
      ms.sendPrivate.mockImplementation(() => Promise.reject(new Error('network error')));

      await useMessageStore.getState().retryMessage('local_1');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 'local_1',
          retryCount: 1,
          status: 'pending',
          lastError: expect.stringContaining('send failed'),
        }),
      );
    });

    it('sets status to failed when maxRetryCount is reached', async () => {
      const pending: PendingMessage = {
        localId: 'local_2',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: { clientMessageId: 'c2', messageType: 'TEXT', content: 'hi' },
        }),
        status: 'pending',
        retryCount: 4,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      pr.get.mockReturnValue(pending);
      pr.findByClientMessageId.mockReturnValue(undefined);
      ms.sendPrivate.mockImplementation(() => Promise.reject(new Error('network error')));

      await useMessageStore.getState().retryMessage('local_2');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 'local_2',
          retryCount: 5,
          status: 'failed',
          lastError: expect.stringContaining('send failed'),
        }),
      );
    });

    it('uses shared retry policy for nextRetryAt', async () => {
      const pending: PendingMessage = {
        localId: 'local_3',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: { clientMessageId: 'c3', messageType: 'TEXT', content: 'hi' },
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      pr.get.mockReturnValue(pending);
      pr.findByClientMessageId.mockReturnValue(undefined);
      ms.sendPrivate.mockImplementation(() => Promise.reject(new Error('network error')));

      await useMessageStore.getState().retryMessage('local_3');

      const allUpdateCalls = (pr.update as jest.Mock).mock.calls.map(
        (call: unknown[]) => call[0] as PendingMessage,
      );
      const catchUpdate = allUpdateCalls.find(
        (p: PendingMessage) => p.localId === 'local_3' && p.retryCount > 0,
      );
      expect(catchUpdate).toBeDefined();
      expect(catchUpdate!.retryCount).toBe(1);
      expect(catchUpdate!.nextRetryAt).toBeDefined();
      expect(typeof catchUpdate!.nextRetryAt).toBe('number');
      expect(catchUpdate!.nextRetryAt!).toBeGreaterThan(Date.now() - 1000);
      expect(catchUpdate!.lastError).toContain('send failed');
    });

    it('skips when pending not found', async () => {
      pr.get.mockReturnValue(undefined);

      await useMessageStore.getState().retryMessage('nonexistent');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });
  });

  describe('loadMessages', () => {
    it('loads messages from API and persists to repository', async () => {
      const session = baseSession();
      const apiMessages = [
        baseMobileMessage({ id: 'srv_1', messageId: 'srv_1', status: 'SENT' }),
        baseMobileMessage({ id: 'srv_2', messageId: 'srv_2', sendTime: '2024-06-01T10:00:01.000Z', status: 'SENT' }),
      ];
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: apiMessages });

      await useMessageStore.getState().loadMessages(session);

      expect(mr.upsertMessages).toHaveBeenCalledWith('100_200', expect.any(Array));
      expect(useMessageStore.getState().messagesBySession['100_200']).toHaveLength(2);
      expect(useMessageStore.getState().loading).toBe(false);
    });

    it('delegates to refreshLatestMessages when refresh=true and initialized', async () => {
      const session = baseSession();
      const existing = makeMessages(3, '2024-06-01T10:00:00.000Z');
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: true,
            hasMoreAfter: false,
            initialized: true,
            newestMessageId: 'msg_3',
            newestMessageTime: '2024-06-01T10:00:02.000Z',
            oldestMessageId: 'msg_1',
            oldestMessageTime: '2024-06-01T10:00:00.000Z',
          },
        },
      });
      const newer = [baseMobileMessage({ id: 'srv_new', sendTime: '2024-06-01T10:00:03.000Z' })];
      ms.getGroupHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: newer } as never);

      await useMessageStore.getState().loadMessages({ ...session, type: 'group', targetId: 'g1' }, true);

      expect(ms.getGroupHistory).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ direction: 'newer' }),
      );
    });
  });

  describe('loadInitialMessages', () => {
    it('shows local cache first, then merges with remote', async () => {
      const session = baseSession();
      const localMsgs = makeMessages(3, '2024-06-01T10:00:00.000Z', 'local');
      const remoteMsgs = makeMessages(3, '2024-06-01T10:00:00.000Z', 'remote');

      mr.listMessagesPage.mockReturnValueOnce({ messages: localMsgs, hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: remoteMsgs });

      await useMessageStore.getState().loadInitialMessages(session);

      // local cache should have been set before remote completed
      expect(mr.listMessagesPage).toHaveBeenCalledWith('100_200', { limit: 50 });
      expect(ms.getPrivateHistory).toHaveBeenCalledWith('200', { size: 50 });
      expect(mr.upsertMessages).toHaveBeenCalledWith('100_200', expect.any(Array));

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.initialized).toBe(true);
      expect(pagination?.loadingInitial).toBe(false);
    });

    it('preserves local messages and records lastError on remote failure', async () => {
      const session = baseSession();
      const localMsgs = makeMessages(2, '2024-06-01T10:00:00.000Z', 'local');

      mr.listMessagesPage.mockReturnValueOnce({ messages: localMsgs, hasMore: false });
      ms.getPrivateHistory.mockRejectedValueOnce(new Error('network down'));

      await useMessageStore.getState().loadInitialMessages(session);

      // local messages should still be in state
      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(2);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.lastError).toBe('network down');
      expect(pagination?.loadingInitial).toBe(false);
      // initialized is true because local data exists
      expect(pagination?.initialized).toBe(true);
    });

    it('sets hasMoreBefore=false when result is less than PAGE_SIZE', async () => {
      const session = baseSession();
      const fewMsgs = makeMessages(5, '2024-06-01T10:00:00.000Z');
      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: fewMsgs });

      await useMessageStore.getState().loadInitialMessages(session);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.hasMoreBefore).toBe(false);
    });

    it('sets hasMoreBefore=true when result reaches PAGE_SIZE', async () => {
      const session = baseSession();
      const fullPage = makeMessages(50, '2024-06-01T10:00:00.000Z');
      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: fullPage });

      await useMessageStore.getState().loadInitialMessages(session);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.hasMoreBefore).toBe(true);
    });
  });

  describe('loadOlderMessages', () => {
    it('uses beforeTime/beforeId from oldest message', async () => {
      const session = baseSession();
      const existing = makeMessages(3, '2024-06-01T10:00:00.000Z');
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: true,
            hasMoreAfter: false,
            initialized: true,
            oldestMessageId: 'msg_1',
            oldestMessageTime: '2024-06-01T10:00:00.000Z',
            newestMessageId: 'msg_3',
            newestMessageTime: '2024-06-01T10:00:02.000Z',
          },
        },
      });
      const olderMsgs = makeMessages(2, '2024-05-31T10:00:00.000Z', 'older');
      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: olderMsgs });

      await useMessageStore.getState().loadOlderMessages(session);

      expect(ms.getPrivateHistory).toHaveBeenCalledWith(
        '200',
        expect.objectContaining({
          size: 50,
          beforeTime: '2024-06-01T10:00:00.000Z',
          beforeId: 'msg_1',
          direction: 'older',
        }),
      );
    });

    it('does not fire concurrent requests', async () => {
      const session = baseSession();
      const existing = makeMessages(3, '2024-06-01T10:00:00.000Z');
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: true,
            refreshingLatest: false,
            hasMoreBefore: true,
            hasMoreAfter: false,
            initialized: true,
          },
        },
      });

      await useMessageStore.getState().loadOlderMessages(session);

      expect(ms.getPrivateHistory).not.toHaveBeenCalled();
    });

    it('does not request when hasMoreBefore=false', async () => {
      const session = baseSession();
      const existing = makeMessages(3, '2024-06-01T10:00:00.000Z');
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: false,
            hasMoreAfter: false,
            initialized: true,
          },
        },
      });

      await useMessageStore.getState().loadOlderMessages(session);

      expect(ms.getPrivateHistory).not.toHaveBeenCalled();
    });

    it('merges older messages without overwriting existing', async () => {
      const session = baseSession();
      const existing = [
        baseMobileMessage({ id: 'msg_cur', sendTime: '2024-06-02T10:00:00.000Z' }),
      ];
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: true,
            hasMoreAfter: false,
            initialized: true,
            oldestMessageId: 'msg_cur',
            oldestMessageTime: '2024-06-02T10:00:00.000Z',
          },
        },
      });
      const olderMsg = baseMobileMessage({ id: 'msg_old', messageId: 'msg_old', sendTime: '2024-06-01T10:00:00.000Z' });
      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: [olderMsg] });

      await useMessageStore.getState().loadOlderMessages(session);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('msg_old');
      expect(messages[1].id).toBe('msg_cur');
    });

    it('records lastError on failure without clearing existing messages', async () => {
      const session = baseSession();
      const existing = makeMessages(3, '2024-06-01T10:00:00.000Z');
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: true,
            hasMoreAfter: false,
            initialized: true,
            oldestMessageId: 'msg_1',
            oldestMessageTime: '2024-06-01T10:00:00.000Z',
          },
        },
      });
      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getPrivateHistory.mockRejectedValueOnce(new Error('timeout'));

      await useMessageStore.getState().loadOlderMessages(session);

      expect(useMessageStore.getState().messagesBySession['100_200']).toHaveLength(3);
      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.lastError).toBe('timeout');
      expect(pagination?.loadingOlder).toBe(false);
    });
  });

  describe('refreshLatestMessages', () => {
    it('uses afterTime/afterId from newest message', async () => {
      const session = baseSession();
      const existing = makeMessages(3, '2024-06-01T10:00:00.000Z');
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: true,
            hasMoreAfter: false,
            initialized: true,
            newestMessageId: 'msg_3',
            newestMessageTime: '2024-06-01T10:00:02.000Z',
          },
        },
      });
      const newerMsgs = [baseMobileMessage({ id: 'srv_new', sendTime: '2024-06-01T10:00:05.000Z' })];
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: newerMsgs });

      await useMessageStore.getState().refreshLatestMessages(session);

      expect(ms.getPrivateHistory).toHaveBeenCalledWith(
        '200',
        expect.objectContaining({
          size: 50,
          afterTime: '2024-06-01T10:00:02.000Z',
          afterId: 'msg_3',
          direction: 'newer',
        }),
      );
    });

    it('does not overwrite pending local messages', async () => {
      const session = baseSession();
      const pendingMsg = baseMobileMessage({
        id: 'local_pending',
        status: 'SENDING',
        sendTime: '2024-06-01T10:00:03.000Z',
      });
      const existing = [
        baseMobileMessage({ id: 'msg_1', sendTime: '2024-06-01T10:00:00.000Z' }),
        pendingMsg,
      ];
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: false,
            hasMoreAfter: false,
            initialized: true,
            newestMessageId: 'local_pending',
            newestMessageTime: '2024-06-01T10:00:03.000Z',
          },
        },
      });
      // remote returns the same pending as SENT (server confirmed)
      const serverConfirmed = baseMobileMessage({
        id: 'srv_confirmed',
        messageId: 'srv_confirmed',
        sendTime: '2024-06-01T10:00:03.000Z',
        status: 'SENT',
      });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: [serverConfirmed] });

      await useMessageStore.getState().refreshLatestMessages(session);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      // should have msg_1 + merged result (pending merged with server, or both kept if different identity)
      expect(messages.length).toBeGreaterThanOrEqual(2);
      // the pending message should not be silently dropped
      const hasPendingOrMerged = messages.some(
        (m) => m.id === 'local_pending' || m.id === 'srv_confirmed',
      );
      expect(hasPendingOrMerged).toBe(true);
    });

    it('records lastError on failure', async () => {
      const session = baseSession();
      const existing = makeMessages(2, '2024-06-01T10:00:00.000Z');
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: false,
            hasMoreAfter: false,
            initialized: true,
            newestMessageId: 'msg_2',
            newestMessageTime: '2024-06-01T10:00:01.000Z',
          },
        },
      });
      ms.getPrivateHistory.mockRejectedValueOnce(new Error('server error'));

      await useMessageStore.getState().refreshLatestMessages(session);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.lastError).toBe('server error');
      expect(pagination?.refreshingLatest).toBe(false);
      // existing messages preserved
      expect(useMessageStore.getState().messagesBySession['100_200']).toHaveLength(2);
    });
  });

  describe('addMessage updates pagination cursor', () => {
    it('updates newestMessageTime when new message arrives via WebSocket', () => {
      const existing = makeMessages(2, '2024-06-01T10:00:00.000Z');
      useMessageStore.setState({
        messagesBySession: { '100_200': existing },
        messagesPaginationBySession: {
          '100_200': {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: false,
            hasMoreAfter: false,
            initialized: true,
            newestMessageId: 'msg_2',
            newestMessageTime: '2024-06-01T10:00:01.000Z',
            oldestMessageId: 'msg_1',
            oldestMessageTime: '2024-06-01T10:00:00.000Z',
          },
        },
      });
      mockSessions.push(baseSession());

      const wsMsg = baseMobileMessage({
        id: 'ws_msg',
        sendTime: '2024-06-01T10:00:05.000Z',
      });
      useMessageStore.getState().addMessage(wsMsg, '100_200');

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.newestMessageId).toBe('ws_msg');
      expect(pagination?.newestMessageTime).toBe('2024-06-01T10:00:05.000Z');
    });
  });

  describe('encrypted messages are masked', () => {
    it('masks encrypted content in loadInitialMessages', async () => {
      const session = baseSession();
      const encryptedMsg = {
        ...baseMobileMessage({ id: 'enc_1', messageId: 'enc_1' }),
        content: 'ciphertext-data',
        mediaUrl: 'https://cdn/encrypted.jpg',
        mediaName: 'secret.jpg',
        mediaSize: 2048,
        encrypted: true,
      } as MobileMessage;
      const maskedMsg = { ...encryptedMsg, content: '[encrypted]', mediaUrl: undefined, mediaName: undefined, mediaSize: undefined };
      mockMaskEncryptedMessage.mockImplementation((msg: MobileMessage) =>
        (msg as unknown as Record<string, unknown>).encrypted ? maskedMsg : msg,
      );
      mr.listMessagesPage.mockReturnValueOnce({ messages: [encryptedMsg], hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: [encryptedMsg] });

      await useMessageStore.getState().loadInitialMessages(session);

      expect(mockMaskEncryptedMessage).toHaveBeenCalled();
      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toBeDefined();
      expect(messages![0].content).toBe('[encrypted]');
    });
  });

  describe('resetMessagePagination', () => {
    it('resets pagination for a specific session', () => {
      useMessageStore.setState({
        messagesPaginationBySession: {
          '100_200': { initialized: true } as never,
          '100_300': { initialized: true } as never,
        },
      });

      useMessageStore.getState().resetMessagePagination('100_200');

      const pagination = useMessageStore.getState().messagesPaginationBySession;
      expect(pagination['100_200']).toBeUndefined();
      expect(pagination['100_300']).toBeDefined();
    });

    it('resets all pagination when no sessionId provided', () => {
      useMessageStore.setState({
        messagesPaginationBySession: {
          '100_200': { initialized: true } as never,
          '100_300': { initialized: true } as never,
        },
      });

      useMessageStore.getState().resetMessagePagination();

      expect(useMessageStore.getState().messagesPaginationBySession).toEqual({});
    });
  });

  describe('clearMessages', () => {
    it('removes messages for the given session', () => {
      useMessageStore.setState({
        messagesBySession: {
          '100_200': [baseMobileMessage()],
          '100_300': [baseMobileMessage({ id: 'msg_2' })],
        },
      });

      useMessageStore.getState().clearMessages('100_200');

      expect(useMessageStore.getState().messagesBySession['100_200']).toBeUndefined();
      expect(useMessageStore.getState().messagesBySession['100_300']).toHaveLength(1);
    });

    it('also clears pagination state for the session', () => {
      useMessageStore.setState({
        messagesBySession: {
          '100_200': [baseMobileMessage()],
        },
        messagesPaginationBySession: {
          '100_200': { initialized: true } as never,
          '100_300': { initialized: true } as never,
        },
      });

      useMessageStore.getState().clearMessages('100_200');

      expect(useMessageStore.getState().messagesPaginationBySession['100_200']).toBeUndefined();
      expect(useMessageStore.getState().messagesPaginationBySession['100_300']).toBeDefined();
    });
  });

  // ─── deleteLocalMessage ─────────────────────────────────────────────

  describe('deleteLocalMessage', () => {
    it('removes message from messagesBySession', () => {
      const msg1 = baseMobileMessage({ id: 'msg_1' });
      const msg2 = baseMobileMessage({ id: 'msg_2' });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg1, msg2] },
      });

      useMessageStore.getState().deleteLocalMessage('100_200', 'msg_1');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('msg_2');
    });

    it('no-ops when session does not exist', () => {
      expect(() => useMessageStore.getState().deleteLocalMessage('nonexistent', 'msg_1')).not.toThrow();
    });

    it('calls messageRepository.deleteMessage to sync storage', () => {
      const msg = baseMobileMessage({ id: 'msg_1' });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      useMessageStore.getState().deleteLocalMessage('100_200', 'msg_1');

      expect(mr.deleteMessage).toHaveBeenCalledWith('100_200', 'msg_1');
    });

    it('preserves other messages in the same session', () => {
      const msg1 = baseMobileMessage({ id: 'msg_1' });
      const msg2 = baseMobileMessage({ id: 'msg_2' });
      const msg3 = baseMobileMessage({ id: 'msg_3' });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg1, msg2, msg3] },
      });

      useMessageStore.getState().deleteLocalMessage('100_200', 'msg_2');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(2);
      expect(messages.map((m) => m.id)).toEqual(['msg_1', 'msg_3']);
    });
  });

  // ─── recallMessage ──────────────────────────────────────────────────

  describe('recallMessage', () => {
    const baseMsg = (overrides: Partial<MobileMessage> = {}): MobileMessage =>
      baseMobileMessage({
        id: 'msg_1',
        messageId: 'msg_1',
        serverId: 'srv_1',
        senderId: '100',
        status: 'SENT',
        ...overrides,
      });

    it('calls messageService.recallMessage with server message id', async () => {
      const msg = baseMsg();
      const recalled: MobileMessage = { ...msg, status: 'RECALLED', content: '消息已撤回' };
      ms.recallMessage.mockResolvedValueOnce({ code: 0, message: 'ok', data: recalled });

      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      await useMessageStore.getState().recallMessage('100_200', msg);

      expect(ms.recallMessage).toHaveBeenCalledWith('srv_1');
    });

    it('replaces local message with recalled version on success', async () => {
      const msg = baseMsg();
      const recalled: MobileMessage = { ...msg, id: 'srv_1', status: 'RECALLED', content: '消息已撤回' };
      ms.recallMessage.mockResolvedValueOnce({ code: 0, message: 'ok', data: recalled });

      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      await useMessageStore.getState().recallMessage('100_200', msg);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
      expect(messages[0].status).toBe('RECALLED');
    });

    it('updates messageRepository after successful recall', async () => {
      const msg = baseMsg();
      const recalled: MobileMessage = { ...msg, status: 'RECALLED', content: '消息已撤回' };
      ms.recallMessage.mockResolvedValueOnce({ code: 0, message: 'ok', data: recalled });

      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      await useMessageStore.getState().recallMessage('100_200', msg);

      expect(mr.upsertMessages).toHaveBeenCalledWith('100_200', expect.arrayContaining([
        expect.objectContaining({ status: 'RECALLED' }),
      ]));
    });

    it('preserves original message on recall failure', async () => {
      const msg = baseMsg();
      ms.recallMessage.mockRejectedValueOnce(new Error('not allowed'));

      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      await expect(
        useMessageStore.getState().recallMessage('100_200', msg),
      ).rejects.toThrow('not allowed');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
      expect(messages[0].status).toBe('SENT');
    });

    it('throws when message has no server id', async () => {
      const msg = baseMsg({ messageId: undefined, serverId: undefined });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      await expect(
        useMessageStore.getState().recallMessage('100_200', msg),
      ).rejects.toThrow('缺少服务器消息 ID');

      expect(ms.recallMessage).not.toHaveBeenCalled();
    });

    it('matches by messageId when server returns different id', async () => {
      const msg = baseMsg({ id: 'local_1', messageId: 'srv_1', serverId: 'srv_1' });
      // Server returns message with id=srv_1 but our local store has id=local_1
      const recalled: MobileMessage = { ...msg, id: 'srv_1', messageId: 'srv_1', content: '消息已撤回', status: 'RECALLED' };
      ms.recallMessage.mockResolvedValueOnce({ code: 0, message: 'ok', data: recalled });

      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      await useMessageStore.getState().recallMessage('100_200', msg);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
      expect(messages[0].status).toBe('RECALLED');
    });
  });

  // ─── applyRecalledMessage ───────────────────────────────────────────

  describe('applyRecalledMessage', () => {
    it('replaces message by id match', () => {
      const msg = baseMobileMessage({ id: 'msg_1', status: 'SENT' });
      const recalled = { ...msg, id: 'msg_1', status: 'RECALLED' as const, content: '消息已撤回' };
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      useMessageStore.getState().applyRecalledMessage('100_200', recalled);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages[0].status).toBe('RECALLED');
    });

    it('replaces message by serverId match', () => {
      const msg = baseMobileMessage({ id: 'local_1', serverId: 'srv_1', status: 'SENT' });
      const recalled = { ...msg, id: 'srv_1', serverId: 'srv_1', status: 'RECALLED' as const };
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      useMessageStore.getState().applyRecalledMessage('100_200', recalled);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages[0].status).toBe('RECALLED');
    });

    it('syncs to messageRepository', () => {
      const msg = baseMobileMessage({ id: 'msg_1', status: 'SENT' });
      const recalled = { ...msg, status: 'RECALLED' as const };
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      useMessageStore.getState().applyRecalledMessage('100_200', recalled);

      expect(mr.upsertMessages).toHaveBeenCalledWith('100_200', expect.arrayContaining([
        expect.objectContaining({ status: 'RECALLED' }),
      ]));
    });
  });

  describe('clear', () => {
    it('resets messagesBySession and searchResults', () => {
      useMessageStore.setState({
        messagesBySession: {
          '100_200': [baseMobileMessage()],
          '100_300': [baseMobileMessage({ id: 'msg_2' })],
        },
        searchResults: [baseMobileMessage()],
      });

      useMessageStore.getState().clear();

      expect(useMessageStore.getState().messagesBySession).toEqual({});
      expect(useMessageStore.getState().searchResults).toEqual([]);
    });

    it('calls pendingMessageRepository.clear', () => {
      useMessageStore.getState().clear();
      expect(pr.clear).toHaveBeenCalledTimes(1);
    });
  });
});
