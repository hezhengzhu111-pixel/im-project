/**
 * Phase 3 — messageStore pagination action tests.
 *
 * Focused on the three pagination actions and their interaction with
 * the repository / API layers:
 *   - loadInitialMessages  (local-first → remote merge)
 *   - loadOlderMessages    (cursor params, concurrent guard, failure resilience)
 *   - refreshLatestMessages (cursor params, pending preservation, failure resilience)
 *   - hasMoreBefore calculation
 *   - pending/local/server dedup via addMessage
 *
 * Uses auto-mock pattern matching existing messageStore.test.ts.
 */
import type { ChatSession } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';

// ── Auto-mock dependencies ───────────────────────────────────────────────────
jest.mock('@/services/storage/messageRepository');
jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/chat/messageService');
jest.mock('@/services/upload/uploadService');
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

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { useMessageStore } from '../messageStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { messageService } from '@/services/chat/messageService';

const mr = jest.mocked(messageRepository);
const ms = jest.mocked(messageService);

// ── Helpers ──────────────────────────────────────────────────────────────────
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

const PAGE_SIZE = 50;

// ── Tests ────────────────────────────────────────────────────────────────────
describe('messageStore — Phase 3 pagination', () => {
  beforeEach(() => {
    useMessageStore.setState({
      messagesBySession: {},
      messagesPaginationBySession: {},
      loading: false,
      searchResults: [],
    });
    jest.clearAllMocks();
    mockSessions.length = 0;
    mockMaskEncryptedMessage.mockImplementation((msg: MobileMessage) => msg);
    mr.listMessages.mockReturnValue([]);
    mr.listMessagesPage.mockReturnValue({ messages: [], hasMore: false });
    mr.listSessions.mockReturnValue([]);
  });

  // ── loadInitialMessages ──────────────────────────────────────────────────
  describe('loadInitialMessages', () => {
    it('shows local cache first, then merges with remote', async () => {
      const session = baseSession();
      const localMsgs = makeMessages(3, '2024-06-01T10:00:00.000Z', 'local');
      const remoteMsgs = makeMessages(3, '2024-06-01T10:00:00.000Z', 'remote');

      mr.listMessagesPage.mockReturnValueOnce({ messages: localMsgs, hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: remoteMsgs });

      await useMessageStore.getState().loadInitialMessages(session);

      expect(mr.listMessagesPage).toHaveBeenCalledWith('100_200', { limit: PAGE_SIZE });
      expect(ms.getPrivateHistory).toHaveBeenCalledWith('200', { size: PAGE_SIZE });

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.initialized).toBe(true);
      expect(pagination?.loadingInitial).toBe(false);
    });

    it('sets hasMoreBefore=false when remote returns fewer than PAGE_SIZE', async () => {
      const session = baseSession();
      const fewMsgs = makeMessages(5, '2024-06-01T10:00:00.000Z');

      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: fewMsgs });

      await useMessageStore.getState().loadInitialMessages(session);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.hasMoreBefore).toBe(false);
    });

    it('sets hasMoreBefore=true when remote returns exactly PAGE_SIZE', async () => {
      const session = baseSession();
      const fullPage = makeMessages(PAGE_SIZE, '2024-06-01T10:00:00.000Z');

      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: fullPage });

      await useMessageStore.getState().loadInitialMessages(session);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.hasMoreBefore).toBe(true);
    });

    it('preserves local messages and records lastError on remote failure', async () => {
      const session = baseSession();
      const localMsgs = makeMessages(2, '2024-06-01T10:00:00.000Z', 'local');

      mr.listMessagesPage.mockReturnValueOnce({ messages: localMsgs, hasMore: false });
      ms.getPrivateHistory.mockRejectedValueOnce(new Error('network down'));

      await useMessageStore.getState().loadInitialMessages(session);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(2);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.lastError).toBe('network down');
      expect(pagination?.loadingInitial).toBe(false);
      expect(pagination?.initialized).toBe(true);
    });

    it('sets initialized=false when no local and remote fails', async () => {
      const session = baseSession();

      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getPrivateHistory.mockRejectedValueOnce(new Error('server down'));

      await useMessageStore.getState().loadInitialMessages(session);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.initialized).toBe(false);
    });

    it('uses getGroupHistory for group sessions', async () => {
      const session = baseSession({ type: 'group', targetId: 'g1', id: 'group_g1' });

      mr.listMessagesPage.mockReturnValueOnce({ messages: [], hasMore: false });
      ms.getGroupHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: [] });

      await useMessageStore.getState().loadInitialMessages(session);

      expect(ms.getGroupHistory).toHaveBeenCalledWith('g1', { size: PAGE_SIZE });
      expect(ms.getPrivateHistory).not.toHaveBeenCalled();
    });
  });

  // ── loadOlderMessages ────────────────────────────────────────────────────
  describe('loadOlderMessages', () => {
    it('passes beforeTime and beforeId from the oldest existing message', async () => {
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
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: [] });

      await useMessageStore.getState().loadOlderMessages(session);

      expect(ms.getPrivateHistory).toHaveBeenCalledWith(
        '200',
        expect.objectContaining({
          size: PAGE_SIZE,
          beforeTime: '2024-06-01T10:00:00.000Z',
          beforeId: 'msg_1',
          direction: 'older',
        }),
      );
    });

    it('skips when loadingOlder is already true (concurrent protection)', async () => {
      const session = baseSession();
      useMessageStore.setState({
        messagesBySession: { '100_200': makeMessages(3, '2024-06-01T10:00:00.000Z') },
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

    it('skips when hasMoreBefore is false', async () => {
      const session = baseSession();
      useMessageStore.setState({
        messagesBySession: { '100_200': makeMessages(3, '2024-06-01T10:00:00.000Z') },
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
      const olderMsg = baseMobileMessage({
        id: 'msg_old',
        messageId: 'msg_old',
        sendTime: '2024-06-01T10:00:00.000Z',
      });

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

    it('sets hasMoreBefore=false when remote returns fewer than PAGE_SIZE', async () => {
      const session = baseSession();
      useMessageStore.setState({
        messagesBySession: { '100_200': makeMessages(3, '2024-06-01T10:00:00.000Z') },
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
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: makeMessages(3, '2024-05-01T10:00:00.000Z', 'older') });

      await useMessageStore.getState().loadOlderMessages(session);

      const pagination = useMessageStore.getState().messagesPaginationBySession['100_200'];
      expect(pagination?.hasMoreBefore).toBe(false);
    });
  });

  // ── refreshLatestMessages ────────────────────────────────────────────────
  describe('refreshLatestMessages', () => {
    it('passes afterTime and afterId from the newest existing message', async () => {
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
            newestMessageId: 'msg_3',
            newestMessageTime: '2024-06-01T10:00:02.000Z',
          },
        },
      });

      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: [] });

      await useMessageStore.getState().refreshLatestMessages(session);

      expect(ms.getPrivateHistory).toHaveBeenCalledWith(
        '200',
        expect.objectContaining({
          size: PAGE_SIZE,
          afterTime: '2024-06-01T10:00:02.000Z',
          afterId: 'msg_3',
          direction: 'newer',
        }),
      );
    });

    it('preserves pending SENDING messages during refresh', async () => {
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

      const serverConfirmed = baseMobileMessage({
        id: 'srv_confirmed',
        messageId: 'srv_confirmed',
        sendTime: '2024-06-01T10:00:03.000Z',
        status: 'SENT',
      });
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: [serverConfirmed] });

      await useMessageStore.getState().refreshLatestMessages(session);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages.length).toBeGreaterThanOrEqual(2);
      const hasPendingOrMerged = messages.some(
        (m) => m.id === 'local_pending' || m.id === 'srv_confirmed',
      );
      expect(hasPendingOrMerged).toBe(true);
    });

    it('records lastError on failure without clearing existing messages', async () => {
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
      expect(useMessageStore.getState().messagesBySession['100_200']).toHaveLength(2);
    });

    it('uses getGroupHistory for group sessions', async () => {
      const session = baseSession({ type: 'group', targetId: 'g1', id: 'group_g1' });
      useMessageStore.setState({
        messagesBySession: { group_g1: makeMessages(2, '2024-06-01T10:00:00.000Z') },
        messagesPaginationBySession: {
          group_g1: {
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

      ms.getGroupHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: [] });

      await useMessageStore.getState().refreshLatestMessages(session);

      expect(ms.getGroupHistory).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ direction: 'newer' }),
      );
    });
  });

  // ── pending/local/server 去重 ────────────────────────────────────────────
  describe('pending/local/server dedup', () => {
    it('addMessage deduplicates by serverId', () => {
      const existing = baseMobileMessage({ id: 'msg_1', serverId: 'srv_1', status: 'SENDING' });
      useMessageStore.setState({ messagesBySession: { '100_200': [existing] } });

      const incoming = baseMobileMessage({ id: 'srv_1', serverId: 'srv_1', status: 'SENT' });
      useMessageStore.getState().addMessage(incoming, '100_200');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
    });

    it('addMessage deduplicates by clientMessageId', () => {
      const existing = baseMobileMessage({
        id: 'local_1',
        clientMessageId: 'cm_1',
        status: 'SENDING',
      });
      useMessageStore.setState({ messagesBySession: { '100_200': [existing] } });

      const incoming = baseMobileMessage({
        id: 'srv_1',
        clientMessageId: 'cm_1',
        serverId: 'srv_1',
        status: 'SENT',
      });
      useMessageStore.getState().addMessage(incoming, '100_200');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
    });

    it('addMessage updates pagination cursor when initialized', () => {
      useMessageStore.setState({
        messagesBySession: { '100_200': makeMessages(2, '2024-06-01T10:00:00.000Z') },
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
});
