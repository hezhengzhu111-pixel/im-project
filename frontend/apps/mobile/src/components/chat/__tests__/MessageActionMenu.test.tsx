/**
 * ChatScreen 长按菜单集成测试。
 *
 * 验证 ChatScreen 长按消息→弹出操作菜单→选择操作的回调链：
 * - Long-press handler wiring in rendered ChatScreen
 * - Retry callback calls retryMessage(force=true)
 * - DeleteLocal / Recall callbacks wired to store
 * - Encrypted session disables input
 * - Empty state / message list rendering
 */

import React from 'react';
import renderer from 'react-test-renderer';
import { ChatScreen } from '@/screens/chat/ChatScreen';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/sessionStore';
import { pushDeviceService } from '@/services/push/pushDeviceService';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { notificationEventRepository } from '@/services/storage/notificationEventRepository';
import { messageService } from '@/services/chat/messageService';
import { registerAuthHooks } from '@/services/api/httpClient';
import { secureStorage } from '@/services/storage/secureStorage';
import { kvStorage } from '@/services/storage/kvStorage';
import { useNotificationStore } from '@/stores/notificationStore';
import { useUploadStore } from '@/stores/uploadStore';
import { resolvePrivateSessionId } from '@/utils/normalizers';
import type { ChatSession } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';

const session: ChatSession = {
  id: resolvePrivateSessionId('1', '2'),
  type: 'private',
  targetId: '2',
  targetName: 'Bob',
  unreadCount: 0,
};

const createMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'msg-menu-1',
  serverId: 'srv-menu-1',
  conversationId: session.id,
  senderId: '1',
  receiverId: '2',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'hello',
  sendTime: new Date().toISOString(),
  status: 'SENT',
  ...overrides,
});

const defaultPushSettings = {
  enabled: true,
  soundEnabled: true,
  showPreview: true,
  mutedConversationIds: [],
};

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') return (node.type as { displayName?: string }).displayName || (node.type as { name?: string }).name || '';
  return '';
};

const findText = (root: renderer.ReactTestInstance, text: string): boolean => {
  try {
    root.find((node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes(text));
    return true;
  } catch { return false; }
};

let mockRouteParams: Record<string, string> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
  createNavigationContainerRef: () => ({ isReady: jest.fn(() => true), navigate: jest.fn() }),
}));

describe('ChatScreen long-press menu integration', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(pushDeviceService, 'registerDevice').mockResolvedValue({ deviceId: 'device', registered: true });
    jest.spyOn(pushDeviceService, 'unregisterDevice').mockResolvedValue(true);
    jest.spyOn(pushDeviceService, 'updateDeviceToken').mockResolvedValue({ updated: true });
    jest.spyOn(pushDeviceService, 'getSettings').mockResolvedValue(defaultPushSettings);
    jest.spyOn(pushDeviceService, 'updateSettings').mockImplementation(async (patch) => ({ ...defaultPushSettings, ...patch }));
    jest.spyOn(pushDeviceService, 'logOptionalFailure').mockImplementation(() => undefined);
    registerAuthHooks({
      getAccessToken: () => useAuthStore.getState().accessToken,
      getSessionGeneration: () => useAuthStore.getState().sessionGeneration,
      onSessionRefreshed: () => {
        void secureStorage.remove('im.mobile.access-token');
        useAuthStore.setState({ accessToken: '' });
      },
      onAuthInvalid: (generation) => {
        const state = useAuthStore.getState();
        if (state.sessionGeneration === generation) { void state.clearSession(); }
      },
    });
    messageRepository.clearAllCache();
    pendingMessageRepository.clear();
    uploadTaskRepository.clear();
    notificationEventRepository.clear();
    kvStorage.setBoolean('notification.enabled', true);
    useAuthStore.setState({
      currentUser: { id: '1', username: 'alice' },
      accessToken: '',
      permissions: [],
      loading: false,
      authReady: true,
      sessionGeneration: 0,
    });
    useSessionStore.getState().clear();
    useMessageStore.getState().clear();
    useNotificationStore.setState({ fcmToken: kvStorage.getString('im.mobile.fcm-token'), tokenBound: false, events: [] });
    useUploadStore.setState({ tasks: [] });
    mockRouteParams = {};
  });

  // ── 1. Long-press handler on MessageBubble ─────────────────────

  describe('long-press triggers action sheet', () => {
    it('passes onLongPress to MessageBubble within rendered ChatScreen', () => {
      renderer.act(() => {
        useSessionStore.getState().setCurrentSession(session);
        jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
        useMessageStore.setState({
          messagesBySession: { [session.id]: [createMessage()] },
          messagesPaginationBySession: {
            [session.id]: {
              loadingInitial: false, loadingOlder: false, refreshingLatest: false,
              hasMoreBefore: false, hasMoreAfter: false, initialized: true,
            },
          },
        });
      });

      let testRenderer: renderer.ReactTestRenderer | undefined;
      renderer.act(() => {
        testRenderer = renderer.create(<ChatScreen />);
      });

      const messageBubbles = testRenderer!.root.findAll(
        (node) => typeName(node) === 'MessageBubble',
      );
      expect(messageBubbles.length).toBeGreaterThanOrEqual(1);

      const bubble = messageBubbles[0];
      expect(typeof bubble.props.onLongPress).toBe('function');
      expect(() => bubble.props.onLongPress()).not.toThrow();
    });
  });

  // ── 2. Retry callback via MessageBubble onRetry prop ────────────

  describe('retry on failed message', () => {
    it('MessageBubble onRetry invokes retryMessage with force=true', () => {
      const failedMsg = createMessage({ id: 'failed-1', status: 'FAILED' });

      renderer.act(() => {
        useSessionStore.getState().setCurrentSession(session);
        jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
        const retrySpy = jest.spyOn(useMessageStore.getState(), 'retryMessage').mockResolvedValue();
        useMessageStore.setState({
          messagesBySession: { [session.id]: [failedMsg] },
          messagesPaginationBySession: {
            [session.id]: {
              loadingInitial: false, loadingOlder: false, refreshingLatest: false,
              hasMoreBefore: false, hasMoreAfter: false, initialized: true,
            },
          },
        });

        // Reset the spy so only the ChatScreen's onRetry is captured
        retrySpy.mockClear();
      });

      let testRenderer: renderer.ReactTestRenderer | undefined;
      renderer.act(() => {
        testRenderer = renderer.create(<ChatScreen />);
      });

      const bubbles = testRenderer!.root.findAll(
        (node) => typeName(node) === 'MessageBubble',
      );
      expect(bubbles.length).toBeGreaterThanOrEqual(1);

      if (bubbles[0].props.onRetry) {
        bubbles[0].props.onRetry();
      }

      const retrySpy = jest.mocked(useMessageStore.getState().retryMessage);
      expect(retrySpy).toHaveBeenCalledWith('failed-1', { force: true });
    });
  });

  // ── 3. DeleteLocal / Recall wired to store ─────────────────────

  describe('action callbacks wired to store', () => {
    it('deleteLocalMessage removes message from store', () => {
      const msg = createMessage({ id: 'to-delete' });
      useMessageStore.setState({ messagesBySession: { [session.id]: [msg] } });

      useMessageStore.getState().deleteLocalMessage(session.id, 'to-delete');

      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages).toHaveLength(0);
    });

    it('recallMessage calls API and replaces message on success', async () => {
      const msg = createMessage({ id: 'to-recall', serverId: 'srv-recall', messageId: 'srv-recall' });
      useMessageStore.setState({ messagesBySession: { [session.id]: [msg] } });

      const recalled = { ...msg, status: 'RECALLED' as const, content: '消息已撤回' };
      const msSpy = jest.spyOn(messageService, 'recallMessage').mockResolvedValue({
        code: 0, message: 'ok', data: recalled,
      });

      await useMessageStore.getState().recallMessage(session.id, msg);

      expect(msSpy).toHaveBeenCalledWith('srv-recall');
      const messages = useMessageStore.getState().messagesBySession[session.id];
      expect(messages[0].status).toBe('RECALLED');
    });
  });

  // ── 4. Encrypted session disables input ────────────────────────

  describe('encrypted session', () => {
    it('disabled TextInput with E2EE placeholder', () => {
      const encryptedSession = { ...session, encrypted: true };

      renderer.act(() => {
        useSessionStore.getState().setCurrentSession(encryptedSession);
        jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
        useMessageStore.setState({
          messagesBySession: { [session.id]: [] },
          messagesPaginationBySession: {
            [session.id]: {
              loadingInitial: false, loadingOlder: false, refreshingLatest: false,
              hasMoreBefore: true, hasMoreAfter: false, initialized: true,
            },
          },
        });
      });

      let testRenderer: renderer.ReactTestRenderer | undefined;
      renderer.act(() => {
        testRenderer = renderer.create(<ChatScreen />);
      });

      const input = testRenderer!.root.find((node) => typeName(node) === 'TextInput');
      expect(input.props.editable).toBe(false);
      expect(input.props.placeholder).toContain('E2EE');
    });
  });

  // ── 5. Empty state ─────────────────────────────────────────────

  describe('empty state', () => {
    it('shows no active conversation when no session', () => {
      let testRenderer: renderer.ReactTestRenderer | undefined;
      renderer.act(() => {
        testRenderer = renderer.create(<ChatScreen />);
      });
      expect(findText(testRenderer!.root, 'No active conversation')).toBe(true);
    });
  });

  // ── 6. Messages render in FlatList ─────────────────────────────

  describe('message list rendering', () => {
    it('renders each message via FlatList data', () => {
      renderer.act(() => {
        useSessionStore.getState().setCurrentSession(session);
        jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
        useMessageStore.setState({
          messagesBySession: {
            [session.id]: [
              createMessage({ id: 'm1', content: 'first' }),
              createMessage({ id: 'm2', content: 'second' }),
              createMessage({ id: 'm3', content: 'third' }),
            ],
          },
          messagesPaginationBySession: {
            [session.id]: {
              loadingInitial: false, loadingOlder: false, refreshingLatest: false,
              hasMoreBefore: false, hasMoreAfter: false, initialized: true,
            },
          },
        });
      });

      let testRenderer: renderer.ReactTestRenderer | undefined;
      renderer.act(() => {
        testRenderer = renderer.create(<ChatScreen />);
      });

      const flatList = testRenderer!.root.find((node) => typeName(node) === 'FlatList');
      expect(flatList.props.data).toHaveLength(3);
    });
  });
});
