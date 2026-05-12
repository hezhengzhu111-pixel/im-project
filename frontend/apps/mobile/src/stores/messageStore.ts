import { create } from 'zustand';
import { RETRY_CONFIG } from '@/constants/config';
import { assertPlaintextSendAllowed, blockEncryptedPendingPayload, maskEncryptedMessage } from '@/e2ee/e2eeDeferred';
import { messageService, type SendMessagePayload } from '@/services/chat/messageService';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadService } from '@/services/upload/uploadService';
import { createClientMessageId, createLocalMessageId } from '@/utils/ids';
import { useAuthStore } from './authStore';
import { useSessionStore } from './sessionStore';
import type { ChatSession, MessageType, MobileMessage, PendingMessage } from '@/types/models';
import type { MobileFile } from '@/services/file/fileService';

interface MessageState {
  messagesBySession: Record<string, MobileMessage[]>;
  loading: boolean;
  searchResults: MobileMessage[];
  loadMessages: (session: ChatSession, refresh?: boolean) => Promise<void>;
  addMessage: (message: MobileMessage, sessionId?: string) => void;
  sendText: (session: ChatSession, content: string) => Promise<void>;
  sendMedia: (session: ChatSession, file: MobileFile, type: MessageType) => Promise<void>;
  retryPending: () => Promise<void>;
  retryMessage: (localId: string) => Promise<void>;
  markRead: (session: ChatSession) => Promise<void>;
  searchMessages: (keyword: string, sessionId?: string) => void;
  clearMessages: (sessionId: string) => void;
  clear: () => void;
}

const resolveSessionId = (message: MobileMessage): string => {
  if (message.conversationId) {
    return message.conversationId;
  }
  if (message.groupId || message.isGroupChat) {
    return `group_${message.groupId}`;
  }
  const currentUserId = useAuthStore.getState().currentUser?.id || '';
  const targetId = message.senderId === currentUserId ? message.receiverId : message.senderId;
  return `private_${currentUserId}_${targetId}`;
};

const hasSameMobileMessageIdentity = (left: MobileMessage, right: MobileMessage): boolean => {
  if (left.serverId && right.serverId && left.serverId === right.serverId) {
    return true;
  }
  if (left.id && right.id && left.id === right.id) {
    return true;
  }
  return Boolean(left.clientMessageId && right.clientMessageId && left.clientMessageId === right.clientMessageId);
};

const nextRetryAt = (retryCount: number) =>
  Date.now() + Math.min(RETRY_CONFIG.maxDelayMs, RETRY_CONFIG.baseDelayMs * 2 ** retryCount);

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

const enqueuePending = (session: ChatSession, message: MobileMessage, payload: SendMessagePayload) => {
  const now = Date.now();
  const pending: PendingMessage = {
    localId: message.id,
    conversationId: session.id,
    sendType: session.type,
    payloadJson: JSON.stringify({ sendType: session.type, data: payload }),
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  pendingMessageRepository.enqueue(pending);
};

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesBySession: {},
  loading: false,
  searchResults: [],

  async loadMessages(session, refresh = false) {
    set({ loading: true });
    try {
      const cached = refresh ? [] : messageRepository.listMessages(session.id, 50);
      if (cached.length > 0) {
        set({ messagesBySession: { ...get().messagesBySession, [session.id]: cached } });
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

  addMessage(message, sessionId = resolveSessionId(message)) {
    const safeMessage = maskEncryptedMessage(message);
    const existing = get().messagesBySession[sessionId] || [];
    const next = existing.slice();
    const index = next.findIndex((item) => hasSameMobileMessageIdentity(item, safeMessage));
    if (index >= 0) {
      next[index] = { ...next[index], ...safeMessage };
    } else {
      next.push(safeMessage);
    }
    next.sort((left, right) => new Date(left.sendTime).getTime() - new Date(right.sendTime).getTime());
    messageRepository.upsertMessages(sessionId, [safeMessage]);
    set({ messagesBySession: { ...get().messagesBySession, [sessionId]: next } });
    const sessionStore = useSessionStore.getState();
    const session = sessionStore.sessions.find((item) => item.id === sessionId);
    if (session) {
      sessionStore.upsertSession({ ...session, lastMessage: safeMessage, lastActiveTime: safeMessage.sendTime });
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
    });
    get().addMessage(message, session.id);
    enqueuePending(session, message, payloadFor(session, message));
    try {
      const uploaded = await uploadService.uploadFile(file, type, {
        conversationId: session.id,
        localMessageId: message.id,
      });
      const next = { ...message, mediaUrl: uploaded.url };
      get().addMessage(next, session.id);
      enqueuePending(session, next, payloadFor(session, next));
      await get().retryMessage(next.id);
    } catch {
      get().addMessage({ ...message, status: 'FAILED' }, session.id);
    }
  },

  async retryPending() {
    const pending = pendingMessageRepository.listReady();
    for (const item of pending) {
      await get().retryMessage(item.localId);
    }
  },

  async retryMessage(localId) {
    const pending = pendingMessageRepository.listReady().find((item) => item.localId === localId);
    if (!pending) {
      return;
    }
    const payload = JSON.parse(pending.payloadJson) as { sendType: 'private' | 'group'; data: SendMessagePayload; encrypted?: boolean };
    if (blockEncryptedPendingPayload(payload)) {
      pendingMessageRepository.update({ ...pending, status: 'blocked', lastError: 'E2EE deferred' });
      return;
    }
    try {
      const response = payload.sendType === 'group'
        ? await messageService.sendGroup(payload.data)
        : await messageService.sendPrivate(payload.data);
      get().addMessage({ ...response.data, status: 'SENT' }, pending.conversationId);
      pendingMessageRepository.remove(localId);
    } catch (error) {
      const retryCount = pending.retryCount + 1;
      pendingMessageRepository.update({
        ...pending,
        status: retryCount >= RETRY_CONFIG.maxRetryCount ? 'failed' : 'pending',
        retryCount,
        lastError: error instanceof Error ? error.message : 'send failed',
        nextRetryAt: nextRetryAt(retryCount),
      });
      const list = get().messagesBySession[pending.conversationId] || [];
      set({
        messagesBySession: {
          ...get().messagesBySession,
          [pending.conversationId]: list.map((item) =>
            item.id === localId ? { ...item, status: 'FAILED' } : item,
          ),
        },
      });
    }
  },

  async markRead(session) {
    await messageService.markRead(session.type === 'group' ? `group_${session.targetId}` : session.targetId);
    useSessionStore.getState().markRead(session.id);
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

  clear() {
    pendingMessageRepository.clear();
    set({ messagesBySession: {}, searchResults: [] });
  },
}));
