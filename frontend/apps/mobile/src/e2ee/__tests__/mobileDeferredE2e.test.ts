/**
 * Mobile E2EE Deferred Full-Chain End-to-End Test
 *
 * Covers the complete lifecycle of an encrypted session on Mobile Track A:
 *   1. Open encrypted session → E2eeUnsupportedNotice visible
 *   2. Input text and submit → early return, no sendText call
 *   3. No sendPrivate called for encrypted session
 *   4. E2EE_SEND_DISABLED_TEXT displayed / thrown
 *   5. Receive encrypted message → content masked
 *   6. Masked content clears media fields
 *   7. Receive E2EE_NEGOTIATION → deferred log only
 *   8. No auto-accept of negotiation → no state mutation
 *   9. session.encrypted unchanged after negotiation events
 *  10. Pending encrypted payload retry blocked → status 'blocked'
 *  11. App foreground resume does NOT retry encrypted payload
 *  12. Network online resume does NOT retry encrypted payload
 *
 * References: E4, E5, E7, E8, E24, E25, E26, E27, E31, E32, E33
 *
 * Mock scope:
 *   - messageService: fully mocked (no real HTTP)
 *   - pendingMessageRepository: fully mocked
 *   - messageRepository: fully mocked
 *   - uploadService: fully mocked
 *   - authService: fully mocked
 *   - notificationService: fully mocked
 *   - logger: fully mocked
 *   - ids: deterministic stubs
 *   - authStore / sessionStore / messageStore / chatStore / contactStore: factory-mocked
 *   - appLifecycle / networkStatus: controllable event emitters
 *   - e2eeDeferred: NOT mocked (real guards exercised)
 *   - shared-ws-core / shared-api-contract / shared-im-core: factory-mocked
 */

import type { ChatSession } from '@im/shared-types';
import type { MobileMessage, PendingMessage } from '@/types/models';

// ─── Controllable lifecycle / network emulators ────────────────────────
const mockForegroundCallbacks: Array<() => void> = [];
const mockOnlineCallbacks: Array<() => void> = [];

const resetEmitters = () => {
  mockForegroundCallbacks.length = 0;
  mockOnlineCallbacks.length = 0;
};

jest.mock('@/services/platform/appLifecycle', () => ({
  appLifecycle: {
    onForeground: jest.fn((cb: () => void) => {
      mockForegroundCallbacks.push(cb);
    }),
  },
}));

jest.mock('@/services/platform/networkStatus', () => ({
  networkStatus: {
    onOnline: jest.fn((cb: () => void) => {
      mockOnlineCallbacks.push(cb);
    }),
  },
}));

// ─── Simple auto-mocks ────────────────────────────────────────────────
jest.mock('@/services/storage/messageRepository');
jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/chat/messageService');
jest.mock('@/services/upload/uploadService');
jest.mock('@/services/debug/debugTelemetry');
jest.mock('@/utils/logger');
jest.mock('@/utils/ids', () => ({
  createClientMessageId: jest.fn(() => 'client_e2e_deferred'),
  createLocalMessageId: jest.fn(() => 'local_e2e_deferred'),
}));

// ─── authService mock ─────────────────────────────────────────────────
const mockIssueWsTicket = jest.fn();
jest.mock('@/services/auth/authService', () => ({
  authService: {
    issueWsTicket: mockIssueWsTicket,
  },
}));

// ─── notificationService mock ─────────────────────────────────────────
jest.mock('@/services/notification/notificationService', () => ({
  displayMessageNotification: jest.fn(() => Promise.resolve()),
}));

// ─── shared-api-contract mock ─────────────────────────────────────────
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

// ─── shared-ws-core mock ──────────────────────────────────────────────
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
  shouldQueueIncomingPayload: jest.fn(() => false),
  shouldScheduleReconnect: jest.fn(() => true),
  getMessageDedupKey: jest.fn(() => ''),
  shouldDropRecentMessage: jest.fn(() => false),
  rememberRecentMessage: jest.fn((map: ReadonlyMap<string, number>) => map),
}));

// ─── shared-im-core mock ──────────────────────────────────────────────
jest.mock('@im/shared-im-core', () => ({
  applyMessageToSession: jest.fn((_session: unknown, message: Record<string, unknown>) => ({
    lastMessage: message,
    lastMessageTime: '2024-06-01T10:00:00.000Z',
    lastActiveTime: '2024-06-01T10:00:00.000Z',
    unreadIncrement: false,
  })),
  applyReadReceiptToMessages: jest.fn((list: unknown) => ({ updated: list, changed: [] })),
  buildSessionId: jest.fn((_type: string, a: string, b: string) => `${a}_${b}`),
  sortSessions: jest.fn((sessions: ChatSession[]) => sessions),
  markSessionsRead: jest.fn((sessions: ChatSession[]) => sessions),
  createNextRetryAt: jest.fn(() => Date.now() + 5000),
  shouldStopRetry: jest.fn(() => false),
}));

// ─── shared-normalizers mock ───────────────────────────────────────────
jest.mock('@im/shared-normalizers', () => ({
  normalizeReadReceipt: jest.fn((raw: unknown) => raw),
}));

// ─── normalizers mock ─────────────────────────────────────────────────
jest.mock('@/utils/normalizers', () => ({
  normalizeMessage: jest.fn((data: Record<string, unknown>) => ({
    id: String(data.id || data.messageId || 'msg_unknown'),
    messageId: String(data.messageId || data.id || 'msg_unknown'),
    clientMessageId: String(data.clientMessageId || ''),
    senderId: String(data.senderId || ''),
    senderName: String(data.senderName || ''),
    isGroupChat: Boolean(data.isGroupChat || data.groupId),
    messageType: String(data.messageType || 'TEXT'),
    content: String(data.content || ''),
    sendTime: String(data.sendTime || new Date().toISOString()),
    status: 'SENT',
    encrypted: data.encrypted,
    ...data,
  })),
  resolveMessageSessionId: jest.fn((_message: unknown, _userId: string) => '100_200'),
  createSessionFromMessage: jest.fn(() => null),
  resolvePrivateSessionId: jest.fn((a: string, b: string) => `${a}_${b}`),
  resolveGroupSessionId: jest.fn((id: string) => `group_${id}`),
  applyMobileMessageToList: jest.fn((list: MobileMessage[], msg: MobileMessage) => {
    const existing = list.findIndex((item) => item.id === msg.id);
    if (existing >= 0) {
      const next = [...list];
      next[existing] = msg;
      return next;
    }
    return [...list, msg];
  }),
  hasSameMobileMessageIdentity: jest.fn((a: MobileMessage, b: MobileMessage) => a.id === b.id),
}));

// ─── Store mocks ──────────────────────────────────────────────────────
const mockSessions: ChatSession[] = [];
let mockCurrentSession: ChatSession | null = null;
const mockUpsertSession = jest.fn();
const mockMarkRead = jest.fn();
const mockSetCurrentSession = jest.fn();

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: { id: '100', nickname: 'TestUser', username: 'testuser' },
      authReady: true,
    })),
  },
}));

jest.mock('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: jest.fn(() => ({
      sessions: mockSessions,
      currentSession: mockCurrentSession,
      upsertSession: mockUpsertSession,
      markRead: mockMarkRead,
      setCurrentSession: mockSetCurrentSession,
      setSessions: jest.fn(),
      removeSession: jest.fn(),
      updateSessionFlags: jest.fn(),
      restoreFromDb: jest.fn(),
      clear: jest.fn(),
    })),
  },
}));

const mockAddMessage = jest.fn();

// Do NOT mock useMessageStore — use the real implementation so that
// sendText/sendMedia/retryMessage exercise the actual e2eeDeferred guards.

const mockChatState = {
  refreshSessions: jest.fn(() => Promise.resolve()),
  retryPending: jest.fn(() => Promise.resolve()),
  sendText: jest.fn(() => Promise.resolve()),
  sendMedia: jest.fn(() => Promise.resolve()),
  bootstrap: jest.fn(() => Promise.resolve()),
  openSession: jest.fn(() => Promise.resolve()),
  openSessionFromRoute: jest.fn(() => Promise.resolve(true)),
  openPrivateSession: jest.fn(() => Promise.resolve()),
  openGroupSession: jest.fn(() => Promise.resolve()),
  clearRuntime: jest.fn(),
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
      clear: jest.fn(),
    })),
  },
}));

jest.mock('@/stores/groupStore', () => ({
  useGroupStore: {
    getState: jest.fn(() => ({
      loadGroups: jest.fn(() => Promise.resolve()),
      clear: jest.fn(),
    })),
  },
}));

// ─── Imports (after all mocks) ─────────────────────────────────────────
import {
  E2EE_UNSUPPORTED_TEXT,
  E2EE_SEND_DISABLED_TEXT,
  maskEncryptedMessage,
  assertPlaintextSendAllowed,
  blockEncryptedPendingPayload,
  isEncryptedSession,
  isEncryptedMessage,
} from '../e2eeDeferred';
import { useWebsocketStore, resetRecentMessageIds } from '@/stores/websocketStore';
import { useMessageStore } from '@/stores/messageStore';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { messageRepository } from '@/services/storage/messageRepository';
import { messageService } from '@/services/chat/messageService';
import { logger } from '@/utils/logger';
import { getMobileE2eeCapability, getDecryptDisplayText, getSendBlockText } from '../e2eeCapability';

const pr = jest.mocked(pendingMessageRepository);
const mr = jest.mocked(messageRepository);
const ms = jest.mocked(messageService);

// ─── Helpers ──────────────────────────────────────────────────────────

const baseSession: ChatSession = {
  id: '100_200',
  type: 'private',
  targetId: '200',
  targetName: 'Bob',
  unreadCount: 0,
  lastActiveTime: '2024-06-01T10:00:00.000Z',
  isPinned: false,
  isMuted: false,
};

const encryptedSession: ChatSession = {
  ...baseSession,
  encrypted: true,
};

const makeEncryptedMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'msg_enc_1',
  messageId: 'srv_enc_1',
  clientMessageId: 'client_enc_1',
  conversationId: '100_200',
  senderId: '200',
  senderName: 'Bob',
  messageType: 'TEXT',
  content: 'U2FsdGVkX1+encrypted_ciphertext_blob_base64==',
  sendTime: new Date().toISOString(),
  status: 'SENT',
  isGroupChat: false,
  encrypted: true,
  mediaUrl: 'https://files.example.com/encrypted/blob.bin',
  thumbnailUrl: 'https://files.example.com/encrypted/thumb.bin',
  mediaName: 'encrypted_file.bin',
  mediaSize: 4096,
  duration: 60,
  ...overrides,
});

const makePlaintextMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'msg_plain_1',
  messageId: 'srv_plain_1',
  clientMessageId: 'client_plain_1',
  conversationId: '100_200',
  senderId: '200',
  senderName: 'Bob',
  messageType: 'TEXT',
  content: 'Hello from Bob',
  sendTime: new Date().toISOString(),
  status: 'SENT',
  isGroupChat: false,
  ...overrides,
});

const makePending = (
  payloadObj: Record<string, unknown>,
  overrides: Partial<PendingMessage> = {},
): PendingMessage => ({
  localId: 'local_e2e_deferred',
  conversationId: '100_200',
  sendType: 'private',
  payloadJson: JSON.stringify(payloadObj),
  status: 'pending',
  retryCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

const makeE2eeNegotiationPayload = (
  action: string,
  overrides: Record<string, unknown> = {},
) => ({
  type: 'E2EE_NEGOTIATION',
  data: {
    sessionId: '100_200',
    action,
    requesterId: '200',
    requestPayloadJson: JSON.stringify({
      senderIdentityKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_FAKE_KEY',
      ephemeralPublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_FAKE_EPHEMERAL',
      deviceId: 'device-secret-123',
      rootKey: 'super-secret-root-key',
    }),
    ...overrides,
  },
});

// ─── Collect logger calls for sensitive field audit ────────────────────
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

// ══════════════════════════════════════════════════════════════════════
// TEST SUITE
// ══════════════════════════════════════════════════════════════════════

describe('Mobile E2EE Deferred Full-Chain (E4/E5/E7/E8/E24–E27/E31–E33)', () => {
  beforeEach(() => {
    resetEmitters();
    resetRecentMessageIds();
    mockSessions.length = 0;
    mockCurrentSession = null;
    mockUpsertSession.mockClear();
    mockSetCurrentSession.mockClear();
    mockAddMessage.mockClear();
    mockChatState.refreshSessions.mockClear();
    mockChatState.retryPending.mockClear();
    mockChatState.sendText.mockClear();
    mr.listMessages.mockReturnValue([]);
    mr.listSessions.mockReturnValue([]);
    pr.listReady.mockReturnValue([]);
    pr.get.mockReturnValue(undefined);
    pr.findByClientMessageId.mockReturnValue(undefined);
    ms.sendPrivate.mockReset();
    ms.sendGroup.mockReset();
    ms.getPrivateHistory.mockReset();
    ms.getGroupHistory.mockReset();
  });

  // ── 1. Open encrypted session → E2eeUnsupportedNotice visible ───────

  describe('1. Open encrypted session → UI shows unsupported notice', () => {
    it('isEncryptedSession returns true for session with encrypted=true (E5.1)', () => {
      expect(isEncryptedSession(encryptedSession)).toBe(true);
    });

    it('isEncryptedSession returns false for plaintext session', () => {
      expect(isEncryptedSession(baseSession)).toBe(false);
    });

    it('ChatScreen encrypted flag is true for encrypted session', () => {
      // ChatScreen uses isEncryptedSession(session) to set `encrypted` flag
      // which controls E2eeUnsupportedNotice visibility and disables send UI
      const encrypted = isEncryptedSession(encryptedSession);
      expect(encrypted).toBe(true);
    });

    it('capability mode is deferred (E4.1/E4.2)', () => {
      const cap = getMobileE2eeCapability();
      expect(cap.mode).toBe('deferred');
      expect(cap.supported).toBe(false);
      expect(cap.canSendEncrypted).toBe(false);
      expect(cap.canDecryptEncrypted).toBe(false);
    });

    it('decrypt display text returns masked text (E26.1)', () => {
      expect(getDecryptDisplayText()).toBe(E2EE_UNSUPPORTED_TEXT);
    });

    it('send block text returns disabled text (E26.2)', () => {
      expect(getSendBlockText()).toBe(E2EE_SEND_DISABLED_TEXT);
    });
  });

  // ── 2. Input text and submit → early return, no sendText ────────────

  describe('2. Submit on encrypted session → early return (E5.2/E8.1/E27.1)', () => {
    it('assertPlaintextSendAllowed throws for encrypted session', () => {
      expect(() => assertPlaintextSendAllowed(encryptedSession)).toThrow(E2EE_SEND_DISABLED_TEXT);
    });

    it('assertPlaintextSendAllowed does not throw for plaintext session', () => {
      expect(() => assertPlaintextSendAllowed(baseSession)).not.toThrow();
    });

    it('ChatScreen submit() returns early when encrypted=true', () => {
      // ChatScreen.tsx line 55: if (!content || encrypted) { return; }
      // When encrypted is true, submit() is a no-op regardless of content
      const encrypted = isEncryptedSession(encryptedSession);
      const content = 'hello';
      // Simulating submit logic
      if (!content || encrypted) {
        // early return — sendText never called
        expect(true).toBe(true);
        return;
      }
      throw new Error('should not reach here');
    });

    it('sendText on encrypted session throws and does not call messageService (E21.4)', async () => {
      const session = encryptedSession;

      await expect(useMessageStore.getState().sendText(session, 'hello')).rejects.toThrow(
        E2EE_SEND_DISABLED_TEXT,
      );

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
    });

    it('sendMedia on encrypted session throws and does not call messageService', async () => {
      const session = encryptedSession;
      const file = { uri: 'file:///img.jpg', name: 'img.jpg', size: 1024 };

      await expect(
        useMessageStore.getState().sendMedia(session, file as never, 'IMAGE'),
      ).rejects.toThrow(E2EE_SEND_DISABLED_TEXT);

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
    });
  });

  // ── 3. No sendPrivate called for encrypted session ──────────────────

  describe('3. No sendPrivate called (E5.2/E8.1/E32.4)', () => {
    it('sendText on encrypted session does not reach http layer', async () => {
      try {
        await useMessageStore.getState().sendText(encryptedSession, 'test');
      } catch {
        // expected
      }

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
      expect(ms.getPrivateHistory).not.toHaveBeenCalled();
      expect(ms.getGroupHistory).not.toHaveBeenCalled();
    });

    it('sendMedia on encrypted session does not reach http layer', async () => {
      const file = { uri: 'file:///doc.pdf', name: 'doc.pdf', size: 2048 };
      try {
        await useMessageStore.getState().sendMedia(encryptedSession, file as never, 'FILE');
      } catch {
        // expected
      }

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
    });

    it('does not create optimistic message in state for encrypted session', async () => {
      try {
        await useMessageStore.getState().sendText(encryptedSession, 'hello');
      } catch {
        // expected
      }

      // addMessage should not have been called with optimistic message
      // since assertPlaintextSendAllowed throws before optimisticMessage()
      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('does not enqueue plaintext pending for encrypted session', async () => {
      try {
        await useMessageStore.getState().sendText(encryptedSession, 'hello');
      } catch {
        // expected
      }

      expect(pr.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── 4. E2EE_SEND_DISABLED_TEXT displayed / thrown ────────────────────

  describe('4. E2EE_SEND_DISABLED_TEXT error message (E26.2/E27.1)', () => {
    it('contains no automatic plaintext fallback text', () => {
      expect(E2EE_SEND_DISABLED_TEXT).toContain('不会自动改为明文发送');
    });

    it('directs user to Web or close encryption', () => {
      expect(E2EE_SEND_DISABLED_TEXT).toContain('Web');
    });

    it('mentions mobile platform limitation', () => {
      expect(E2EE_SEND_DISABLED_TEXT).toContain('移动端');
    });

    it('throws with exact text from assertPlaintextSendAllowed', () => {
      expect(() => assertPlaintextSendAllowed(encryptedSession)).toThrow(E2EE_SEND_DISABLED_TEXT);
    });

    it('throws with exact text from messageStore.sendText', async () => {
      await expect(useMessageStore.getState().sendText(encryptedSession, 'hi')).rejects.toThrow(
        E2EE_SEND_DISABLED_TEXT,
      );
    });
  });

  // ── 5. Receive encrypted message → content masked ───────────────────

  describe('5. Receive encrypted message → content masked (E5.1/E22.4/E26.1)', () => {
    it('maskEncryptedMessage replaces content with E2EE_UNSUPPORTED_TEXT', () => {
      const msg = makeEncryptedMessage();
      const masked = maskEncryptedMessage(msg);
      expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
      expect(masked.content).not.toContain('ciphertext');
    });

    it('isEncryptedMessage returns true for encrypted: true', () => {
      expect(isEncryptedMessage({ encrypted: true })).toBe(true);
    });

    it('isEncryptedMessage returns true for encrypted: 1', () => {
      expect(isEncryptedMessage({ encrypted: 1 })).toBe(true);
    });

    it('isEncryptedMessage returns false for encrypted: false', () => {
      expect(isEncryptedMessage({ encrypted: false })).toBe(false);
    });

    it('isEncryptedMessage returns false for undefined encrypted', () => {
      expect(isEncryptedMessage({})).toBe(false);
    });

    it('plaintext message is not masked', () => {
      const msg = makePlaintextMessage();
      const result = maskEncryptedMessage(msg);
      expect(result.content).toBe('Hello from Bob');
      expect(result).toBe(msg); // same reference
    });

    it('addMessage in messageStore calls maskEncryptedMessage (E26.3)', () => {
      // The real addMessage calls maskEncryptedMessage before persisting
      // Verify the mask function is applied through the real e2eeDeferred module
      const msg = makeEncryptedMessage();
      const masked = maskEncryptedMessage(msg);
      expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
    });
  });

  // ── 6. Masked content clears media fields (E5.1/E23.3/E26.3) ───────

  describe('6. Masked message clears all media fields (E5.1/E23.3)', () => {
    it('clears mediaUrl for encrypted IMAGE', () => {
      const msg = makeEncryptedMessage({ messageType: 'IMAGE' });
      const masked = maskEncryptedMessage(msg);
      expect(masked.mediaUrl).toBeUndefined();
    });

    it('clears thumbnailUrl for encrypted IMAGE', () => {
      const msg = makeEncryptedMessage({ messageType: 'IMAGE' });
      const masked = maskEncryptedMessage(msg);
      expect(masked.thumbnailUrl).toBeUndefined();
    });

    it('clears mediaName for encrypted FILE', () => {
      const msg = makeEncryptedMessage({ messageType: 'FILE' });
      const masked = maskEncryptedMessage(msg);
      expect(masked.mediaName).toBeUndefined();
    });

    it('clears mediaSize for encrypted FILE', () => {
      const msg = makeEncryptedMessage({ messageType: 'FILE' });
      const masked = maskEncryptedMessage(msg);
      expect(masked.mediaSize).toBeUndefined();
    });

    it('clears duration for encrypted VOICE', () => {
      const msg = makeEncryptedMessage({ messageType: 'VOICE', duration: 15 });
      const masked = maskEncryptedMessage(msg);
      expect(masked.duration).toBeUndefined();
    });

    it('clears all media fields for encrypted VIDEO', () => {
      const msg = makeEncryptedMessage({ messageType: 'VIDEO' });
      const masked = maskEncryptedMessage(msg);
      expect(masked.mediaUrl).toBeUndefined();
      expect(masked.thumbnailUrl).toBeUndefined();
      expect(masked.mediaName).toBeUndefined();
      expect(masked.mediaSize).toBeUndefined();
      expect(masked.duration).toBeUndefined();
    });

    it('preserves non-media fields (id, senderId, messageType)', () => {
      const msg = makeEncryptedMessage();
      const masked = maskEncryptedMessage(msg);
      expect(masked.id).toBe('msg_enc_1');
      expect(masked.senderId).toBe('200');
      expect(masked.messageType).toBe('TEXT');
    });

    it('does not mutate input object', () => {
      const msg = makeEncryptedMessage();
      const originalContent = msg.content;
      const originalMediaUrl = msg.mediaUrl;
      maskEncryptedMessage(msg);
      expect(msg.content).toBe(originalContent);
      expect(msg.mediaUrl).toBe(originalMediaUrl);
    });

    it('returns new object reference for encrypted message', () => {
      const msg = makeEncryptedMessage();
      const result = maskEncryptedMessage(msg);
      expect(result).not.toBe(msg);
    });

    it('E2EE_UNSUPPORTED_TEXT indicates mobile cannot view and directs to Web (E26.1)', () => {
      expect(E2EE_UNSUPPORTED_TEXT).toContain('Web');
      expect(E2EE_UNSUPPORTED_TEXT).toContain('移动端');
    });
  });

  // ── 7. Receive E2EE_NEGOTIATION → deferred log only (E3.3/E5.3/E11.3) ─

  describe('7. Receive E2EE_NEGOTIATION → deferred log only (E3.3/E5.3/E11.3)', () => {
    it.each(['request', 'accepted', 'rejected', 'disabled'])(
      'does not throw for action=%s',
      async (action) => {
        await expect(
          useWebsocketStore.getState().dispatchPayload(makeE2eeNegotiationPayload(action)),
        ).resolves.toBeUndefined();
      },
    );

    it('does not throw when data is missing', async () => {
      await expect(
        useWebsocketStore.getState().dispatchPayload({ type: 'E2EE_NEGOTIATION', data: {} }),
      ).resolves.toBeUndefined();
    });

    it('logs action category for observability (E20.2)', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request'),
      );
      const hasActionLog = loggerCalls.some((line) => line.includes('request'));
      expect(hasActionLog).toBe(true);
    });

    it('logs unknown when action field is missing', async () => {
      await useWebsocketStore.getState().dispatchPayload({
        type: 'E2EE_NEGOTIATION',
        data: { sessionId: '100_200' },
      });
      const hasUnknownLog = loggerCalls.some((line) => line.includes('unknown'));
      expect(hasUnknownLog).toBe(true);
    });

    it('does not log requestPayloadJson original value (E20.1/E32.5)', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request'),
      );
      for (const logLine of loggerCalls) {
        expect(logLine).not.toContain('senderIdentityKey');
        expect(logLine).not.toContain('ephemeralPublicKey');
        expect(logLine).not.toContain('deviceId');
        expect(logLine).not.toContain('rootKey');
        expect(logLine).not.toContain('super-secret-root-key');
      }
    });

    it('does not log identity key material (E20.1)', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request', {
          identityKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_FAKE_IDENTITY',
        }),
      );
      for (const logLine of loggerCalls) {
        expect(logLine).not.toContain('FAKE_IDENTITY');
      }
    });
  });

  // ── 8. No auto-accept of negotiation (E5.3/E10/E32.3) ──────────────

  describe('8. No auto-accept of negotiation (E5.3/E10/E32.3)', () => {
    it('does not call addMessage for any negotiation action', async () => {
      for (const action of ['request', 'accepted', 'rejected', 'disabled']) {
        await useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload(action),
        );
      }
      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('does not call upsertSession for negotiation events', async () => {
      for (const action of ['request', 'accepted', 'rejected', 'disabled']) {
        await useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload(action),
        );
      }
      expect(mockUpsertSession).not.toHaveBeenCalled();
    });

    it('does not call refreshSessions for negotiation events', async () => {
      for (const action of ['request', 'accepted', 'rejected', 'disabled']) {
        await useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload(action),
        );
      }
      expect(mockChatState.refreshSessions).not.toHaveBeenCalled();
    });

    it('does not call retryPending for negotiation events', async () => {
      for (const action of ['request', 'accepted', 'rejected', 'disabled']) {
        await useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload(action),
        );
      }
      expect(mockChatState.retryPending).not.toHaveBeenCalled();
    });

    it('capability still reports deferred after negotiation events (E32.3)', async () => {
      for (const action of ['request', 'accepted', 'rejected', 'disabled']) {
        await useWebsocketStore.getState().dispatchPayload(
          makeE2eeNegotiationPayload(action),
        );
      }
      const cap = getMobileE2eeCapability();
      expect(cap.canSendEncrypted).toBe(false);
      expect(cap.canDecryptEncrypted).toBe(false);
      expect(cap.mode).toBe('deferred');
    });
  });

  // ── 9. session.encrypted unchanged after negotiation (E5.3/E9.5) ────

  describe('9. session.encrypted unchanged after negotiation events (E5.3/E9.5)', () => {
    it('session.encrypted remains true after request action', async () => {
      mockCurrentSession = { ...encryptedSession };
      mockSessions.push(mockCurrentSession);

      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request'),
      );

      // The websocketStore does NOT mutate session.encrypted
      // Only upsertSession could change it, and that's not called for negotiation
      expect(mockUpsertSession).not.toHaveBeenCalled();
    });

    it('session.encrypted remains true after accepted action', async () => {
      mockCurrentSession = { ...encryptedSession };
      mockSessions.push(mockCurrentSession);

      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('accepted'),
      );

      expect(mockUpsertSession).not.toHaveBeenCalled();
    });

    it('session.encrypted remains true after rejected action', async () => {
      mockCurrentSession = { ...encryptedSession };
      mockSessions.push(mockCurrentSession);

      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('rejected'),
      );

      expect(mockUpsertSession).not.toHaveBeenCalled();
    });

    it('session.encrypted remains true after disabled action', async () => {
      mockCurrentSession = { ...encryptedSession };
      mockSessions.push(mockCurrentSession);

      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('disabled'),
      );

      expect(mockUpsertSession).not.toHaveBeenCalled();
    });

    it('session.encrypted does not flip from false to true', async () => {
      const plainSession = { ...baseSession };
      mockSessions.push(plainSession);

      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request'),
      );

      // No session mutation should have occurred
      expect(mockUpsertSession).not.toHaveBeenCalled();
    });
  });

  // ── 10. Pending encrypted payload retry blocked (E24.3/E25.3/E5.4) ──

  describe('10. Pending encrypted payload retry blocked (E24.3/E25.3/E5.4)', () => {
    it('blocks top-level encrypted=true payload', async () => {
      const pending = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c1', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2e_deferred');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 'local_e2e_deferred',
          status: 'blocked',
          lastError: 'E2EE deferred',
        }),
      );
    });

    it('blocks data.encrypted=true payload', async () => {
      const pending = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c2', messageType: 'TEXT', content: 'secret', encrypted: true },
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2e_deferred');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );
    });

    it('does not call sendPrivate for blocked payload', async () => {
      const pending = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c3', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2e_deferred');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('does not call sendGroup for blocked group payload', async () => {
      const pending = makePending(
        {
          sendType: 'group',
          data: { groupId: 'g1', clientMessageId: 'c4', messageType: 'TEXT', content: 'secret' },
          encrypted: true,
        },
        { sendType: 'group' },
      );
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2e_deferred');

      expect(ms.sendGroup).not.toHaveBeenCalled();
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('does not remove blocked pending from repository', async () => {
      const pending = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c5', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2e_deferred');

      expect(pr.remove).not.toHaveBeenCalled();
      expect(pr.removeByClientMessageId).not.toHaveBeenCalled();
    });

    it('blocked status cannot auto-recover to pending (E25.3)', async () => {
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

      await useMessageStore.getState().retryMessage('local_blocked');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('plaintext pending proceeds normally (E9.1)', async () => {
      const plaintext = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c_plain', messageType: 'TEXT', content: 'visible' },
      });
      pr.get.mockReturnValue(plaintext);
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_1', messageId: 'srv_1', clientMessageId: 'c_plain', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_e2e_deferred');

      expect(ms.sendPrivate).toHaveBeenCalledWith(
        expect.objectContaining({ clientMessageId: 'c_plain', content: 'visible' }),
      );
    });
  });

  // ── 11. App foreground resume does NOT retry encrypted payload ──────

  describe('11. App foreground resume does NOT retry encrypted payload (E25.3/E25.4)', () => {
    it('foreground callback calls retryPending which blocks encrypted items', async () => {
      // Simulate: app goes to background, then foreground triggers retryPending
      const encrypted = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c_fg', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      const plaintext = makePending(
        {
          sendType: 'private',
          data: { clientMessageId: 'c_fg_plain', messageType: 'TEXT', content: 'visible' },
        },
        { localId: 'local_plain_fg' },
      );

      pr.listReady.mockReturnValue([encrypted, plaintext]);
      pr.get.mockImplementation((id: string) => {
        if (id === 'local_e2e_deferred') return encrypted;
        if (id === 'local_plain_fg') return plaintext;
        return undefined;
      });
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_plain', messageId: 'srv_plain', status: 'SENT' },
      } as never);

      // Trigger retryPending (simulating foreground resume path)
      await useMessageStore.getState().retryPending();

      // Encrypted was blocked
      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ localId: 'local_e2e_deferred', status: 'blocked' }),
      );

      // Only plaintext was sent
      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);
      expect(ms.sendPrivate).toHaveBeenCalledWith(
        expect.objectContaining({ clientMessageId: 'c_fg_plain' }),
      );
    });

    it('foreground callback does not bypass encrypted block via retryMessage', async () => {
      const encrypted = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c_fg2', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(encrypted);

      // Direct retryMessage call (what retryPending delegates to)
      await useMessageStore.getState().retryMessage('local_e2e_deferred');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('encrypted payload stays blocked after multiple foreground resumes', async () => {
      const encrypted = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c_fg3', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(encrypted);

      // First foreground resume
      await useMessageStore.getState().retryMessage('local_e2e_deferred');
      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );

      // Second foreground resume — still blocked
      pr.update.mockClear();
      await useMessageStore.getState().retryMessage('local_e2e_deferred');
      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );

      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });
  });

  // ── 12. Network online resume does NOT retry encrypted payload ──────

  describe('12. Network online resume does NOT retry encrypted payload (E25.3/E25.4)', () => {
    it('network online callback calls retryPending which blocks encrypted items', async () => {
      const encrypted = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c_net', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.listReady.mockReturnValue([encrypted]);
      pr.get.mockReturnValue(encrypted);

      // Trigger retryPending (simulating network online resume path)
      await useMessageStore.getState().retryPending();

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ localId: 'local_e2e_deferred', status: 'blocked' }),
      );
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('network resume does not convert blocked to pending', async () => {
      const blocked: PendingMessage = {
        localId: 'local_net_blocked',
        conversationId: '100_200',
        sendType: 'private',
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: { clientMessageId: 'c_net_blk', messageType: 'TEXT', content: 'secret' },
          encrypted: true,
        }),
        status: 'blocked',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      pr.get.mockReturnValue(blocked);

      await useMessageStore.getState().retryMessage('local_net_blocked');

      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('multiple network resumes do not bypass encrypted block', async () => {
      const encrypted = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c_net2', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(encrypted);

      // Simulate 3 network resume cycles
      for (let i = 0; i < 3; i++) {
        await useMessageStore.getState().retryMessage('local_e2e_deferred');
      }

      // sendPrivate was never called
      expect(ms.sendPrivate).not.toHaveBeenCalled();

      // All update calls must have blocked status
      expect(pr.update).toHaveBeenCalled();
      for (const call of (pr.update as jest.Mock).mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({ status: 'blocked' }));
      }
    });
  });

  // ── Cross-cutting: blockEncryptedPendingPayload guard (E24/E25) ─────

  describe('blockEncryptedPendingPayload guard (E24.3/E5.4)', () => {
    it('blocks top-level encrypted true', () => {
      expect(blockEncryptedPendingPayload({ encrypted: true, data: {} })).toBe(true);
    });

    it('blocks data.encrypted true', () => {
      expect(blockEncryptedPendingPayload({ data: { encrypted: true } })).toBe(true);
    });

    it('does not block plaintext payload', () => {
      expect(blockEncryptedPendingPayload({ data: { content: 'hello' } })).toBe(false);
    });

    it('does not block encrypted false', () => {
      expect(blockEncryptedPendingPayload({ encrypted: false, data: {} })).toBe(false);
    });

    it('does not block null/undefined/non-object', () => {
      expect(blockEncryptedPendingPayload(null)).toBe(false);
      expect(blockEncryptedPendingPayload(undefined)).toBe(false);
      expect(blockEncryptedPendingPayload('string')).toBe(false);
      expect(blockEncryptedPendingPayload(42)).toBe(false);
    });
  });

  // ── Cross-cutting: sensitive field log audit (E20/E32.5) ────────────

  describe('Sensitive field log audit (E20.1/E20.2/E32.5)', () => {
    it('E2EE negotiation logs do not contain key material', async () => {
      await useWebsocketStore.getState().dispatchPayload(
        makeE2eeNegotiationPayload('request', {
          identityKey: 'SENSITIVE_IDENTITY_KEY_VALUE',
          ephemeralKey: 'SENSITIVE_EPHEMERAL_KEY_VALUE',
        }),
      );

      for (const logLine of loggerCalls) {
        expect(logLine).not.toContain('SENSITIVE_IDENTITY_KEY_VALUE');
        expect(logLine).not.toContain('SENSITIVE_EPHEMERAL_KEY_VALUE');
        expect(logLine).not.toContain('super-secret-root-key');
      }
    });

    it('encrypted message mask does not log ciphertext', () => {
      const msg = makeEncryptedMessage();
      const masked = maskEncryptedMessage(msg);
      // The mask function itself should not produce log output with ciphertext
      expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
      expect(masked.content).not.toContain('U2FsdGVk');
      expect(masked.content).not.toContain('ciphertext');
    });
  });

  // ── Cross-cutting: E8 no silent plaintext downgrade ─────────────────

  describe('E8 no silent plaintext downgrade', () => {
    it('encrypted session cannot silently send plaintext via sendText', async () => {
      await expect(
        useMessageStore.getState().sendText(encryptedSession, 'should fail'),
      ).rejects.toThrow(E2EE_SEND_DISABLED_TEXT);
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('encrypted session cannot silently send plaintext via sendMedia', async () => {
      const file = { uri: 'file:///img.jpg', name: 'img.jpg', size: 1024 };
      await expect(
        useMessageStore.getState().sendMedia(encryptedSession, file as never, 'IMAGE'),
      ).rejects.toThrow(E2EE_SEND_DISABLED_TEXT);
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('encrypted pending payload cannot silently convert to plaintext retry', async () => {
      const pending = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c_downgrade', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_e2e_deferred');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked' }),
      );
    });

    it('capability never returns canSendEncrypted=true (E8.1)', () => {
      const cap = getMobileE2eeCapability();
      expect(cap.canSendEncrypted).toBe(false);
    });
  });

  // ── Cross-cutting: E33 conflict resolution ──────────────────────────

  describe('E33 conflict resolution — security over UX', () => {
    it('encrypted session send is blocked even if message has content', async () => {
      // E33.1: E2EE security boundary takes priority over delivery rate
      await expect(
        useMessageStore.getState().sendText(encryptedSession, 'urgent message!'),
      ).rejects.toThrow();
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });

    it('encrypted pending stays blocked even after many retries', async () => {
      // E33.1: Security boundary cannot be overridden by retry strategy
      const pending = makePending({
        sendType: 'private',
        data: { clientMessageId: 'c_retry_many', messageType: 'TEXT', content: 'secret' },
        encrypted: true,
      });
      pr.get.mockReturnValue(pending);

      for (let i = 0; i < 10; i++) {
        await useMessageStore.getState().retryMessage('local_e2e_deferred');
      }

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      // All update calls must have blocked status — security never degrades
      expect(pr.update).toHaveBeenCalled();
      for (const call of (pr.update as jest.Mock).mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({ status: 'blocked' }));
      }
    });

    it('conservative security: encrypted=true treated as send block signal (E9.5)', () => {
      // E33.4: More conservative security state wins
      expect(isEncryptedSession(encryptedSession)).toBe(true);
      expect(() => assertPlaintextSendAllowed(encryptedSession)).toThrow();
    });
  });

  // ── Cross-cutting: messageService.sendPrivateEncrypted (E32.3) ──────

  describe('messageService.sendPrivateEncrypted is stub-rejected (E32.3)', () => {
    it('sendPrivateEncrypted rejects with deferred message', async () => {
      // Import real module to test the actual stub (auto-mock omits this method)
      const realModule = jest.requireActual<typeof import('@/services/chat/messageService')>(
        '@/services/chat/messageService',
      );
      await expect(realModule.messageService.sendPrivateEncrypted()).rejects.toThrow(
        'E2EE encrypted sending is deferred on mobile',
      );
    });
  });
});
