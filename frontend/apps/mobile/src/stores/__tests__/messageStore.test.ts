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
    useMessageStore.setState({ messagesBySession: {}, loading: false, searchResults: [] });
    jest.clearAllMocks();
    mockSessions.length = 0;
    // Set default return values
    mr.listMessages.mockReturnValue([]);
    mr.listSessions.mockReturnValue([]);
    pr.listReady.mockReturnValue([]);
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
        baseMobileMessage({ id: 'srv_1', status: 'SENT' }),
        baseMobileMessage({ id: 'srv_2', status: 'SENT' }),
      ];
      ms.getPrivateHistory.mockResolvedValueOnce({ code: 0, message: 'ok', data: apiMessages });

      await useMessageStore.getState().loadMessages(session);

      expect(mr.upsertMessages).toHaveBeenCalledWith('100_200', expect.any(Array));
      expect(useMessageStore.getState().messagesBySession['100_200']).toHaveLength(2);
      expect(useMessageStore.getState().loading).toBe(false);
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
  });
});
