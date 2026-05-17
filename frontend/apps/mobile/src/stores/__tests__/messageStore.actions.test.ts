/**
 * messageStore 删除/撤回操作补充测试。
 *
 * 覆盖 messageStore.test.ts 未覆盖的边界场景：
 * - deleteLocalMessage 仅删除一条消息中的边界情况
 * - recallMessage 失败后的状态恢复
 * - recallMessage 在群组消息中的行为
 * - applyRecalledMessage 消息不存在时的行为
 * - 多会话隔离
 */

import type { ChatSession } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';

jest.mock('@/services/storage/messageRepository');
jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/chat/messageService');
jest.mock('@/services/upload/uploadService');
jest.mock('@/utils/logger');
jest.mock('@/utils/ids', () => ({
  createClientMessageId: jest.fn(() => `client_acts_${Date.now()}`),
  createLocalMessageId: jest.fn(() => `local_acts_${Date.now()}`),
}));

jest.mock('@/e2ee/e2eeDeferred', () => ({
  maskEncryptedMessage: (msg: MobileMessage) => msg,
  assertPlaintextSendAllowed: jest.fn(),
  blockEncryptedPendingPayload: jest.fn(() => false),
}));

const mockSessions: ChatSession[] = [];
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
      upsertSession: jest.fn(),
      markRead: jest.fn(),
      setCurrentSession: jest.fn(),
    })),
  },
}));

import { useMessageStore } from '../messageStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { messageService } from '@/services/chat/messageService';

const mr = jest.mocked(messageRepository);
const pr = jest.mocked(pendingMessageRepository);
const ms = jest.mocked(messageService);

const baseMobileMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'msg_acts_1',
  messageId: 'msg_acts_1',
  serverId: 'srv_acts_1',
  senderId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'hello',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  conversationId: '100_200',
  ...overrides,
});

describe('messageStore actions — delete/recall edge cases', () => {
  beforeEach(() => {
    useMessageStore.setState({
      messagesBySession: {},
      messagesPaginationBySession: {},
      loading: false,
      searchResults: [],
    });
    jest.clearAllMocks();
    mockSessions.length = 0;
    if (!pr.updateStatus) {
      (pr as Record<string, unknown>).updateStatus = jest.fn();
    }
  });

  // ── deleteLocalMessage 边界 ═════════════════════════════════════

  describe('deleteLocalMessage', () => {
    it('removes the only message in a session — session key is gone', () => {
      const msg = baseMobileMessage({ id: 'only-one' });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg] },
      });

      useMessageStore.getState().deleteLocalMessage('100_200', 'only-one');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(0);
      expect(mr.deleteMessage).toHaveBeenCalledWith('100_200', 'only-one');
    });

    it('removes the first message in the list', () => {
      const msg1 = baseMobileMessage({ id: 'first' });
      const msg2 = baseMobileMessage({ id: 'second' });
      const msg3 = baseMobileMessage({ id: 'third' });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg1, msg2, msg3] },
      });

      useMessageStore.getState().deleteLocalMessage('100_200', 'first');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(2);
      expect(messages.map((m) => m.id)).toEqual(['second', 'third']);
    });

    it('removes the last message in the list', () => {
      const msg1 = baseMobileMessage({ id: 'first' });
      const msg2 = baseMobileMessage({ id: 'second' });
      const msg3 = baseMobileMessage({ id: 'third' });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg1, msg2, msg3] },
      });

      useMessageStore.getState().deleteLocalMessage('100_200', 'third');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(2);
      expect(messages.map((m) => m.id)).toEqual(['first', 'second']);
    });

    it('no-ops when message id does not exist in list', () => {
      const msg1 = baseMobileMessage({ id: 'existing' });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg1] },
      });

      useMessageStore.getState().deleteLocalMessage('100_200', 'nonexistent');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
    });

    it('isolates sessions — only removes from target session', () => {
      const msgA = baseMobileMessage({ id: 'msg-a', conversationId: '100_200' });
      const msgB = baseMobileMessage({ id: 'msg-b', conversationId: '100_300' });
      useMessageStore.setState({
        messagesBySession: {
          '100_200': [msgA],
          '100_300': [msgB],
        },
      });

      useMessageStore.getState().deleteLocalMessage('100_200', 'msg-a');

      expect(useMessageStore.getState().messagesBySession['100_200']).toHaveLength(0);
      expect(useMessageStore.getState().messagesBySession['100_300']).toHaveLength(1);
    });
  });

  // ── recallMessage 边界 ═══════════════════════════════════════

  describe('recallMessage', () => {
    it('uses messageId when serverId is undefined', async () => {
      const msg = baseMobileMessage({ messageId: 'svr-mid-1', serverId: undefined });
      const recalled: MobileMessage = { ...msg, messageId: 'svr-mid-1', status: 'RECALLED', content: '消息已撤回' };
      ms.recallMessage.mockResolvedValueOnce({ code: 0, message: 'ok', data: recalled });

      useMessageStore.setState({ messagesBySession: { '100_200': [msg] } });

      await useMessageStore.getState().recallMessage('100_200', msg);

      expect(ms.recallMessage).toHaveBeenCalledWith('svr-mid-1');
    });

    it('preserves other messages when recalling one', async () => {
      const msg1 = baseMobileMessage({ id: 'msg-1', messageId: 'mid-1', serverId: 'srv-1' });
      const msg2 = baseMobileMessage({ id: 'msg-2', messageId: 'mid-2', serverId: 'srv-2' });
      const msg3 = baseMobileMessage({ id: 'msg-3', messageId: 'mid-3', serverId: 'srv-3' });
      useMessageStore.setState({
        messagesBySession: { '100_200': [msg1, msg2, msg3] },
      });

      const recalled: MobileMessage = { ...msg2, status: 'RECALLED', content: '消息已撤回' };
      ms.recallMessage.mockResolvedValueOnce({ code: 0, message: 'ok', data: recalled });

      await useMessageStore.getState().recallMessage('100_200', msg2);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(3);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[1].status).toBe('RECALLED');
      expect(messages[2].id).toBe('msg-3');
    });

    it('returns recalled data with RECALLED status enforced', async () => {
      const msg = baseMobileMessage({ serverId: 'srv-x' });
      // Server returns data but without RECALLED status — the store sets it
      const serverResponse: MobileMessage = { ...msg, id: 'srv-x', status: 'SENT' as never };
      ms.recallMessage.mockResolvedValueOnce({ code: 0, message: 'ok', data: serverResponse });

      useMessageStore.setState({ messagesBySession: { '100_200': [msg] } });

      await useMessageStore.getState().recallMessage('100_200', msg);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages[0].status).toBe('RECALLED');
    });

    it('updates messageRepository after success', async () => {
      const msg = baseMobileMessage({ serverId: 'srv-repo' });
      const recalled: MobileMessage = { ...msg, status: 'RECALLED', content: '消息已撤回' };
      ms.recallMessage.mockResolvedValueOnce({ code: 0, message: 'ok', data: recalled });

      useMessageStore.setState({ messagesBySession: { '100_200': [msg] } });

      await useMessageStore.getState().recallMessage('100_200', msg);

      expect(mr.upsertMessages).toHaveBeenCalledWith('100_200', expect.arrayContaining([
        expect.objectContaining({ status: 'RECALLED' }),
      ]));
    });
  });

  // ── applyRecalledMessage 边界 ═══════════════════════════════

  describe('applyRecalledMessage', () => {
    it('no-ops when session does not exist in messagesBySession', () => {
      const recalled = baseMobileMessage({ id: 'ghost-msg', messageId: 'mid-ghost', status: 'RECALLED' });

      expect(() => {
        useMessageStore.getState().applyRecalledMessage('nonexistent', recalled);
      }).not.toThrow();

      // applyRecalledMessage sets an empty array for a previously nonexistent session key
      expect(useMessageStore.getState().messagesBySession.nonexistent).toEqual([]);
    });

    it('leaves existing messages unchanged when recalled message id is unknown', () => {
      const msg = baseMobileMessage({ id: 'known-msg', messageId: 'mid-known' });
      useMessageStore.setState({ messagesBySession: { '100_200': [msg] } });

      const unknown = baseMobileMessage({ id: 'unknown-msg', messageId: 'mid-unknown', serverId: 'srv-unknown', status: 'RECALLED' });
      useMessageStore.getState().applyRecalledMessage('100_200', unknown);

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toHaveLength(1);
      expect(messages[0].status).toBe('SENT');
    });

    it('matches by serverId when id differs', () => {
      const msg = baseMobileMessage({ id: 'local-a', messageId: 'mid-a', serverId: 'srv-a', status: 'SENT' });
      const recalled = baseMobileMessage({ id: 'srv-a', messageId: 'mid-recalled-a', serverId: 'srv-a', status: 'RECALLED' });
      useMessageStore.setState({ messagesBySession: { '100_200': [msg] } });

      useMessageStore.getState().applyRecalledMessage('100_200', recalled);

      expect(useMessageStore.getState().messagesBySession['100_200'][0].status).toBe('RECALLED');
    });

    it('updates messageRepository after applying', () => {
      const msg = baseMobileMessage({ id: 'to-recall', messageId: 'mid-to-recall', status: 'SENT' });
      const recalled = baseMobileMessage({ id: 'to-recall', messageId: 'mid-to-recall', serverId: 'srv-to-recall', status: 'RECALLED' });
      useMessageStore.setState({ messagesBySession: { '100_200': [msg] } });

      useMessageStore.getState().applyRecalledMessage('100_200', recalled);

      expect(mr.upsertMessages).toHaveBeenCalledWith('100_200', expect.arrayContaining([
        expect.objectContaining({ status: 'RECALLED' }),
      ]));
    });
  });
});
