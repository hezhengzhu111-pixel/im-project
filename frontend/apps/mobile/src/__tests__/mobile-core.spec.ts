import axios from 'axios';
import { createReconnectDelay, createTicketedWebSocketUrl } from '@im/shared-ws-core';
import { createRefreshCoordinator } from '@im/shared-auth-core';
import { apiClient, registerAuthHooks } from '@/services/api/httpClient';
import { secureStorage } from '@/services/storage/secureStorage';
import { kvStorage } from '@/services/storage/kvStorage';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { maskEncryptedMessage } from '@/e2ee/e2eeDeferred';
import { displaySystemNotification } from '@/services/notification/notificationService';
import { authService } from '@/services/auth/authService';
import { messageService } from '@/services/chat/messageService';
import { userService } from '@/services/user/userService';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWebsocketStore } from '@/stores/websocketStore';
import type { ChatSession, MobileMessage, PendingMessage, UploadTask } from '@/types/models';

const session: ChatSession = {
  id: 'private_1_2',
  type: 'private',
  targetId: '2',
  targetName: 'Bob',
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
    messageRepository.clearAllCache();
    pendingMessageRepository.clear();
    uploadTaskRepository.clear();
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
  });

  test('notification routing displays local notification', async () => {
    await expect(displaySystemNotification('Title', 'Body', { route: 'Chat' })).resolves.toBeUndefined();
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
    jest.spyOn(messageService, 'sendPrivate').mockResolvedValue({
      code: 200,
      message: 'ok',
      data: message('server_1'),
    });
    await useMessageStore.getState().sendText(session, 'hello');
    expect(useMessageStore.getState().messagesBySession[session.id].length).toBeGreaterThan(0);
  });

  test('message retry leaves failed pending on API failure', async () => {
    jest.spyOn(messageService, 'sendPrivate').mockRejectedValue(new Error('offline'));
    await useMessageStore.getState().sendText(session, 'hello');
    const failed = useMessageStore.getState().messagesBySession[session.id].some((item) => item.status === 'FAILED');
    expect(failed).toBe(true);
  });

  test('websocket message dispatch writes normalized message', async () => {
    await useWebsocketStore.getState().dispatchPayload({ type: 'MESSAGE', data: message('ws1') });
    expect(useMessageStore.getState().messagesBySession[session.id]).toHaveLength(1);
  });
});
