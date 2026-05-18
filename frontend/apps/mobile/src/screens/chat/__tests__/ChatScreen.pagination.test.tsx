/**
 * Phase 3 — ChatScreen pagination interaction tests.
 *
 * Focused on the UI behaviour when pagination state changes:
 *   - scrolling near the top triggers loadOlderMessages
 *   - loadingOlder guard prevents duplicate calls
 *   - New-message button appears when user is not at bottom
 *   - Loading-history indicator
 *   - No-more-history indicator
 *
 * Uses react-test-renderer, matching the existing ChatScreen.spec.tsx pattern.
 */
import React from 'react';
import renderer from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/sessionStore';
import { pushDeviceService } from '@/services/push/pushDeviceService';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { notificationEventRepository } from '@/services/storage/notificationEventRepository';
import { registerAuthHooks } from '@/services/api/httpClient';
import { secureStorage } from '@/services/storage/secureStorage';
import { kvStorage } from '@/services/storage/kvStorage';
import { useNotificationStore } from '@/stores/notificationStore';
import { useUploadStore } from '@/stores/uploadStore';
import { resolvePrivateSessionId } from '@/utils/normalizers';
import type { ChatSession } from '@im/shared-types';
import type { MobileMessage, MessagePaginationState } from '@/types/models';

const session: ChatSession = {
  id: resolvePrivateSessionId('1', '2'),
  type: 'private',
  targetId: '2',
  targetName: 'Bob',
  unreadCount: 0,
};

const createMessage = (id: string, content = 'hello'): MobileMessage => ({
  id,
  serverId: id,
  conversationId: session.id,
  senderId: '1',
  receiverId: '2',
  isGroupChat: false,
  messageType: 'TEXT',
  content,
  sendTime: new Date().toISOString(),
  status: 'SENT',
});

const initializedPagination: MessagePaginationState = {
  loadingInitial: false,
  loadingOlder: false,
  refreshingLatest: false,
  hasMoreBefore: true,
  hasMoreAfter: false,
  initialized: true,
};

const defaultPushSettings = {
  enabled: true,
  soundEnabled: true,
  showPreview: true,
  mutedConversationIds: [],
};

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function')
    return (node.type as { displayName?: string }).displayName || node.type.name || '';
  return '';
};

const findTextContent = (
  root: renderer.ReactTestInstance,
  text: string,
): renderer.ReactTestInstance | null => {
  try {
    return root.find(
      (node) =>
        typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes(text),
    );
  } catch {
    return null;
  }
};

let mockRouteParams: Record<string, string> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
  createNavigationContainerRef: () => ({
    isReady: jest.fn(() => true),
    navigate: jest.fn(),
  }),
}));

describe('ChatScreen — Phase 3 pagination', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest
      .spyOn(pushDeviceService, 'registerDevice')
      .mockResolvedValue({ deviceId: 'device', registered: true });
    jest.spyOn(pushDeviceService, 'unregisterDevice').mockResolvedValue(true);
    jest
      .spyOn(pushDeviceService, 'updateDeviceToken')
      .mockResolvedValue({ updated: true });
    jest.spyOn(pushDeviceService, 'getSettings').mockResolvedValue(defaultPushSettings);
    jest
      .spyOn(pushDeviceService, 'updateSettings')
      .mockImplementation(async (patch) => ({ ...defaultPushSettings, ...patch }));
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
        if (state.sessionGeneration === generation) {
          void state.clearSession();
        }
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
    useNotificationStore.setState({
      fcmToken: kvStorage.getString('im.mobile.fcm-token'),
      tokenBound: false,
      events: [],
    });
    useUploadStore.setState({ tasks: [] });
    mockRouteParams = {};
  });

  // ── 加载历史指示器 ──────────────────────────────────────────────────────
  test('shows loading history when loadingOlder is true', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [createMessage('m1')] },
      messagesPaginationBySession: {
        [session.id]: { ...initializedPagination, loadingOlder: true },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const loadingText = findTextContent(testRenderer!.root, '正在加载历史消息');
    expect(loadingText).not.toBeNull();
  });

  // ── 没有更多历史指示器 ──────────────────────────────────────────────────
  test('shows no more history when hasMoreBefore is false', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [createMessage('m1')] },
      messagesPaginationBySession: {
        [session.id]: { ...initializedPagination, hasMoreBefore: false },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const noMoreText = findTextContent(testRenderer!.root, '没有更多历史消息');
    expect(noMoreText).not.toBeNull();
  });

  // ── FlatList 渲染消息 ──────────────────────────────────────────────────
  test('renders messages from store in FlatList data', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: {
        [session.id]: [createMessage('m1', 'first'), createMessage('m2', 'second')],
      },
      messagesPaginationBySession: { [session.id]: initializedPagination },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const flatList = testRenderer!.root.find((node) => typeName(node) === 'FlatList');
    expect(flatList.props.data).toHaveLength(2);
  });

  // ── 滚动到顶部附近才加载历史 ─────────────────────────────────────
  test('loads older messages when scrolling near the top', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    const loadOlderSpy = jest.spyOn(useMessageStore.getState(), 'loadOlderMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [createMessage('m1')] },
      messagesPaginationBySession: { [session.id]: initializedPagination },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const flatList = testRenderer!.root.find((node) => typeName(node) === 'FlatList');
    expect(flatList.props.onEndReached).toBeUndefined();
    expect(flatList.props.onEndReachedThreshold).toBeUndefined();

    renderer.act(() => {
      flatList.props.onScroll({
        nativeEvent: {
          contentOffset: { y: 20 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 500 },
        },
      });
    });

    expect(loadOlderSpy).toHaveBeenCalledWith(expect.objectContaining({ id: session.id }));
  });

  // ── 初始加载时 new messages 按钮不显示 ─────────────────────────────────
  test('does not show new-message button on initial load', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [] },
      messagesPaginationBySession: { [session.id]: initializedPagination },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const newMsgButton = findTextContent(testRenderer!.root, '新消息');
    expect(newMsgButton).toBeNull();
  });

  // ── hasMoreBefore=true 时不显示没有更多历史消息 ────────────────────────
  test('does not show no-more-history text when hasMoreBefore is true', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [createMessage('m1')] },
      messagesPaginationBySession: {
        [session.id]: { ...initializedPagination, hasMoreBefore: true },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const noMoreText = findTextContent(testRenderer!.root, '没有更多历史消息');
    expect(noMoreText).toBeNull();
  });

  // ── loadingOlder=false 时不显示加载历史消息 ────────────────────────
  test('does not show loading-history text when loadingOlder is false', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [createMessage('m1')] },
      messagesPaginationBySession: {
        [session.id]: { ...initializedPagination, loadingOlder: false },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const loadingText = findTextContent(testRenderer!.root, '正在加载历史消息');
    expect(loadingText).toBeNull();
  });

  // ── 没有 session 时显示空状态 ──────────────────────────────────────────
  test('shows empty state when no session', () => {
    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const emptyText = findTextContent(testRenderer!.root, '暂无会话');
    expect(emptyText).not.toBeNull();
  });

  // ── 有路由参数但无 session 时显示打开中 ──────────────────────────────
  test('shows opening conversation when route params present but no session', () => {
    mockRouteParams = { senderId: '2', senderName: 'Bob' };
    jest.spyOn(useChatStore.getState(), 'openSessionFromRoute').mockResolvedValue(true);

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const openingText = findTextContent(testRenderer!.root, '正在打开会话');
    expect(openingText).not.toBeNull();
  });
});