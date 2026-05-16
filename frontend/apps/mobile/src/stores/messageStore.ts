import { create } from 'zustand';
import { applyMessageToSession, applyReadReceiptToMessages, buildSessionId, createNextRetryAt, shouldStopRetry } from '@im/shared-im-core';
import { normalizeReadReceipt } from '@im/shared-normalizers';
import { applyMobileMessageToList, hasSameMobileMessageIdentity, resolveMessageSessionId } from '@/utils/normalizers';
import { RETRY_CONFIG } from '@/constants/config';
import { assertPlaintextSendAllowed, blockEncryptedPendingPayload, maskEncryptedMessage } from '@/e2ee/e2eeDeferred';
import { messageService, resolveMarkReadTarget, type SendMessagePayload } from '@/services/chat/messageService';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadService } from '@/services/upload/uploadService';
import { logger } from '@/utils/logger';
import { createClientMessageId, createLocalMessageId } from '@/utils/ids';
import { useAuthStore } from './authStore';
import { useSessionStore } from './sessionStore';
import type { ChatSession, MessageType } from '@im/shared-types';
import type { MobileMessage, PendingMessage, MessagePaginationState } from '@/types/models';
import type { MobileFile } from '@/services/file/fileService';

interface PendingSendPayload {
  sendType: 'private' | 'group';
  data: SendMessagePayload;
  encrypted?: boolean;
  uploadTaskId?: string;
}

const inflightPendingRetries = new Set<string>();

const updateLocalMessage = (
  state: MessageState,
  conversationId: string,
  localId: string,
  updater: (message: MobileMessage) => MobileMessage,
) => {
  const list = state.messagesBySession[conversationId] || [];
  const nextList = list.map((item) => (item.id === localId ? updater(item) : item));
  const updated = nextList.find((item) => item.id === localId);
  if (updated) {
    messageRepository.upsertMessages(conversationId, [updated]);
  }
  return { nextList, updated };
};

interface MessageState {
  messagesBySession: Record<string, MobileMessage[]>;
  messagesPaginationBySession: Record<string, MessagePaginationState>;
  loading: boolean;
  searchResults: MobileMessage[];
  loadMessages: (session: ChatSession, refresh?: boolean) => Promise<void>;
  addMessage: (message: MobileMessage, sessionId?: string) => void;
  sendText: (session: ChatSession, content: string) => Promise<void>;
  sendMedia: (session: ChatSession, file: MobileFile, type: MessageType) => Promise<void>;
  retryPending: () => Promise<void>;
  retryMessage: (localId: string) => Promise<void>;
  markRead: (session: ChatSession) => Promise<void>;
  applyReadReceipt: (rawReceipt: unknown) => void;
  searchMessages: (keyword: string, sessionId?: string) => void;
  clearMessages: (sessionId: string) => void;
  clearRuntime: () => void;
  clear: () => void;
}

const sessionIdFor = (message: MobileMessage): string =>
  resolveMessageSessionId(message, useAuthStore.getState().currentUser?.id || '') || message.conversationId || '';

const optimisticMessage = (
  session: ChatSession,
  type: MessageType,
  payload: Partial<MobileMessage>,
): MobileMessage => {
  const user = useAuthStore.getState().currentUser;
  const now = new Date().toISOString();
  return {
    id: createLocalMessageId(),
    clientMessageId: createClientMessageId(),
    conversationId: session.id,
    senderId: user?.id || '',
    senderName: user?.nickname || user?.username,
    senderAvatar: user?.avatar,
    receiverId: session.type === 'private' ? session.targetId : undefined,
    groupId: session.type === 'group' ? session.targetId : undefined,
    isGroupChat: session.type === 'group',
    messageType: type,
    sendTime: now,
    status: 'SENDING',
    ...payload,
    content: payload.content || '',
  };
};

const payloadFor = (session: ChatSession, message: MobileMessage): SendMessagePayload => ({
  receiverId: session.type === 'private' ? session.targetId : undefined,
  groupId: session.type === 'group' ? session.targetId : undefined,
  clientMessageId: message.clientMessageId || createClientMessageId(),
  messageType: message.messageType,
  content: message.messageType === 'TEXT' ? message.content : undefined,
  mediaUrl: message.messageType === 'TEXT' ? undefined : message.mediaUrl,
  mediaName: message.mediaName,
  mediaSize: message.mediaSize,
  thumbnailUrl: message.thumbnailUrl,
  duration: message.duration,
  extra: message.extra,
});

const enqueuePending = (
  session: ChatSession,
  message: MobileMessage,
  payload: SendMessagePayload,
  uploadTaskId?: string,
) => {
  const existingByClientMessageId = payload.clientMessageId
    ? pendingMessageRepository.findByClientMessageId(payload.clientMessageId)
    : undefined;
  if (existingByClientMessageId && existingByClientMessageId.localId !== message.id) {
    logger.warn('message', 'duplicate pending enqueue blocked', {
      localId: message.id,
      existingLocalId: existingByClientMessageId.localId,
      clientMessageId: payload.clientMessageId,
      conversationId: session.id,
    });
    return;
  }
  const now = Date.now();
  const pending: PendingMessage = {
    localId: message.id,
    conversationId: session.id,
    sendType: session.type,
    payloadJson: JSON.stringify({ sendType: session.type, data: payload, uploadTaskId }),
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  pendingMessageRepository.enqueue(pending);
};

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesBySession: {},
  messagesPaginationBySession: {},
  loading: false,
  searchResults: [],

  async loadMessages(session, refresh = false) {
    set({ loading: true });
    try {
      const cached = refresh ? [] : messageRepository.listMessages(session.id, 50);
      if (cached.length > 0) {
        const safeCached = cached.map(maskEncryptedMessage);
        set({ messagesBySession: { ...get().messagesBySession, [session.id]: safeCached } });
      }
      const response =
        session.type === 'group'
          ? await messageService.getGroupHistory(session.targetId, { size: 50 })
          : await messageService.getPrivateHistory(session.targetId, { size: 50 });
      const safeMessages = response.data.map(maskEncryptedMessage);
      messageRepository.upsertMessages(session.id, safeMessages);
      set({ messagesBySession: { ...get().messagesBySession, [session.id]: safeMessages } });
    } finally {
      set({ loading: false });
    }
  },

  addMessage(message, sessionId = sessionIdFor(message)) {
    const safeMessage = maskEncryptedMessage(message);
    const existing = get().messagesBySession[sessionId] || [];
    const next = applyMobileMessageToList(existing, safeMessage);
    const persistedMessage = next.find((item) => hasSameMobileMessageIdentity(item, safeMessage)) || safeMessage;
    messageRepository.upsertMessages(sessionId, [persistedMessage]);
    set({ messagesBySession: { ...get().messagesBySession, [sessionId]: next } });
    const sessionStore = useSessionStore.getState();
    const session = sessionStore.sessions.find((item) => item.id === sessionId);
    if (session) {
      const applied = applyMessageToSession(session, persistedMessage, { incrementUnread: false });
      sessionStore.upsertSession({
        ...session,
        lastMessage: applied.lastMessage,
        lastMessageTime: applied.lastMessageTime,
        lastActiveTime: applied.lastActiveTime,
      });
    }
  },

  async sendText(session, content) {
    assertPlaintextSendAllowed(session);
    const message = optimisticMessage(session, 'TEXT', { content });
    get().addMessage(message, session.id);
    const payload = payloadFor(session, message);
    enqueuePending(session, message, payload);
    await get().retryMessage(message.id);
  },

  async sendMedia(session, file, type) {
    assertPlaintextSendAllowed(session);
    const message = optimisticMessage(session, type, {
      mediaName: file.name,
      mediaSize: file.size,
      mediaUrl: file.uri,
      thumbnailUrl: file.thumbnailUrl,
      duration: file.duration,
    });
    get().addMessage(message, session.id);
    const uploadTask = uploadService.createTask(file, type, {
      conversationId: session.id,
      localMessageId: message.id,
    });
    enqueuePending(session, message, payloadFor(session, message), uploadTask.taskId);
    await get().retryMessage(message.id);
  },

  async retryPending() {
    const pending = pendingMessageRepository.listReady();
    for (const item of pending) {
      await get().retryMessage(item.localId);
    }
  },

  async retryMessage(localId) {
    const pending = pendingMessageRepository.get(localId);
    if (!pending || inflightPendingRetries.has(localId)) {
      return;
    }
    inflightPendingRetries.add(localId);
    const payload = JSON.parse(pending.payloadJson) as PendingSendPayload;
    try {
      if (blockEncryptedPendingPayload(payload)) {
        pendingMessageRepository.update({ ...pending, status: 'blocked', lastError: 'E2EE deferred' });
        return;
      }
      const duplicateByClientMessageId = payload.data.clientMessageId
        ? pendingMessageRepository.findByClientMessageId(payload.data.clientMessageId)
        : undefined;
      if (duplicateByClientMessageId && duplicateByClientMessageId.localId !== localId) {
        pendingMessageRepository.remove(localId);
        return;
      }
      pendingMessageRepository.update({
        ...pending,
        status: 'sending',
        lastError: undefined,
      });
      const data = { ...payload.data };
      if (payload.uploadTaskId) {
        const uploaded = await uploadService.uploadExistingTask(payload.uploadTaskId);
        data.mediaUrl = uploaded.url;
        data.thumbnailUrl = uploaded.thumbnailUrl || data.thumbnailUrl;
        data.mediaName = uploaded.fileName || data.mediaName;
        data.mediaSize = uploaded.size || data.mediaSize;
        pendingMessageRepository.update({
          ...pending,
          payloadJson: JSON.stringify({ ...payload, data }),
          status: 'sending',
        });
        const { nextList } = updateLocalMessage(get(), pending.conversationId, localId, (item) => ({
          ...item,
          mediaUrl: uploaded.url,
          thumbnailUrl: uploaded.thumbnailUrl || item.thumbnailUrl,
          mediaName: uploaded.fileName || item.mediaName,
          mediaSize: uploaded.size || item.mediaSize,
          status: 'SENDING',
        }));
        set({
          messagesBySession: {
            ...get().messagesBySession,
            [pending.conversationId]: nextList,
          },
        });
      }
      const response = payload.sendType === 'group'
        ? await messageService.sendGroup(data)
        : await messageService.sendPrivate(data);
      const serverMessage: MobileMessage = {
        ...response.data,
        messageId: response.data.id || response.data.messageId,
        clientMessageId: response.data.clientMessageId || data.clientMessageId,
        conversationId: pending.conversationId,
        status: 'SENT',
      };
      get().addMessage(serverMessage, pending.conversationId);
      if (data.clientMessageId) {
        pendingMessageRepository.removeByClientMessageId(data.clientMessageId);
      }
      pendingMessageRepository.remove(localId);
    } catch (error) {
      const retryCount = pending.retryCount + 1;
      pendingMessageRepository.update({
        ...pending,
        status: shouldStopRetry(retryCount, RETRY_CONFIG.maxRetryCount) ? 'failed' : 'pending',
        retryCount,
        lastError: error instanceof Error ? error.message : 'send failed',
        nextRetryAt: createNextRetryAt(retryCount, Date.now(), { baseDelayMs: RETRY_CONFIG.baseDelayMs, maxDelayMs: RETRY_CONFIG.maxDelayMs }),
      });
      const { nextList } = updateLocalMessage(get(), pending.conversationId, localId, (item) => ({
        ...item,
        status: 'FAILED',
      }));
      set({
        messagesBySession: {
          ...get().messagesBySession,
          [pending.conversationId]: nextList,
        },
      });
    } finally {
      inflightPendingRetries.delete(localId);
    }
  },

  async markRead(session) {
    const readTarget = resolveMarkReadTarget(session);
    try {
      await messageService.markRead(readTarget);
      useSessionStore.getState().markRead(session.id);
    } catch (error) {
      logger.warn('message', 'markRead failed', {
        sessionId: session.id,
        readTarget,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  applyReadReceipt(rawReceipt) {
    const receipt = normalizeReadReceipt(rawReceipt);
    if (!receipt || !receipt.lastReadMessageId) {
      return;
    }
    const currentUserId = useAuthStore.getState().currentUser?.id || '';
    if (!currentUserId) {
      return;
    }

    const isSelfRead = receipt.readerId === currentUserId;

    let sessionId: string;
    if (receipt.conversationId && receipt.conversationId.startsWith('group_')) {
      sessionId = receipt.conversationId;
    } else if (isSelfRead) {
      const targetId =
        receipt.toUserId && receipt.toUserId !== currentUserId
          ? receipt.toUserId
          : '';
      if (!targetId) {
        return;
      }
      sessionId = buildSessionId('private', currentUserId, targetId);
    } else {
      sessionId = buildSessionId('private', currentUserId, receipt.readerId);
    }

    const list = get().messagesBySession[sessionId];
    if (!list || list.length === 0) {
      return;
    }

    const { updated, changed } = applyReadReceiptToMessages(list, receipt, {
      targetUserId: currentUserId,
      mode: isSelfRead ? 'sync' : 'received',
      isGroupSession: sessionId.startsWith('group_'),
    });

    if (changed.length === 0) {
      return;
    }

    messageRepository.upsertMessages(sessionId, changed);
    set({ messagesBySession: { ...get().messagesBySession, [sessionId]: updated } });
  },

  searchMessages(keyword, sessionId) {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) {
      set({ searchResults: [] });
      return;
    }
    const source = sessionId
      ? get().messagesBySession[sessionId] || []
      : Object.values(get().messagesBySession).flat();
    set({
      searchResults: source.filter((message) => String(message.content || message.mediaName || '').toLowerCase().includes(normalized)),
    });
  },

  clearMessages(sessionId) {
    messageRepository.clearConversation(sessionId);
    const next = { ...get().messagesBySession };
    delete next[sessionId];
    set({ messagesBySession: next });
  },

  /**
   * 只清理消息 store 的内存运行态。
   * 会清：messagesBySession、searchResults、inflightPendingRetries。
   * 不会清：pending 持久表、messages/sessions/media_cache 等主表。
   */
  clearRuntime() {
    inflightPendingRetries.clear();
    set({ messagesBySession: {}, messagesPaginationBySession: {}, searchResults: [] });
  },

  /**
   * 清理消息 store 的内存运行态和 pending 持久层。
   * 会清：messagesBySession、searchResults、inflightPendingRetries、pending 表。
   * 不会清：messages/sessions/media_cache 等主表（由 clearAllCache 处理）。
   */
  clear() {
    pendingMessageRepository.clear();
    inflightPendingRetries.clear();
    set({ messagesBySession: {}, messagesPaginationBySession: {}, searchResults: [] });
  },
}));
