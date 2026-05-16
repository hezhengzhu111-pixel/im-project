/**
 * E2EE_NEGOTIATION deferred behavior tests for Mobile websocketStore.
 *
 * Verifies Track A compliance: Mobile must not accept negotiation, not change
 * encrypted state, not send messages, and not log sensitive payload fields.
 *
 * Boundary references: E3.3, E5.3, E10, E11.3, E20.1, E32.3, E32.5
 */

import type { ChatSession } from '@im/shared-types';

// ─── Auto-mock simple dependencies ──────────────────────────────────────
jest.mock('@/services/debug/debugTelemetry');
jest.mock('@/services/platform/appLifecycle');
jest.mock('@/services/platform/networkStatus');
jest.mock('@/utils/logger');

// ─── Factory mock for authService ───────────────────────────────────────
const mockIssueWsTicket = jest.fn();
jest.mock('@/services/auth/authService', () => ({
  authService: {
    issueWsTicket: mockIssueWsTicket,
  },
}));

// ─── Factory mocks for external packages ────────────────────────────────
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
  applyPresenceToRecord: jest.fn((record: Record<string, boolean>) => record),
  classifyContactRefreshFromWsType: jest.fn(() => null),
  classifyContactRefreshFromSystemContent: jest.fn(() => null),
  createHeartbeatPayload: jest.fn(() => '{"type":"HEARTBEAT"}'),
  createReconnectDelay: jest.fn(() => 1000),
  createWebSocketDiagnosticsSnapshot: jest.fn((input) => ({
    status: input.connected ? 'connected' : input.connecting ? 'connecting' : 'disconnected',
    reconnectAttempts: input.reconnectAttempts,
    lastEventAt: input.lastEventAt,
  })),
  createTicketedWebSocketUrl: jest.fn(() => 'ws://localhost/ws'),
  parseWebSocketPayload: jest.fn((data: string) => JSON.parse(data)),
  shouldProcessSequentially: jest.fn(() => false),
  shouldQueueIncomingPayload: jest.fn(() => false),
  shouldScheduleReconnect: jest.fn(() => true),
  getMessageDedupKey: jest.fn(() => ''),
  shouldDropRecentMessage: jest.fn(() => false),
  rememberRecentMessage: jest.fn((map: ReadonlyMap<string, number>) => map),
}));

jest.mock('@im/shared-im-core', () => ({
  applyMessageToSession: jest.fn((_session: unknown, message: Record<string, unknown>) => ({
    lastMessage: message,
    lastMessageTime: '2024-06-01T10:00:00.000Z',
    lastActiveTime: '2024-06-01T10:00:00.000Z',
    unreadIncrement: false,
  })),
}));

jest.mock('@/utils/normalizers', () => ({
  normalizeMessage: jest.fn((data: Record<string, unknown>) => ({
    id: String(data.id || data.messageId || 'msg_unknown'),
    messageId: String(data.messageId || data.id || 'msg_unknown'),
    senderId: String(data.senderId || ''),
    isGroupChat: Boolean(data.isGroupChat || data.groupId),
    messageType: String(data.messageType || 'TEXT'),
    content: String(data.content || ''),
    sendTime: String(data.sendTime || new Date().toISOString()),
    status: 'SENT',
    ...data,
  })),
  resolveMessageSessionId: jest.fn(() => ''),
  createSessionFromMessage: jest.fn(() => null),
}));

jest.mock('@/services/notification/notificationService', () => ({
  displayMessageNotification: jest.fn(() => Promise.resolve()),
}));

// ─── Store mocks ────────────────────────────────────────────────────────
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

jest.mock('@/stores/contactStore', () => ({
  useContactStore: {
    getState: jest.fn(() => ({
      loadFriendRequests: jest.fn(() => Promise.resolve()),
      loadFriends: jest.fn(() => Promise.resolve()),
    })),
  },
}));

// ─── Import after mocks ─────────────────────────────────────────────────
import { useWebsocketStore, resetRecentMessageIds } from '../websocketStore';
import { logger } from '@/utils/logger';
import { useSessionStore } from '@/stores/sessionStore';
import { displayMessageNotification } from '@/services/notification/notificationService';
import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';

// ─── Sensitive field sentinel values for leak detection ──────────────────
const SENSITIVE_IDENTITY_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_FAKE_IDENTITY_KEY_SHOULD_NOT_APPEAR_IN_LOGS';
const SENSITIVE_EPHEMERAL_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_FAKE_EPHEMERAL_KEY_SHOULD_NOT_APPEAR_IN_LOGS';
const SENSITIVE_PAYLOAD_JSON = JSON.stringify({
  senderIdentityKey: SENSITIVE_IDENTITY_KEY,
  ephemeralPublicKey: SENSITIVE_EPHEMERAL_KEY,
  deviceId: 'device-secret-123',
  rootKey: 'super-secret-root-key',
});

// ─── Helper to build E2EE_NEGOTIATION payload ──────────────────────────
const makeE2eeNegotiationPayload = (
  action: string,
  overrides: Record<string, unknown> = {},
) => ({
  type: 'E2EE_NEGOTIATION',
  data: {
    sessionId: '100_200',
    action,
    requesterId: '200',
    requestPayloadJson: SENSITIVE_PAYLOAD_JSON,
    ...overrides,
  },
});

// ─── Collect all logger calls for sensitive field audit ──────────────────
let loggerCalls: string[];

beforeEach(() => {
  loggerCalls = [];
  (logger.info as jest.Mock).mockImplementation((...args: unknown[]) => {
    loggerCalls.push(args.map(String).join(' '));
  });
  (logger.warn as jest.Mock).mockImplementation((...args: unknown[]) => {
    loggerCalls.push(args.map(String).join(' '));
  });
  (logger.error as jest.Mock).mockImplementation((...args: unknown[]) => {
    loggerCalls.push(args.map(String).join(' '));
  });
});

describe('E2EE_NEGOTIATION deferred behavior (E3.3 / E5.3 / E11.3)', () => {
  beforeAll(() => {
    // noop — global WebSocket is not needed for dispatchPayload tests
  });

  beforeEach(() => {
    useWebsocketStore.setState({
      connected: false,
      connecting: false,
      reconnectAttempts: 0,
      onlineUsers: {},
    });
    mockAddMessage.mockClear();
    (displayMessageNotification as jest.Mock).mockClear();
    mockUpsertSession.mockClear();
    mockChatState.refreshSessions.mockClear();
    mockChatState.retryPending.mockClear();
    mockSessions.length = 0;
    mockCurrentSession = null;
    resetRecentMessageIds();
    loggerCalls = [];

    // Encrypted session for state-change detection tests
    mockCurrentSession = {
      id: '100_200',
      type: 'private',
      targetId: '200',
      targetName: 'Bob',
      unreadCount: 0,
      lastActiveTime: '',
      isPinned: false,
      isMuted: false,
      encrypted: true,
    };
    mockSessions.push(mockCurrentSession);
  });

  // ─── Test 1: Does not throw ─────────────────────────────────────────────

  describe('does not throw on E2EE_NEGOTIATION', () => {
    it.each(['request', 'accepted', 'rejected', 'disabled'])(
      'does not throw for action=%s',
      async (action) => {
        await expect(
          useWebsocketStore.getState().dispatchPayload(
            makeE2eeNegotiationPayload(action),
          ),
        ).resolves.toBeUndefined();
      },
    );

    it('does not throw when data is missing', async () => {
      await expect(
        useWebsocketStore.getState().dispatchPayload({
          type: 'E2EE_NEGOTIATION',
          data: {},
        }),
      ).resolves.toBeUndefined();
    });

    it('does not throw when data contains sensitive key material', async () => {
      await expect(
        useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload('request', {
            requestPayloadJson: SENSITIVE_PAYLOAD_JSON,
            identityKey: SENSITIVE_IDENTITY_KEY,
            ephemeralKey: SENSITIVE_EPHEMERAL_KEY,
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  // ─── Test 2: Does not call any negotiation accept function ──────────────

  describe('does not call any encryption negotiation accept function', () => {
    it('does not call addMessage for any negotiation action', async () => {
      for (const action of ['request', 'accepted', 'rejected', 'disabled']) {
        await useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload(action),
        );
      }
      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('does not call refreshSessions for negotiation events', async () => {
      for (const action of ['request', 'accepted', 'rejected', 'disabled']) {
        await useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload(action),
        );
      }
      // refreshSessions is only for READ_RECEIPT and contact events, not negotiation
      expect(mockChatState.refreshSessions).not.toHaveBeenCalled();
    });

    it('does not call upsertSession for negotiation events', async () => {
      for (const action of ['request', 'accepted', 'rejected', 'disabled']) {
        await useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload(action),
        );
      }
      expect(mockUpsertSession).not.toHaveBeenCalled();
    });
  });

  // ─── Test 3: Does not change session encrypted state ────────────────────

  describe('does not change current session encrypted state', () => {
    it('session.encrypted remains true after request action', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request'),
      );
      const session = useSessionStore.getState().sessions.find(
        (s: ChatSession) => s.id === '100_200',
      );
      expect(session?.encrypted).toBe(true);
    });

    it('session.encrypted remains true after accepted action', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('accepted'),
      );
      const session = useSessionStore.getState().sessions.find(
        (s: ChatSession) => s.id === '100_200',
      );
      expect(session?.encrypted).toBe(true);
    });

    it('session.encrypted remains true after rejected action', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('rejected'),
      );
      const session = useSessionStore.getState().sessions.find(
        (s: ChatSession) => s.id === '100_200',
      );
      expect(session?.encrypted).toBe(true);
    });

    it('session.encrypted remains true after disabled action', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('disabled'),
      );
      const session = useSessionStore.getState().sessions.find(
        (s: ChatSession) => s.id === '100_200',
      );
      expect(session?.encrypted).toBe(true);
    });

    it('session.encrypted does not flip from false to true', async () => {
      // Set session to non-encrypted
      const plainSession: ChatSession = {
        id: '100_300',
        type: 'private',
        targetId: '300',
        targetName: 'Charlie',
        unreadCount: 0,
        lastActiveTime: '',
        isPinned: false,
        isMuted: false,
      };
      mockSessions.push(plainSession);
      mockCurrentSession = plainSession;

      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request', { sessionId: '100_300' }),
      );

      const session = useSessionStore.getState().sessions.find(
        (s: ChatSession) => s.id === '100_300',
      );
      expect(session?.encrypted).toBeFalsy();
    });
  });

  // ─── Test 4: Does not send messages ─────────────────────────────────────

  describe('does not send any messages', () => {
    it('does not call addMessage for request action', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request'),
      );
      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('does not call addMessage for accepted action', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('accepted'),
      );
      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('does not call addMessage for rejected action', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('rejected'),
      );
      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('does not call addMessage for disabled action', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('disabled'),
      );
      expect(mockAddMessage).not.toHaveBeenCalled();
    });
  });

  // ─── Test 5: Masks encrypted MESSAGE payloads before store/notification ─

  describe('masks encrypted inbound messages', () => {
    it('does not pass ciphertext or encrypted media metadata to message store or notification', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'MESSAGE',
        data: {
          id: 'enc_msg_1',
          messageId: 'enc_msg_1',
          senderId: '200',
          receiverId: '100',
          isGroupChat: false,
          messageType: 'IMAGE',
          content: 'ciphertext-image-body',
          mediaUrl: 'https://cdn.example/encrypted-image.jpg',
          mediaName: 'secret.jpg',
          mediaSize: 4096,
          encrypted: true,
          sendTime: '2024-06-01T10:00:00.000Z',
          status: 'SENT',
        },
      });

      expect(mockAddMessage).toHaveBeenCalledTimes(1);
      const storedMessage = mockAddMessage.mock.calls[0][0];
      expect(storedMessage.content).toBe(E2EE_UNSUPPORTED_TEXT);
      expect(storedMessage.mediaUrl).toBeUndefined();
      expect(storedMessage.mediaName).toBeUndefined();
      expect(storedMessage.mediaSize).toBeUndefined();

      expect(displayMessageNotification).toHaveBeenCalledTimes(1);
      const notifiedMessage = (displayMessageNotification as jest.Mock).mock.calls[0][0];
      expect(notifiedMessage.content).toBe(E2EE_UNSUPPORTED_TEXT);
      expect(notifiedMessage.mediaUrl).toBeUndefined();
      expect(notifiedMessage.mediaName).toBeUndefined();
    });
  });

  // ─── Test 5: Does not log sensitive payload fields (E20.1 / E32.5) ─────

  describe('does not log sensitive payload fields', () => {
    it('logs action type but not requestPayloadJson', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request'),
      );

      // Should have logged something (deferred log)
      expect(loggerCalls.length).toBeGreaterThan(0);

      // Must NOT contain requestPayloadJson original value
      for (const logLine of loggerCalls) {
        expect(logLine).not.toContain(SENSITIVE_PAYLOAD_JSON);
        expect(logLine).not.toContain('senderIdentityKey');
        expect(logLine).not.toContain('ephemeralPublicKey');
        expect(logLine).not.toContain('deviceId');
        expect(logLine).not.toContain('rootKey');
      }
    });

    it('does not log identity key material', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request', {
          identityKey: SENSITIVE_IDENTITY_KEY,
        }),
      );

      for (const logLine of loggerCalls) {
        expect(logLine).not.toContain(SENSITIVE_IDENTITY_KEY);
        expect(logLine).not.toContain('FAKE_IDENTITY_KEY');
      }
    });

    it('does not log ephemeral key material', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request', {
          ephemeralKey: SENSITIVE_EPHEMERAL_KEY,
        }),
      );

      for (const logLine of loggerCalls) {
        expect(logLine).not.toContain(SENSITIVE_EPHEMERAL_KEY);
        expect(logLine).not.toContain('FAKE_EPHEMERAL_KEY');
      }
    });

    it('logs action type for observability (E20.2)', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request'),
      );

      // Should include the action category for observability
      const hasActionLog = loggerCalls.some((line) =>
        line.includes('request'),
      );
      expect(hasActionLog).toBe(true);
    });

    it('logs unknown action safely when action field is missing', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'E2EE_NEGOTIATION',
        data: {
          sessionId: '100_200',
          requestPayloadJson: SENSITIVE_PAYLOAD_JSON,
        },
      });

      const hasUnknownLog = loggerCalls.some((line) =>
        line.includes('unknown'),
      );
      expect(hasUnknownLog).toBe(true);

      // Still must not leak payload
      for (const logLine of loggerCalls) {
        expect(logLine).not.toContain(SENSITIVE_PAYLOAD_JSON);
      }
    });
  });
});
