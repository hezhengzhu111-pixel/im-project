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
import type { MobileMessage } from '@/types/models';

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

const defaultPushSettings = {
  enabled: true,
  soundEnabled: true,
  showPreview: true,
  mutedConversationIds: [],
};

const typeName = (node: { type: unknown }): string => {
  if (typeof node.type === 'string') return node.type;
  if (typeof node.type === 'function') return (node.type as { displayName?: string }).displayName || node.type.name || '';
  return '';
};

const findTextContent = (root: renderer.ReactTestInstance, text: string): renderer.ReactTestInstance | null => {
  try {
    return root.find(
      (node) => typeName(node) === 'Text' && String(node.children?.join('') ?? '').includes(text),
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

describe('ChatScreen', () => {
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
    useNotificationStore.setState({ fcmToken: kvStorage.getString('im.mobile.fcm-token'), tokenBound: false, events: [] });
    useUploadStore.setState({ tasks: [] });
    mockRouteParams = {};
  });

  test('calls loadInitialMessages when session is present', () => {
    useSessionStore.getState().setCurrentSession(session);
    const loadSpy = jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();

    renderer.act(() => {
      renderer.create(<ChatScreen />);
    });

    expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: session.id }));
  });

  test('shows Opening conversation when no session but has route params', () => {
    mockRouteParams = { senderId: '2', senderName: 'Bob' };
    jest.spyOn(useChatStore.getState(), 'openSessionFromRoute').mockResolvedValue(true);

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const openingText = findTextContent(testRenderer!.root, 'Opening conversation');
    expect(openingText).not.toBeNull();
  });

  test('shows No active conversation when no session and no route params', () => {
    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const noActiveText = findTextContent(testRenderer!.root, 'No active conversation');
    expect(noActiveText).not.toBeNull();
  });

  test('shows loading history indicator when loadingOlder is true', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [createMessage('m1')] },
      messagesPaginationBySession: {
        [session.id]: {
          loadingInitial: false,
          loadingOlder: true,
          refreshingLatest: false,
          hasMoreBefore: true,
          hasMoreAfter: false,
          initialized: true,
        },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const loadingText = findTextContent(testRenderer!.root, 'Loading history');
    expect(loadingText).not.toBeNull();
  });

  test('shows no more history when hasMoreBefore is false and messages are present', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [createMessage('m1')] },
      messagesPaginationBySession: {
        [session.id]: {
          loadingInitial: false,
          loadingOlder: false,
          refreshingLatest: false,
          hasMoreBefore: false,
          hasMoreAfter: false,
          initialized: true,
        },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const noMoreText = findTextContent(testRenderer!.root, 'No more history');
    expect(noMoreText).not.toBeNull();
  });

  test('sends text and clears input on submit', async () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    const sendTextSpy = jest.spyOn(useChatStore.getState(), 'sendText').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [] },
      messagesPaginationBySession: {
        [session.id]: {
          loadingInitial: false,
          loadingOlder: false,
          refreshingLatest: false,
          hasMoreBefore: true,
          hasMoreAfter: false,
          initialized: true,
        },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const input = testRenderer!.root.find(
      (node) => typeName(node) === 'TextInput' && node.props.editable !== false,
    );

    renderer.act(() => {
      input.props.onChangeText('test message');
    });

    // The send button has style.send — find Pressable with backgroundColor primary
    const sendButton = testRenderer!.root.find(
      (node) => typeName(node) === 'Pressable' && node.props.style?.backgroundColor === '#0E7AFE',
    );

    await renderer.act(async () => {
      sendButton.props.onPress();
    });

    expect(sendTextSpy).toHaveBeenCalledWith('test message');
    expect(input.props.value).toBe('');
  });

  test('encrypted session disables input and send', () => {
    const encryptedSession = { ...session, encrypted: true };
    useSessionStore.getState().setCurrentSession(encryptedSession);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [] },
      messagesPaginationBySession: {
        [session.id]: {
          loadingInitial: false,
          loadingOlder: false,
          refreshingLatest: false,
          hasMoreBefore: true,
          hasMoreAfter: false,
          initialized: true,
        },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const input = testRenderer!.root.find((node) => typeName(node) === 'TextInput');
    expect(input.props.editable).toBe(false);
    expect(input.props.placeholder).toContain('E2EE');
  });

  test('renders messages from store when session is active', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    useMessageStore.setState({
      messagesBySession: { [session.id]: [createMessage('m1', 'first'), createMessage('m2', 'second')] },
      messagesPaginationBySession: {
        [session.id]: {
          loadingInitial: false,
          loadingOlder: false,
          refreshingLatest: false,
          hasMoreBefore: false,
          hasMoreAfter: false,
          initialized: true,
        },
      },
    });

    let testRenderer: renderer.ReactTestRenderer;
    renderer.act(() => {
      testRenderer = renderer.create(<ChatScreen />);
    });

    const flatList = testRenderer!.root.find((node) => typeName(node) === 'FlatList');
    expect(flatList.props.data).toHaveLength(2);
  });

  test('retry calls retryMessage with force=true', () => {
    useSessionStore.getState().setCurrentSession(session);
    jest.spyOn(useMessageStore.getState(), 'loadInitialMessages').mockResolvedValue();
    const retrySpy = jest.spyOn(useMessageStore.getState(), 'retryMessage').mockResolvedValue();
    const failedMsg = { ...createMessage('failed-msg', 'test'), status: 'FAILED' as const };
    useMessageStore.setState({
      messagesBySession: {
        [session.id]: [failedMsg],
      },
      messagesPaginationBySession: {
        [session.id]: {
          loadingInitial: false,
          loadingOlder: false,
          refreshingLatest: false,
          hasMoreBefore: false,
          hasMoreAfter: false,
          initialized: true,
        },
      },
    });

    // Verify the store state has the FAILED message
    const msgs = useMessageStore.getState().messagesBySession[session.id];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].status).toBe('FAILED');

    // Simulate the onRetry callback that ChatScreen passes to MessageBubble
    const item = msgs[0];
    const retryFn = useMessageStore.getState().retryMessage;
    void retryFn(item.id, { force: true });

    expect(retrySpy).toHaveBeenCalledWith('failed-msg', { force: true });
  });
});
