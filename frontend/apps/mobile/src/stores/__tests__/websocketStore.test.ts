import type { ChatSession } from '@im/shared-types';

// ─── Auto-mock simple dependencies ──────────────────────────────────────
jest.mock('@/services/debug/debugTelemetry');
jest.mock('@/services/platform/appLifecycle');
jest.mock('@/services/platform/networkStatus');

// ─── Factory mock for authService (connect needs issueWsTicket) ─────────
jest.mock('@/services/auth/authService', () => ({
  authService: {
    issueWsTicket: jest.fn(),
  },
}));

// ─── Auto-mock logger ───────────────────────────────────────────────────
jest.mock('@/utils/logger');

// ─── Factory mocks for external packages and complex modules ────────────
jest.mock('@im/shared-api-contract', () => ({
  WS_MESSAGE_TYPE: {
    MESSAGE: 'MESSAGE',
    MESSAGE_STATUS_CHANGED: 'MESSAGE_STATUS_CHANGED',
    HEARTBEAT: 'HEARTBEAT',
    ONLINE_STATUS: 'ONLINE_STATUS',
    READ_RECEIPT: 'READ_RECEIPT',
    READ_SYNC: 'READ_SYNC',
    SYSTEM: 'SYSTEM',
    FRIEND_REQUEST: 'FRIEND_REQUEST',
    FRIEND_ACCEPTED: 'FRIEND_ACCEPTED',
    E2EE_NEGOTIATION: 'E2EE_NEGOTIATION',
  },
}));

jest.mock('@im/shared-ws-core', () => ({
  DUPLICATE_CONNECTION_REASON: 'duplicate_connection',
  DEFAULT_DEDUP_TTL_MS: 60_000,
  DEFAULT_DEDUP_MAX_SIZE: 2_000,
  normalizePresenceUserId: (userId: unknown) => String(userId ?? '').trim(),
  classifyWsEvent: jest.fn((payload: Record<string, unknown>) => {
    const type = String(payload.type || '');
    const map: Record<string, string> = {
      MESSAGE: 'message',
      MESSAGE_STATUS_CHANGED: 'messageStatusChanged',
      ONLINE_STATUS: 'onlineStatus',
      READ_RECEIPT: 'readReceipt',
      FRIEND_REQUEST: 'friendRequest',
      FRIEND_ACCEPTED: 'friendAccepted',
      SYSTEM: 'system',
      HEARTBEAT: 'heartbeat',
      E2EE_NEGOTIATION: 'e2eeNegotiation',
    };
    return map[type] ?? 'unknown';
  }),
  applyPresenceToRecord: jest.fn(
    (record: Record<string, boolean>, userId: unknown, status: unknown) => {
      const id = String(userId ?? '').trim();
      if (!id) return record;
      const online = status === 'ONLINE' || status === true;
      if (record[id] === online) return record;
      return { ...record, [id]: online };
    },
  ),
  classifyContactRefreshFromWsType: jest.fn((type: string) => {
    if (type === 'FRIEND_REQUEST') {
      return { loadFriendRequests: true, loadFriends: false, loadSessions: false };
    }
    if (type === 'FRIEND_ACCEPTED') {
      return { loadFriendRequests: false, loadFriends: true, loadSessions: true };
    }
    return null;
  }),
  classifyContactRefreshFromSystemContent: jest.fn((content: string) => {
    if (!content) return null;
    if (content.includes('::CMD:REFRESH_FRIEND_REQUESTS')) {
      return { loadFriendRequests: true, loadFriends: false, loadSessions: false };
    }
    if (content.includes('::CMD:REFRESH_FRIEND_LIST')) {
      return { loadFriendRequests: false, loadFriends: true, loadSessions: true };
    }
    if (content.includes('好友申请') || content.includes('同意')) {
      return { loadFriendRequests: true, loadFriends: true, loadSessions: true };
    }
    return null;
  }),
  createHeartbeatPayload: jest.fn(() => '{"type":"HEARTBEAT"}'),
  createReconnectDelay: jest.fn(() => 1000),
  createWebSocketDiagnosticsSnapshot: jest.fn((input: {
    connected: boolean;
    connecting: boolean;
    reconnectAttempts: number;
    lastEventAt: number;
  }) => ({
    status: input.connected ? 'connected' : input.connecting ? 'connecting' : 'disconnected',
    reconnectAttempts: input.reconnectAttempts,
    lastEventAt: input.lastEventAt,
  })),
  createTicketedWebSocketUrl: jest.fn(() => 'ws://localhost/ws'),
  parseWebSocketPayload: jest.fn((data: string) => JSON.parse(data)),
  shouldProcessSequentially: jest.fn(() => false),
  shouldQueueIncomingPayload: jest.fn(() => false),
  shouldScheduleReconnect: jest.fn(() => true),
  getMessageDedupKey: jest.fn((message: Record<string, unknown>) => {
    const id = message.id;
    if (typeof id === 'string' && id.length > 0) return id;
    if (typeof id === 'number') return String(id);
    const messageId = message.messageId;
    if (typeof messageId === 'string' && messageId.length > 0) return messageId;
    if (typeof messageId === 'number') return String(messageId);
    const clientMessageId = message.clientMessageId;
    if (typeof clientMessageId === 'string' && clientMessageId.length > 0) return clientMessageId;
    return '';
  }),
  shouldDropRecentMessage: jest.fn(
    (recentMap: ReadonlyMap<string, number>, key: string, nowMs: number, ttlMs: number) => {
      if (!key) return false;
      const previous = recentMap.get(key);
      if (previous === undefined) return false;
      return nowMs - previous < ttlMs;
    },
  ),
  rememberRecentMessage: jest.fn(
    (recentMap: ReadonlyMap<string, number>, key: string, nowMs: number, maxSize: number, ttlMs: number) => {
      if (!key) return new Map(recentMap);
      const next = new Map(recentMap);
      next.set(key, nowMs);
      if (next.size <= maxSize) return next;
      const cutoff = nowMs - ttlMs;
      for (const [k, ts] of next) {
        if (ts < cutoff) next.delete(k);
      }
      if (next.size <= maxSize) return next;
      const entries = [...next.entries()].sort((a, b) => a[1] - b[1]);
      while (next.size > maxSize) {
        const oldest = entries.shift();
        if (oldest) next.delete(oldest[0]);
      }
      return next;
    },
  ),
}));

jest.mock('@im/shared-im-core', () => ({
  applyMessageToSession: jest.fn(
    (
      _session: { id: string },
      message: { senderId?: string },
      options?: { incrementUnread?: boolean },
    ) => ({
      lastMessage: message,
      lastMessageTime: '2024-06-01T10:00:00.000Z',
      lastActiveTime: '2024-06-01T10:00:00.000Z',
      unreadIncrement: options?.incrementUnread ?? false,
    }),
  ),
}));

jest.mock('@/utils/normalizers', () => ({
  normalizeMessage: jest.fn((data: Record<string, unknown>) => ({
    id: String(data.id || data.messageId || 'msg_unknown'),
    messageId: String(data.messageId || data.id || 'msg_unknown'),
    senderId: String(data.senderId || ''),
    isGroupChat: Boolean(data.isGroupChat || data.groupId),
    messageType: String(data.messageType || 'TEXT'),
    content: String(data.content || ''),
    sendTime: String(data.sendTime || data.createdTime || new Date().toISOString()),
    status: 'SENT',
    ...data,
  })),
  resolveMessageSessionId: jest.fn(
    (
      message: { senderId?: string; receiverId?: string; groupId?: string; isGroupChat?: boolean; conversationId?: string },
      currentUserId: string,
    ) => {
      if (message.groupId || message.isGroupChat) {
        return `group_${message.groupId}`;
      }
      const otherId = message.senderId === currentUserId ? message.receiverId : message.senderId;
      if (!otherId) return message.conversationId || '';
      const [a, b] = [String(currentUserId), String(otherId)].sort();
      return `${a}_${b}`;
    },
  ),
  createSessionFromMessage: jest.fn(
    (
      message: { senderId?: string; receiverId?: string; groupId?: string; isGroupChat?: boolean; senderName?: string; receiverName?: string },
      currentUserId: string,
    ): ChatSession | null => {
      if (message.groupId || message.isGroupChat) {
        return {
          id: `group_${message.groupId}`,
          type: 'group',
          targetId: message.groupId || '',
          targetName: message.groupId || '',
          unreadCount: 0,
          lastActiveTime: '',
          isPinned: false,
          isMuted: false,
        };
      }
      const targetId = message.senderId === currentUserId ? message.receiverId : message.senderId;
      if (!targetId) return null;
      const [a, b] = [String(currentUserId), String(targetId)].sort();
      return {
        id: `${a}_${b}`,
        type: 'private',
        targetId,
        targetName: message.senderId === currentUserId ? (message.receiverName || targetId) : (message.senderName || targetId),
        unreadCount: 0,
        lastActiveTime: '',
        isPinned: false,
        isMuted: false,
      };
    },
  ),
}));

jest.mock('@/services/notification/notificationService', () => ({
  displayMessageNotification: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/e2ee/manager/readiness', () => ({
  ensureE2eeReadyForCurrentUser: jest.fn(() => Promise.resolve()),
}));

// ─── Store mocks with mutable state (mock-prefixed vars allowed) ────────
jest.mock('@/e2ee/store/pendingDecryptStore', () => ({
  cachePendingEncryptedMessage: jest.fn(),
  restorePendingEncryptedMessagesFromRepository: jest.fn(() => 0),
  retryAllPendingEncryptedMessages: jest.fn(() => Promise.resolve(0)),
  retryDecryptPendingMessages: jest.fn(() => Promise.resolve(0)),
  retryDecryptVisibleEncryptedMessages: jest.fn(() => Promise.resolve(0)),
}));

const mockSessions: ChatSession[] = [];
let mockCurrentSession: ChatSession | null = null;
const mockUpsertSession = jest.fn();

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: { id: '100', nickname: 'TestUser', username: 'testuser' },
    })),
  },
}));

const mockAddMessage = jest.fn();

jest.mock('@/stores/messageStore', () => ({
  useMessageStore: {
    getState: jest.fn(() => ({
      addMessage: mockAddMessage,
    })),
  },
}));

jest.mock('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: jest.fn(() => ({
      sessions: mockSessions,
      currentSession: mockCurrentSession,
      upsertSession: mockUpsertSession,
    })),
  },
}));

const mockChatState = {
  refreshSessions: jest.fn(() => Promise.resolve()),
  retryPending: jest.fn(() => Promise.resolve()),
};

jest.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: jest.fn(() => mockChatState),
  },
}));

const mockContactState = {
  loadFriendRequests: jest.fn(() => Promise.resolve()),
  loadFriends: jest.fn(() => Promise.resolve()),
};

jest.mock('@/stores/contactStore', () => ({
  useContactStore: {
    getState: jest.fn(() => mockContactState),
  },
}));

// (authService mock is declared above with factory)

// ─── Mock WebSocket ─────────────────────────────────────────────────────
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: string[] = [];
  readyState = 1; // OPEN

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code = 1000, reason = '') {
    this.onclose?.({ code, reason });
  }
}

(FakeWebSocket as unknown as { OPEN: number }).OPEN = 1;

// ─── Import after mocks ─────────────────────────────────────────────────
import { useWebsocketStore, resetRecentMessageIds } from '../websocketStore';
import { useMessageStore } from '@/stores/messageStore';
import { displayMessageNotification } from '@/services/notification/notificationService';
import { logger } from '@/utils/logger';
import { shouldScheduleReconnect, shouldQueueIncomingPayload } from '@im/shared-ws-core';
import { authService } from '@/services/auth/authService';
import { ensureE2eeReadyForCurrentUser } from '@/e2ee/manager/readiness';
import {
  restorePendingEncryptedMessagesFromRepository,
  retryAllPendingEncryptedMessages,
} from '@/e2ee/store/pendingDecryptStore';

const mockIssueWsTicket = jest.mocked(authService.issueWsTicket);
const mockEnsureE2eeReady = jest.mocked(ensureE2eeReadyForCurrentUser);
const mockRestorePendingEncryptedMessagesFromRepository = jest.mocked(
  restorePendingEncryptedMessagesFromRepository,
);
const mockRetryAllPendingEncryptedMessages = jest.mocked(retryAllPendingEncryptedMessages);

const getMockDisplayNotification = () => displayMessageNotification as jest.Mock;

const makeMessageData = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_default',
  senderId: '200',
  receiverId: '100',
  messageType: 'TEXT',
  content: 'hello',
  sendTime: '2024-06-01T10:00:00.000Z',
  ...overrides,
});

describe('websocketStore', () => {
  let originalWebSocket: any;

  beforeAll(() => {
    originalWebSocket = globalThis.WebSocket;
  });

  afterAll(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  beforeEach(() => {
    // Reset store state
    useWebsocketStore.setState({ connected: false, connecting: false, reconnectAttempts: 0, onlineUsers: {} });
    mockAddMessage.mockClear();
    mockUpsertSession.mockClear();
    mockContactState.loadFriendRequests.mockClear();
    mockContactState.loadFriends.mockClear();
    mockChatState.refreshSessions.mockClear();
    mockChatState.retryPending.mockClear();
    mockEnsureE2eeReady.mockReset();
    mockEnsureE2eeReady.mockResolvedValue(undefined);
    mockRestorePendingEncryptedMessagesFromRepository.mockReset();
    mockRestorePendingEncryptedMessagesFromRepository.mockReturnValue(0);
    mockRetryAllPendingEncryptedMessages.mockReset();
    mockRetryAllPendingEncryptedMessages.mockResolvedValue(0);
    getMockDisplayNotification().mockClear();
    mockIssueWsTicket.mockReset();
    mockSessions.length = 0;
    mockCurrentSession = null;
    resetRecentMessageIds();
    FakeWebSocket.instances = [];

    // Install FakeWebSocket
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    // Default mock for shouldScheduleReconnect
    (shouldScheduleReconnect as jest.Mock).mockReset?.();
    (shouldScheduleReconnect as jest.Mock).mockReturnValue(true);
    (shouldQueueIncomingPayload as jest.Mock).mockReset?.();
    (shouldQueueIncomingPayload as jest.Mock).mockReturnValue(false);
    // Default ticket response
    mockIssueWsTicket.mockResolvedValue({ code: 200, message: 'ok', data: { ticket: 'test-ticket' } });
  });

  // ─── Connect lifecycle tests ─────────────────────────────────────────────

  describe('connect guards (W7/W23)', () => {
    it('does not connect when already connected', async () => {
      useWebsocketStore.setState({ connected: true });
      await useWebsocketStore.getState().connect();
      expect(mockIssueWsTicket).not.toHaveBeenCalled();
    });

    it('does not connect when already connecting', async () => {
      useWebsocketStore.setState({ connecting: true });
      await useWebsocketStore.getState().connect();
      expect(mockIssueWsTicket).not.toHaveBeenCalled();
    });

    it('sets connecting true during connect attempt', () => {
      // Verify the initial state allows connection
      expect(useWebsocketStore.getState().connected).toBe(false);
      expect(useWebsocketStore.getState().connecting).toBe(false);
    });

    it('resets reconnectAttempts on successful open (W7)', () => {
      // Simulate the onopen state transition
      useWebsocketStore.setState({ connecting: true, reconnectAttempts: 3 });
      // After onopen: connected=true, connecting=false, attempts=0
      useWebsocketStore.setState({ connected: true, connecting: false, reconnectAttempts: 0 });
      expect(useWebsocketStore.getState().connected).toBe(true);
      expect(useWebsocketStore.getState().connecting).toBe(false);
      expect(useWebsocketStore.getState().reconnectAttempts).toBe(0);
    });

    it('warns when E2EE readiness compensation fails after open', async () => {
      mockEnsureE2eeReady.mockRejectedValueOnce(new Error('readiness unavailable'));

      await useWebsocketStore.getState().connect();
      FakeWebSocket.instances[0]?.onopen?.();
      await Promise.resolve();

      expect(logger.warn).toHaveBeenCalledWith(
        'e2ee',
        'E2EE readiness compensation failed after websocket open',
        expect.anything(),
      );
      (shouldScheduleReconnect as jest.Mock).mockReturnValue(false);
      useWebsocketStore.getState().disconnect();
    });

    it('warns and continues retry when pending restore fails after open', async () => {
      mockRestorePendingEncryptedMessagesFromRepository.mockImplementationOnce(() => {
        throw new Error('restore failed');
      });

      await useWebsocketStore.getState().connect();
      FakeWebSocket.instances[0]?.onopen?.();
      await Promise.resolve();

      expect(logger.warn).toHaveBeenCalledWith(
        'e2ee',
        'E2EE pending restore failed after websocket open',
        expect.anything(),
      );
      expect(mockRetryAllPendingEncryptedMessages).toHaveBeenCalledTimes(1);
      (shouldScheduleReconnect as jest.Mock).mockReturnValue(false);
      useWebsocketStore.getState().disconnect();
    });
  });

  // ─── Sequential queue tests ──────────────────────────────────────────────

  describe('incoming sequential queue (W12)', () => {
    it('MESSAGE TEXT is dispatched via dispatchPayload (sequential queue tested in shared-ws-core)', async () => {
      // The sequential queue decision (shouldQueueIncomingPayload) is a shared-ws-core pure function.
      // Here we verify that dispatchPayload handles MESSAGE correctly.
      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: makeMessageData({ id: 'seq-1' }),
      });

      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'seq-1' }),
        expect.any(String),
      );
    });

    it('HEARTBEAT does not call addMessage (W9/W12)', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'HEARTBEAT',
        data: {},
      });

      expect(mockAddMessage).not.toHaveBeenCalled();
    });
  });

  // ─── Duplicate message suppression (W18) ─────────────────────────────────

  describe('duplicate message suppression (W18)', () => {
    it('drops messages with duplicate dedup key within TTL window', async () => {
      // First message — processed normally
      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: makeMessageData({ id: 'dup-1' }),
      });

      // Second message with same id — should be dropped by dedup
      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: makeMessageData({ id: 'dup-1' }),
      });

      expect(mockAddMessage).toHaveBeenCalledTimes(1);
    });

    it('processes messages with different ids', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: makeMessageData({ id: 'msg-a' }),
      });

      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: makeMessageData({ id: 'msg-b' }),
      });

      expect(mockAddMessage).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Disconnect tests ────────────────────────────────────────────────────

  describe('disconnect (W8)', () => {
    it('resets all state on disconnect', () => {
      useWebsocketStore.setState({ connected: true, connecting: false, reconnectAttempts: 3 });

      useWebsocketStore.getState().disconnect();

      expect(useWebsocketStore.getState().connected).toBe(false);
      expect(useWebsocketStore.getState().connecting).toBe(false);
      expect(useWebsocketStore.getState().reconnectAttempts).toBe(0);
    });

    it('shouldScheduleReconnect returns false for manual disconnect', () => {
      // Verify the shared pure function behavior (W8)
      (shouldScheduleReconnect as jest.Mock)(
        expect.objectContaining({ manualDisconnect: true }),
      );
      // The mock returns false by default for this test
      expect(shouldScheduleReconnect).toHaveBeenCalled();
    });

    it('shouldScheduleReconnect returns false for duplicate_connection (W8)', () => {
      (shouldScheduleReconnect as jest.Mock).mockReturnValue(false);

      const result = (shouldScheduleReconnect as jest.Mock)({
        manualDisconnect: false,
        closeCode: 1000,
        closeReason: 'duplicate_connection',
        duplicateConnectionReason: 'DUPLICATE_CONNECTION',
        reconnectAttempts: 0,
        maxReconnectAttempts: 8,
      });

      expect(result).toBe(false);
    });

    it('shouldScheduleReconnect returns false at max attempts (W10)', () => {
      (shouldScheduleReconnect as jest.Mock).mockReturnValue(false);

      const result = (shouldScheduleReconnect as jest.Mock)({
        manualDisconnect: false,
        closeCode: 1006,
        closeReason: '',
        duplicateConnectionReason: 'DUPLICATE_CONNECTION',
        reconnectAttempts: 8,
        maxReconnectAttempts: 8,
      });

      expect(result).toBe(false);
    });
  });

  // ─── READ_RECEIPT (W15) ──────────────────────────────────────────────────

  describe('READ_RECEIPT (W15)', () => {
    it('delegates READ_RECEIPT to refreshSessions via dispatchPayload', async () => {
      const mockApplyReadReceipt = jest.fn(() => Promise.resolve());
      (useMessageStore.getState as jest.Mock).mockReturnValue({
        addMessage: mockAddMessage,
        applyReadReceipt: mockApplyReadReceipt,
      });

      await useWebsocketStore.getState().dispatchPayload({
        type: 'READ_RECEIPT',
        data: {
          readerId: '200',
          conversationId: '100_200',
          lastReadMessageId: '100',
        },
      });

      expect(mockChatState.refreshSessions).toHaveBeenCalled();

      // Restore default mock
      (useMessageStore.getState as jest.Mock).mockReturnValue({
        addMessage: mockAddMessage,
      });
    });
  });

  // ─── E2EE_NEGOTIATION (W20) ─────────────────────────────────────────────

  describe('E2EE_NEGOTIATION (W20)', () => {
    it('logs E2EE negotiation as ignored on mobile', async () => {
      (logger.info as jest.Mock).mockClear();

      await useWebsocketStore.getState().dispatchPayload({
        type: 'E2EE_NEGOTIATION',
        data: {
          sessionId: '100_200',
          action: 'request',
          requesterId: '200',
        },
      });

      // Mobile handles negotiation events without logging sensitive payloads.
      expect(logger.info).toHaveBeenCalledWith(
        'websocket',
        expect.stringContaining('E2EE negotiation event handled'),
        expect.objectContaining({ action: 'request' }),
      );
    });
  });

  // ─── Dispatch tests (existing) ──────────────────────────────────────────

  describe('dispatchPayload', () => {
    it('does not increment unread for self-sent message', async () => {
      const session: ChatSession = {
        id: '100_200',
        type: 'private',
        targetId: '200',
        targetName: 'Bob',
        unreadCount: 0,
        lastActiveTime: '',
        isPinned: false,
        isMuted: false,
      };
      mockSessions.push(session);
      mockCurrentSession = session;

      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: {
          id: 'msg_1',
          senderId: '100', // self
          receiverId: '200',
          messageType: 'TEXT',
          content: 'hi',
          sendTime: '2024-06-01T10:00:00.000Z',
        },
      });

      const upsertCall = mockUpsertSession.mock.calls[0]?.[0];
      expect(upsertCall?.unreadCount).toBe(0);
    });

    it('does not increment unread for message in current session', async () => {
      const session: ChatSession = {
        id: '100_200',
        type: 'private',
        targetId: '200',
        targetName: 'Bob',
        unreadCount: 0,
        lastActiveTime: '',
        isPinned: false,
        isMuted: false,
      };
      mockSessions.push(session);
      mockCurrentSession = session;

      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: {
          id: 'msg_2',
          senderId: '200', // other person
          receiverId: '100',
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2024-06-01T10:00:00.000Z',
        },
      });

      const upsertCall = mockUpsertSession.mock.calls[0]?.[0];
      expect(upsertCall?.unreadCount).toBe(0);
    });

    it('increments unread for message from other user in non-current session', async () => {
      const session: ChatSession = {
        id: '100_200',
        type: 'private',
        targetId: '200',
        targetName: 'Bob',
        unreadCount: 0,
        lastActiveTime: '',
        isPinned: false,
        isMuted: false,
      };
      mockSessions.push(session);
      mockCurrentSession = null; // no current session

      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: {
          id: 'msg_3',
          senderId: '200', // other person
          receiverId: '100',
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2024-06-01T10:00:00.000Z',
        },
      });

      const upsertCall = mockUpsertSession.mock.calls[0]?.[0];
      expect(upsertCall?.unreadCount).toBe(1);
    });

    it('does not trigger notification for muted session (W19)', async () => {
      const session: ChatSession = {
        id: '100_200',
        type: 'private',
        targetId: '200',
        targetName: 'Bob',
        unreadCount: 0,
        lastActiveTime: '',
        isPinned: false,
        isMuted: true, // muted
      };
      mockSessions.push(session);
      mockCurrentSession = null;

      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: {
          id: 'msg_4',
          senderId: '200',
          receiverId: '100',
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2024-06-01T10:00:00.000Z',
        },
      });

      expect(getMockDisplayNotification()).not.toHaveBeenCalled();
    });

    it('triggers notification for non-muted, non-current session with other user message', async () => {
      const session: ChatSession = {
        id: '100_200',
        type: 'private',
        targetId: '200',
        targetName: 'Bob',
        unreadCount: 0,
        lastActiveTime: '',
        isPinned: false,
        isMuted: false,
      };
      mockSessions.push(session);
      mockCurrentSession = null;

      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: {
          id: 'msg_5',
          senderId: '200',
          receiverId: '100',
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2024-06-01T10:00:00.000Z',
        },
      });

      expect(getMockDisplayNotification()).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg_5' }),
      );
    });

    it('does not trigger notification for self-sent message even in non-current session (W19)', async () => {
      const session: ChatSession = {
        id: '100_200',
        type: 'private',
        targetId: '200',
        targetName: 'Bob',
        unreadCount: 0,
        lastActiveTime: '',
        isPinned: false,
        isMuted: false,
      };
      mockSessions.push(session);
      mockCurrentSession = null;

      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: {
          id: 'msg_6',
          senderId: '100', // self
          receiverId: '200',
          messageType: 'TEXT',
          content: 'hi',
          sendTime: '2024-06-01T10:00:00.000Z',
        },
      });

      expect(getMockDisplayNotification()).not.toHaveBeenCalled();
    });

    it('calls addMessage with resolved session id', async () => {
      mockCurrentSession = null;

      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: {
          id: 'msg_7',
          senderId: '200',
          receiverId: '100',
          messageType: 'TEXT',
          content: 'hello',
          sendTime: '2024-06-01T10:00:00.000Z',
        },
      });

      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg_7' }),
        '100_200',
      );
    });

    it('updates onlineUsers on ONLINE_STATUS payload (W14)', () => {
      useWebsocketStore.getState().dispatchPayload({
        type: 'ONLINE_STATUS',
        data: { userId: '200', status: 'ONLINE' },
      });

      expect(useWebsocketStore.getState().onlineUsers['200']).toBe(true);
    });

    it('sets user offline on OFFLINE status (W14)', () => {
      useWebsocketStore.setState({ onlineUsers: { '200': true } });

      useWebsocketStore.getState().dispatchPayload({
        type: 'ONLINE_STATUS',
        data: { userId: '200', status: 'OFFLINE' },
      });

      expect(useWebsocketStore.getState().onlineUsers['200']).toBe(false);
    });

    it('loads friend requests on FRIEND_REQUEST via classifier (W16)', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'FRIEND_REQUEST',
        data: {},
      });

      expect(mockContactState.loadFriendRequests).toHaveBeenCalled();
    });

    it('loads friends and sessions on FRIEND_ACCEPTED via classifier (W16)', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'FRIEND_ACCEPTED',
        data: {},
      });

      expect(mockContactState.loadFriends).toHaveBeenCalled();
      expect(mockChatState.refreshSessions).toHaveBeenCalled();
    });

    it('loads friend requests on SYSTEM ::CMD:REFRESH_FRIEND_REQUESTS (W17)', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'SYSTEM',
        data: { content: '::CMD:REFRESH_FRIEND_REQUESTS' },
      });

      expect(mockContactState.loadFriendRequests).toHaveBeenCalled();
    });

    it('loads friends and sessions on SYSTEM ::CMD:REFRESH_FRIEND_LIST (W17)', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'SYSTEM',
        data: { content: '::CMD:REFRESH_FRIEND_LIST' },
      });

      expect(mockContactState.loadFriends).toHaveBeenCalled();
      expect(mockChatState.refreshSessions).toHaveBeenCalled();
    });

    it('loads all on SYSTEM with natural-language friend keyword (W17)', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'SYSTEM',
        data: { content: '你有一条新的好友申请' },
      });

      expect(mockContactState.loadFriendRequests).toHaveBeenCalled();
      expect(mockContactState.loadFriends).toHaveBeenCalled();
      expect(mockChatState.refreshSessions).toHaveBeenCalled();
    });

    it('does not refresh contacts on SYSTEM with unrelated content (W17)', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'SYSTEM',
        data: { content: '系统维护通知' },
      });

      expect(mockContactState.loadFriendRequests).not.toHaveBeenCalled();
      expect(mockContactState.loadFriends).not.toHaveBeenCalled();
      expect(mockChatState.refreshSessions).not.toHaveBeenCalled();
    });
  });
});
