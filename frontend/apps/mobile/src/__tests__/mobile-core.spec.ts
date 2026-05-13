import axios from 'axios';
import messaging from '@react-native-firebase/messaging';
import { createReconnectDelay, createTicketedWebSocketUrl } from '@im/shared-ws-core';
import { createRefreshCoordinator } from '@im/shared-auth-core';
import { resolveGroupSessionId, resolveMessageSessionId, resolvePrivateSessionId } from '@/adapters/sessionAdapter';
import { apiClient, registerAuthHooks } from '@/services/api/httpClient';
import { secureStorage } from '@/services/storage/secureStorage';
import { kvStorage } from '@/services/storage/kvStorage';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { notificationEventRepository } from '@/services/storage/notificationEventRepository';
import { assertPlaintextSendAllowed, maskEncryptedMessage } from '@/e2ee/e2eeDeferred';
import { displaySystemNotification, getFcmToken } from '@/services/notification/notificationService';
import { authService } from '@/services/auth/authService';
import { fileService } from '@/services/file/fileService';
import { messageService } from '@/services/chat/messageService';
import { userService } from '@/services/user/userService';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useMessageStore } from '@/stores/messageStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useWebsocketStore } from '@/stores/websocketStore';
import { logger } from '@/utils/logger';
import { normalizeMessage, normalizeSession } from '@/utils/normalizers';
import type { ChatSession, MobileMessage, PendingMessage, UploadTask } from '@/types/models';

const session: ChatSession = {
  id: resolvePrivateSessionId('1', '2'),
  type: 'private',
  targetId: '2',
  targetName: 'Bob',
  unreadCount: 0,
};

const groupSession: ChatSession = {
  id: resolveGroupSessionId('9'),
  type: 'group',
  targetId: '9',
  targetName: 'Team 9',
  unreadCount: 0,
};

const message = (id: string, content = 'hello'): MobileMessage => ({
  id,
  serverId: id,
  conversationId: session.id,
  senderId: '1',
  receiverId: '2',
  messageType: 'TEXT',
  content,
  sendTime: new Date().toISOString(),
  status: 'SENT',
});

describe('mobile core', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    logger.clear();
    messageRepository.clearAllCache();
    pendingMessageRepository.clear();
    uploadTaskRepository.clear();
    notificationEventRepository.clear();
    kvStorage.setBoolean('notification.enabled', true);
    kvStorage.setBoolean('sound.enabled', true);
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
  });

  test('secureStorage adapter stores sensitive values', async () => {
    await secureStorage.set('im.mobile.access-token', 'secret-token');
    await expect(secureStorage.get('im.mobile.access-token')).resolves.toBe('secret-token');
  });

  test('kvStorage adapter persists settings', () => {
    kvStorage.setBoolean('notification.enabled', false);
    expect(kvStorage.getBoolean('notification.enabled', true)).toBe(false);
  });

  test('sessionId rules match shared core for private, group, websocket, and history paths', () => {
    const privateId = resolvePrivateSessionId('2', '1');
    const privateWsMessage = normalizeMessage({
      id: '10',
      sender_id: '2',
      receiver_id: '1',
      message_type: 'TEXT',
      content: 'hi',
    });
    const privateHistorySession = normalizeSession({
      conversation_id: privateId,
      conversation_type: 'PRIVATE',
      target_id: '2',
      conversation_name: 'Bob',
    }, '1');

    expect(privateId).toBe(session.id);
    expect(resolveMessageSessionId(privateWsMessage, '1')).toBe(session.id);
    expect(privateHistorySession.id).toBe(session.id);
    expect(resolveGroupSessionId('9')).toBe('group_9');
    expect(normalizeSession({ conversation_type: 'GROUP', group_id: '9' }, '1').id).toBe('group_9');
  });

  test('message normalizer preserves snake/camel identity, encrypted, and e2ee fields', () => {
    const snake = normalizeMessage({
      id: '100',
      client_message_id: 'cm_1',
      sender_id: '2',
      receiver_id: '1',
      message_type: 'TEXT',
      content: 'ciphertext',
      encrypted: 1,
      e2ee_header: 'header',
      e2ee_device_id: 'device',
    });
    const camel = normalizeMessage({
      id: '101',
      clientMessageId: 'cm_2',
      senderId: '1',
      receiverId: '2',
      messageType: 'TEXT',
      content: 'hello',
      e2eeSenderIdentityKey: 'identity',
      e2eeEphemeralKey: 'ephemeral',
    });

    expect(snake.clientMessageId).toBe('cm_1');
    expect(snake.encrypted).toBe(1);
    expect(snake.e2eeHeader).toBe('header');
    expect(snake.e2eeDeviceId).toBe('device');
    expect(resolveMessageSessionId(snake, '1')).toBe(session.id);
    expect(camel.clientMessageId).toBe('cm_2');
    expect(camel.e2eeSenderIdentityKey).toBe('identity');
    expect(camel.e2eeEphemeralKey).toBe('ephemeral');
  });

  test('messageRepository inserts, queries, and dedupes by server id', () => {
    messageRepository.upsertMessages(session.id, [message('m1', 'first'), message('m1', 'updated')]);
    const list = messageRepository.listMessages(session.id);
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe('updated');
  });

  test('pendingMessageRepository enqueues, lists, updates, and removes', () => {
    const pending: PendingMessage = {
      localId: 'local_1',
      conversationId: session.id,
      sendType: 'private',
      payloadJson: '{}',
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    pendingMessageRepository.enqueue(pending);
    expect(pendingMessageRepository.listReady()).toHaveLength(1);
    pendingMessageRepository.remove('local_1');
    expect(pendingMessageRepository.listReady()).toHaveLength(0);
  });

  test('uploadTaskRepository updates status', () => {
    const task: UploadTask = {
      taskId: 'u1',
      fileUri: 'file://a',
      fileName: 'a.png',
      uploadType: 'IMAGE',
      status: 'pending',
      progress: 0,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    uploadTaskRepository.upsert(task);
    uploadTaskRepository.upsert({ ...task, status: 'failed', progress: 40 });
    expect(uploadTaskRepository.listPending()[0].progress).toBe(40);
  });

  test('websocket URL and reconnect delay use shared core', () => {
    expect(createTicketedWebSocketUrl('ws://localhost:8082', '1', 'ticket')).toContain('ticket=');
    expect(createReconnectDelay(2, 1000)).toBeGreaterThanOrEqual(1000);
  });

  test('refresh coordinator merges concurrent refreshes', async () => {
    let calls = 0;
    const coordinator = createRefreshCoordinator({
      doRefresh: async () => {
        calls += 1;
        return { status: 200, data: { code: 200, data: { expiresInMs: 1000 } } };
      },
    });
    await Promise.all([coordinator.refresh('a'), coordinator.refresh('b')]);
    expect(calls).toBe(1);
  });

  test('401 interceptor refreshes and retries once', async () => {
    let adapterCalls = 0;
    jest.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: { code: 200, data: { expiresInMs: 1000 } } });
    registerAuthHooks({ getAccessToken: () => 't', getSessionGeneration: () => 1, onAuthInvalid: jest.fn() });
    apiClient.defaults.adapter = async (config) => {
      adapterCalls += 1;
      if (adapterCalls === 1) {
        return Promise.reject({ config, response: { status: 401, data: { code: 401 } } });
      }
      return { config, status: 200, statusText: 'OK', headers: {}, data: { code: 200, data: { ok: true } } };
    };
    const response = await apiClient.get('/protected');
    expect(response.data.data).toEqual({ ok: true });
    expect(adapterCalls).toBe(2);
  });

  test('authStore restoreSession reads token parser result', async () => {
    jest.spyOn(authService, 'parseAccessToken').mockResolvedValue({
      code: 200,
      message: 'ok',
      data: { valid: true, userId: '1', username: 'alice', permissions: ['log:read'] },
    });
    await secureStorage.set('im.mobile.access-token', 'token');
    await expect(useAuthStore.getState().restoreSession()).resolves.toBe(true);
    expect(useAuthStore.getState().currentUser?.id).toBe('1');
  });

  test('encrypted message safe mask hides content and media', () => {
    const masked = maskEncryptedMessage({ ...message('e1', 'ciphertext'), encrypted: true, mediaUrl: 'https://x' });
    expect(masked.content).toContain('端到端加密');
    expect(masked.mediaUrl).toBeUndefined();
    expect(masked.content).not.toContain('ciphertext');
  });

  test('encrypted session blocks mobile plaintext sending', () => {
    expect(() => assertPlaintextSendAllowed({ ...session, encrypted: true })).toThrow();
  });

  test('notification routing displays local notification', async () => {
    await expect(displaySystemNotification('Title', 'Body', { route: 'Chat' })).resolves.toBeUndefined();
    expect(notificationEventRepository.listRecent()[0].routeName).toBe('ChatScreen');
  });

  test('disabled notifications are logged without displaying sensitive data', async () => {
    kvStorage.setBoolean('notification.enabled', false);
    await displaySystemNotification('Title', 'Body', {
      route: 'Chat',
      accessToken: 'secret',
      conversationId: 'c1',
    });
    const event = notificationEventRepository.listRecent()[0];
    expect(event.type).toBe('notification_suppressed');
    expect(event.payloadJson).toContain('[REDACTED]');
    expect(event.payloadJson).not.toContain('secret');
  });

  test('settingsStore persists notification setting', async () => {
    jest.spyOn(userService, 'updateSettings').mockResolvedValue({ code: 200, message: 'ok', data: true });
    await useSettingsStore.getState().updateMessageSetting('enableNotification', false);
    expect(useSettingsStore.getState().notificationEnabled).toBe(false);
  });

  test('chatStore addMessage dedupes same message', () => {
    const store = useMessageStore.getState();
    store.addMessage(message('m2'), session.id);
    store.addMessage(message('m2', 'same'), session.id);
    expect(useMessageStore.getState().messagesBySession[session.id]).toHaveLength(1);
  });

  test('message send optimistic update writes local pending', async () => {
    let sawPendingBeforeResponse = false;
    jest.spyOn(messageService, 'sendPrivate').mockImplementation(async (payload) => {
      sawPendingBeforeResponse = pendingMessageRepository.listReady().length === 1;
      return {
        code: 200,
        message: 'ok',
        data: { ...message('server_1'), clientMessageId: payload.clientMessageId },
      };
    });
    await useMessageStore.getState().sendText(session, 'hello');
    const messages = useMessageStore.getState().messagesBySession[session.id];
    expect(sawPendingBeforeResponse).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0].serverId).toBe('server_1');
    expect(pendingMessageRepository.listReady(Date.now() + 120_000)).toHaveLength(0);
  });

  test('message retry leaves failed pending on API failure', async () => {
    jest.spyOn(messageService, 'sendPrivate').mockRejectedValue(new Error('offline'));
    await useMessageStore.getState().sendText(session, 'hello');
    const failed = useMessageStore.getState().messagesBySession[session.id].some((item) => item.status === 'FAILED');
    expect(failed).toBe(true);
    expect(pendingMessageRepository.listReady(Date.now() + 120_000)).toHaveLength(1);
  });

  test('message retry success deletes pending and keeps original clientMessageId', async () => {
    const sendSpy = jest
      .spyOn(messageService, 'sendPrivate')
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (payload) => ({
        code: 200,
        message: 'ok',
        data: { ...message('server_retry'), clientMessageId: payload.clientMessageId },
      }));

    await useMessageStore.getState().sendText(session, 'hello');
    const pending = pendingMessageRepository.listReady(Date.now() + 120_000)[0];
    const payload = JSON.parse(pending.payloadJson) as { data: { clientMessageId: string } };
    pendingMessageRepository.update({ ...pending, status: 'pending', nextRetryAt: Date.now() - 1 });
    await useMessageStore.getState().retryPending();

    const messages = useMessageStore.getState().messagesBySession[session.id];
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(messages).toHaveLength(1);
    expect(messages[0].clientMessageId).toBe(payload.data.clientMessageId);
    expect(messages[0].serverId).toBe('server_retry');
    expect(pendingMessageRepository.get(pending.localId)).toBeUndefined();
  });

  test('markRead sends peerId for private sessions', async () => {
    const markReadSpy = jest.spyOn(messageService, 'markRead').mockResolvedValue({
      code: 200,
      message: 'ok',
      data: 'ok',
    });

    await expect(useMessageStore.getState().markRead(session)).resolves.toBeUndefined();

    expect(markReadSpy).toHaveBeenCalledWith('2');
  });

  test('markRead sends group_{id} for group sessions', async () => {
    const markReadSpy = jest.spyOn(messageService, 'markRead').mockResolvedValue({
      code: 200,
      message: 'ok',
      data: 'ok',
    });

    await expect(useMessageStore.getState().markRead(groupSession)).resolves.toBeUndefined();

    expect(markReadSpy).toHaveBeenCalledWith('group_9');
  });

  test('markRead success clears local unread count', async () => {
    jest.spyOn(messageService, 'markRead').mockResolvedValue({
      code: 200,
      message: 'ok',
      data: 'ok',
    });
    useSessionStore.getState().setSessions([{ ...session, unreadCount: 3 }]);

    await useMessageStore.getState().markRead(session);

    expect(useSessionStore.getState().sessions.find((item) => item.id === session.id)?.unreadCount).toBe(0);
  });

  test('markRead failure logs warning without breaking page state', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    jest.spyOn(messageService, 'markRead').mockRejectedValue(new Error('offline'));
    useSessionStore.getState().setSessions([{ ...session, unreadCount: 4 }]);

    await expect(useMessageStore.getState().markRead(session)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      'message',
      'markRead failed',
      expect.objectContaining({ sessionId: session.id, readTarget: '2', error: 'offline' }),
    );
    expect(useSessionStore.getState().sessions.find((item) => item.id === session.id)?.unreadCount).toBe(4);
  });

  test('websocket echo with same clientMessageId merges into pending message', async () => {
    let sentClientMessageId = '';
    jest.spyOn(messageService, 'sendPrivate').mockImplementation(async (payload) => {
      sentClientMessageId = payload.clientMessageId;
      return {
        code: 200,
        message: 'ok',
        data: { ...message('server_2'), clientMessageId: payload.clientMessageId },
      };
    });
    await useMessageStore.getState().sendText(session, 'hello');
    await useWebsocketStore.getState().dispatchPayload({
      type: 'MESSAGE',
      data: {
        id: 'server_2_ws',
        clientMessageId: sentClientMessageId,
        senderId: '1',
        receiverId: '2',
        messageType: 'TEXT',
        content: 'hello',
        sendTime: new Date().toISOString(),
      },
    });

    expect(useMessageStore.getState().messagesBySession[session.id]).toHaveLength(1);
  });

  test('media retry uploads once through persisted upload task before sending', async () => {
    const uploadSpy = jest
      .spyOn(fileService, 'upload')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        code: 200,
        message: 'ok',
        data: { url: 'https://cdn.example/a.png', fileName: 'a.png', size: 10 },
      });
    const sendSpy = jest.spyOn(messageService, 'sendPrivate').mockResolvedValue({
      code: 200,
      message: 'ok',
      data: {
        ...message('server_media'),
        messageType: 'IMAGE',
        mediaUrl: 'https://cdn.example/a.png',
      },
    });

    await useMessageStore.getState().sendMedia(
      session,
      { uri: 'file:///tmp/a.png', name: 'a.png', type: 'image/png', size: 10 },
      'IMAGE',
    );

    expect(sendSpy).not.toHaveBeenCalled();
    const local = useMessageStore
      .getState()
      .messagesBySession[session.id].find((item) => item.messageType === 'IMAGE');
    expect(local?.status).toBe('FAILED');
    const task = uploadTaskRepository.findByLocalMessageId(local?.id || '');
    expect(task?.status).toBe('failed');

    const pending = pendingMessageRepository.listReady(Date.now() + 120_000)[0];
    pendingMessageRepository.update({ ...pending, status: 'pending', nextRetryAt: Date.now() - 1 });
    await useMessageStore.getState().retryPending();

    expect(uploadSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ mediaUrl: 'https://cdn.example/a.png' }));
    expect(uploadTaskRepository.findByLocalMessageId(local?.id || '')?.status).toBe('uploaded');
  });

  test('websocket message dispatch writes normalized message', async () => {
    await useWebsocketStore.getState().dispatchPayload({ type: 'MESSAGE', data: message('ws1') });
    expect(useMessageStore.getState().messagesBySession[session.id]).toHaveLength(1);
  });

  test('websocket current session and self messages do not trigger local notification', async () => {
    useSessionStore.getState().setCurrentSession(session);
    await useWebsocketStore.getState().dispatchPayload({
      type: 'MESSAGE',
      data: { ...message('ws_current'), senderId: '2', receiverId: '1' },
    });
    await useWebsocketStore.getState().dispatchPayload({
      type: 'MESSAGE',
      data: { ...message('ws_self'), senderId: '1', receiverId: '2' },
    });
    expect(notificationEventRepository.listRecent()).toHaveLength(0);
  });

  test('websocket non-current message from another user triggers local notification and unread', async () => {
    await useWebsocketStore.getState().dispatchPayload({
      type: 'MESSAGE',
      data: { ...message('ws_notify'), senderId: '2', receiverId: '1' },
    });
    const events = notificationEventRepository.listRecent();
    expect(events[0].type).toBe('notification_displayed');
    expect(useSessionStore.getState().sessions.find((item) => item.id === session.id)?.unreadCount).toBe(1);
  });

  test('websocket read receipt refreshes sessions', async () => {
    const refreshSpy = jest.spyOn(useChatStore.getState(), 'refreshSessions').mockResolvedValue();
    await useWebsocketStore.getState().dispatchPayload({ type: 'READ_RECEIPT', data: { readerId: '2' } });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  test('FCM token returns empty when Firebase Messaging is unavailable', async () => {
    (messaging as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('missing firebase app');
    });
    await expect(getFcmToken()).resolves.toBe('');
  });
});
