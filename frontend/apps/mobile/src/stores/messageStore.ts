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
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { logger } from '@/utils/logger';
import { createClientMessageId, createLocalMessageId } from '@/utils/ids';
import { createInitialPaginationState, getMessageCursor, mergePagedMessages } from '@/utils/messagePagination';
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

const PAGE_SIZE = 50;

interface MessageState {
  messagesBySession: Record<string, MobileMessage[]>;
  messagesPaginationBySession: Record<string, MessagePaginationState>;
  loading: boolean;
  searchResults: MobileMessage[];
  loadMessages: (session: ChatSession, refresh?: boolean) => Promise<void>;
  loadInitialMessages: (session: ChatSession) => Promise<void>;
  loadOlderMessages: (session: ChatSession) => Promise<void>;
  refreshLatestMessages: (session: ChatSession) => Promise<void>;
  resetMessagePagination: (sessionId?: string) => void;
  addMessage: (message: MobileMessage, sessionId?: string) => void;
  sendText: (session: ChatSession, content: string) => Promise<void>;
  sendMedia: (session: ChatSession, file: MobileFile, type: MessageType) => Promise<void>;
  retryPending: () => Promise<void>;
  retryMessage: (localId: string, options?: { force?: boolean }) => Promise<void>;
  markRead: (session: ChatSession) => Promise<void>;
  applyReadReceipt: (rawReceipt: unknown) => void;
  searchMessages: (keyword: string, sessionId?: string) => void;
  clearMessages: (sessionId: string) => void;
  deleteLocalMessage: (sessionId: string, messageId: string) => void;
  recallMessage: (sessionId: string, message: MobileMessage) => Promise<void>;
  applyRecalledMessage: (sessionId: string, recalledMessage: MobileMessage) => void;
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
    if (refresh) {
      const pagination = get().messagesPaginationBySession[session.id];
      if (pagination?.initialized) {
        return get().refreshLatestMessages(session);
      }
    }
    return get().loadInitialMessages(session);
  },

  async loadInitialMessages(session) {
    const sid = session.id;
    set((s) => ({
      loading: true,
      messagesPaginationBySession: {
        ...s.messagesPaginationBySession,
        [sid]: { ...createInitialPaginationState(), loadingInitial: true },
      },
    }));

    let localMessages: MobileMessage[] = [];
    try {
      const localPage = messageRepository.listMessagesPage(sid, { limit: PAGE_SIZE });
      localMessages = localPage.messages.map(maskEncryptedMessage);
      if (localMessages.length > 0) {
        set((s) => ({
          messagesBySession: { ...s.messagesBySession, [sid]: localMessages },
        }));
      }
    } catch {
      // local read failure is non-fatal, continue to remote
    }

    try {
      const response =
        session.type === 'group'
          ? await messageService.getGroupHistory(session.targetId, { size: PAGE_SIZE })
          : await messageService.getPrivateHistory(session.targetId, { size: PAGE_SIZE });
      const remoteMessages = response.data.map(maskEncryptedMessage);
      const merged = mergePagedMessages(localMessages, remoteMessages, 'replace');
      messageRepository.upsertMessages(sid, merged);
      const cursor = getMessageCursor(merged);
      set((s) => ({
        messagesBySession: { ...s.messagesBySession, [sid]: merged },
        messagesPaginationBySession: {
          ...s.messagesPaginationBySession,
          [sid]: {
            loadingInitial: false,
            loadingOlder: false,
            refreshingLatest: false,
            hasMoreBefore: merged.length >= PAGE_SIZE,
            hasMoreAfter: false,
            initialized: true,
            ...cursor,
          },
        },
      }));
    } catch (error) {
      set((s) => ({
        messagesPaginationBySession: {
          ...s.messagesPaginationBySession,
          [sid]: {
            ...(s.messagesPaginationBySession[sid] || createInitialPaginationState()),
            loadingInitial: false,
            lastError: error instanceof Error ? error.message : 'load failed',
            initialized: localMessages.length > 0,
          },
        },
      }));
    } finally {
      set({ loading: false });
    }
  },

  async loadOlderMessages(session) {
    const sid = session.id;
    const pagination = get().messagesPaginationBySession[sid];
    if (pagination?.loadingOlder) return;
    if (pagination && !pagination.hasMoreBefore) return;

    const currentMessages = get().messagesBySession[sid] || [];
    if (currentMessages.length === 0) return;

    const oldest = currentMessages[0];
    const beforeTime = oldest.sendTime;
    const beforeId = oldest.id || oldest.serverId || oldest.messageId;

    set((s) => ({
      messagesPaginationBySession: {
        ...s.messagesPaginationBySession,
        [sid]: { ...(s.messagesPaginationBySession[sid] || createInitialPaginationState()), loadingOlder: true },
      },
    }));

    let localOlder: MobileMessage[] = [];
    try {
      const localPage = messageRepository.listMessagesPage(sid, {
        limit: PAGE_SIZE,
        beforeTime,
        beforeId,
      });
      localOlder = localPage.messages.map(maskEncryptedMessage);
      if (localOlder.length > 0) {
        const merged = mergePagedMessages(currentMessages, localOlder, 'prependOlder');
        set((s) => ({ messagesBySession: { ...s.messagesBySession, [sid]: merged } }));
      }
    } catch {
      // non-fatal
    }

    try {
      const response =
        session.type === 'group'
          ? await messageService.getGroupHistory(session.targetId, {
              size: PAGE_SIZE,
              beforeTime,
              beforeId,
              direction: 'older',
            })
          : await messageService.getPrivateHistory(session.targetId, {
              size: PAGE_SIZE,
              beforeTime,
              beforeId,
              direction: 'older',
            });
      const remoteOlder = response.data.map(maskEncryptedMessage);
      const baseForMerge = get().messagesBySession[sid] || currentMessages;
      const merged = mergePagedMessages(baseForMerge, remoteOlder, 'prependOlder');
      messageRepository.upsertMessages(sid, merged);
      const cursor = getMessageCursor(merged);
      set((s) => ({
        messagesBySession: { ...s.messagesBySession, [sid]: merged },
        messagesPaginationBySession: {
          ...s.messagesPaginationBySession,
          [sid]: {
            ...(s.messagesPaginationBySession[sid] || createInitialPaginationState()),
            loadingOlder: false,
            hasMoreBefore: remoteOlder.length >= PAGE_SIZE,
            ...cursor,
          },
        },
      }));
    } catch (error) {
      set((s) => ({
        messagesPaginationBySession: {
          ...s.messagesPaginationBySession,
          [sid]: {
            ...(s.messagesPaginationBySession[sid] || createInitialPaginationState()),
            loadingOlder: false,
            lastError: error instanceof Error ? error.message : 'load older failed',
          },
        },
      }));
    }
  },

  async refreshLatestMessages(session) {
    const sid = session.id;
    const currentMessages = get().messagesBySession[sid] || [];
    const newest = currentMessages[currentMessages.length - 1];
    const afterTime = newest?.sendTime;
    const afterId = newest?.id || newest?.serverId || newest?.messageId;

    set((s) => ({
      messagesPaginationBySession: {
        ...s.messagesPaginationBySession,
        [sid]: { ...(s.messagesPaginationBySession[sid] || createInitialPaginationState()), refreshingLatest: true },
      },
    }));

    try {
      const response =
        session.type === 'group'
          ? await messageService.getGroupHistory(session.targetId, {
              size: PAGE_SIZE,
              afterTime,
              afterId,
              direction: 'newer',
            })
          : await messageService.getPrivateHistory(session.targetId, {
              size: PAGE_SIZE,
              afterTime,
              afterId,
              direction: 'newer',
            });
      const remoteNewer = response.data.map(maskEncryptedMessage);
      const merged = mergePagedMessages(currentMessages, remoteNewer, 'appendNewer');
      messageRepository.upsertMessages(sid, merged);
      const cursor = getMessageCursor(merged);
      set((s) => ({
        messagesBySession: { ...s.messagesBySession, [sid]: merged },
        messagesPaginationBySession: {
          ...s.messagesPaginationBySession,
          [sid]: {
            ...(s.messagesPaginationBySession[sid] || createInitialPaginationState()),
            refreshingLatest: false,
            initialized: true,
            ...cursor,
          },
        },
      }));
    } catch (error) {
      set((s) => ({
        messagesPaginationBySession: {
          ...s.messagesPaginationBySession,
          [sid]: {
            ...(s.messagesPaginationBySession[sid] || createInitialPaginationState()),
            refreshingLatest: false,
            lastError: error instanceof Error ? error.message : 'refresh failed',
          },
        },
      }));
    }
  },

  resetMessagePagination(sessionId) {
    if (sessionId) {
      set((s) => {
        const next = { ...s.messagesPaginationBySession };
        delete next[sessionId];
        return { messagesPaginationBySession: next };
      });
    } else {
      set({ messagesPaginationBySession: {} });
    }
  },

  addMessage(message, sessionId = sessionIdFor(message)) {
    const safeMessage = maskEncryptedMessage(message);
    const existing = get().messagesBySession[sessionId] || [];
    const next = applyMobileMessageToList(existing, safeMessage);
    const persistedMessage = next.find((item) => hasSameMobileMessageIdentity(item, safeMessage)) || safeMessage;
    messageRepository.upsertMessages(sessionId, [persistedMessage]);
    const pagination = get().messagesPaginationBySession[sessionId];
    if (pagination?.initialized) {
      const cursor = getMessageCursor(next);
      set((s) => ({
        messagesBySession: { ...s.messagesBySession, [sessionId]: next },
        messagesPaginationBySession: {
          ...s.messagesPaginationBySession,
          [sessionId]: { ...pagination, ...cursor },
        },
      }));
    } else {
      set({ messagesBySession: { ...get().messagesBySession, [sessionId]: next } });
    }
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
    await get().retryMessage(message.id, { force: true });
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
    await get().retryMessage(message.id, { force: true });
  },

  async retryPending() {
    const pending = pendingMessageRepository.listReadyToSend();
    for (const item of pending) {
      await get().retryMessage(item.localId, { force: false });
    }
  },

  async retryMessage(localId, options) {
    const force = options?.force ?? false;

    // 1. pending 不存在：return
    const pending = pendingMessageRepository.get(localId);
    if (!pending) {
      return;
    }

    // 2. inflight 中：return
    if (inflightPendingRetries.has(localId)) {
      return;
    }

    inflightPendingRetries.add(localId);

    try {
      const payload = JSON.parse(pending.payloadJson) as PendingSendPayload;

      // 3. E2EE blocked：pending status=blocked，本地消息 FAILED
      if (blockEncryptedPendingPayload(payload)) {
        pendingMessageRepository.update({ ...pending, status: 'blocked', lastError: 'E2EE deferred' });
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
        return;
      }

      // 4. 去重检查：同一 clientMessageId 的其他 pending 已存在则移除当前
      const duplicateByClientMessageId = payload.data.clientMessageId
        ? pendingMessageRepository.findByClientMessageId(payload.data.clientMessageId)
        : undefined;
      if (duplicateByClientMessageId && duplicateByClientMessageId.localId !== localId) {
        pendingMessageRepository.remove(localId);
        return;
      }

      // 5. 非 force 模式：尊重 nextRetryAt
      if (!force && pending.nextRetryAt != null && pending.nextRetryAt > Date.now()) {
        return;
      }

      const data = { ...payload.data };

      // ─── 阶段 1：上传（仅媒体消息） ───
      if (payload.uploadTaskId) {
        const hasRemoteMediaUrl = data.mediaUrl && (data.mediaUrl.startsWith('https://') || data.mediaUrl.startsWith('http://'));

        if (!hasRemoteMediaUrl) {
          const uploadTask = uploadTaskRepository.get(payload.uploadTaskId);

          if (!uploadTask) {
            // uploadTask 丢失且 pending 没有 remote mediaUrl → failed
            pendingMessageRepository.update({
              ...pending,
              status: 'failed',
              lastError: 'Upload task not found',
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
            return;
          }

          const maxUploadRetry = uploadTask.maxRetryCount ?? RETRY_CONFIG.maxRetryCount;

          if (uploadTask.status === 'uploaded' && uploadTask.remoteUrl) {
            // 已上传成功 → 复用 remoteUrl，跳过上传
            data.mediaUrl = uploadTask.remoteUrl;
            data.mediaName = uploadTask.fileName || data.mediaName;
            data.mediaSize = uploadTask.fileSize || data.mediaSize;
          } else if (uploadTask.status === 'uploading') {
            // 正在上传中 → 等待
            pendingMessageRepository.update({
              ...pending,
              status: 'pending',
              lastError: 'upload in progress',
            });
            return;
          } else if (!force && shouldStopRetry(uploadTask.retryCount, maxUploadRetry)) {
            // 上传重试次数耗尽
            pendingMessageRepository.update({
              ...pending,
              status: 'failed',
              lastError: `upload exhausted: ${uploadTask.lastError || 'max retries'}`,
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
            return;
          } else if (!force && uploadTask.nextRetryAt != null && uploadTask.nextRetryAt > Date.now()) {
            // 上传退避时间未到（非 force 模式）
            return;
          } else {
            // 需要上传
            try {
              const uploaded = await uploadService.uploadExistingTask(payload.uploadTaskId);
              data.mediaUrl = uploaded.url;
              data.thumbnailUrl = uploaded.thumbnailUrl || data.thumbnailUrl;
              data.mediaName = uploaded.fileName || data.mediaName;
              data.mediaSize = uploaded.size || data.mediaSize;
            } catch (uploadError) {
              // 上传失败：不继续发送，不增加 pending.retryCount
              pendingMessageRepository.update({
                ...pending,
                status: 'pending',
                lastError: `upload failed: ${uploadError instanceof Error ? uploadError.message : 'unknown'}`,
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
              return;
            }
          }
        }

        // 上传阶段完成（已上传或已有 mediaUrl）→ 更新 pending 和本地消息
        pendingMessageRepository.update({
          ...pending,
          payloadJson: JSON.stringify({ ...payload, data }),
          status: 'sending',
        });

        // 更新本地消息中的媒体 URL（file:// → remoteUrl）
        const { nextList } = updateLocalMessage(get(), pending.conversationId, localId, (item) => ({
          ...item,
          mediaUrl: data.mediaUrl,
          thumbnailUrl: data.thumbnailUrl || item.thumbnailUrl,
          mediaName: data.mediaName || item.mediaName,
          mediaSize: data.mediaSize || item.mediaSize,
          status: 'SENDING',
        }));
        set({
          messagesBySession: {
            ...get().messagesBySession,
            [pending.conversationId]: nextList,
          },
        });
      }

      // ─── 阶段 2：发送 ───
      // 只有真正准备发送时才将 pending 标记为 sending
      pendingMessageRepository.updateStatus(localId, { status: 'sending', lastError: undefined });

      try {
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
      } catch (sendError) {
        // 发送失败：增加 pending.retryCount，保留已上传的 mediaUrl
        const retryCount = pending.retryCount + 1;
        pendingMessageRepository.update({
          ...pending,
          payloadJson: JSON.stringify({ ...payload, data }),
          status: shouldStopRetry(retryCount, RETRY_CONFIG.maxRetryCount) ? 'failed' : 'pending',
          retryCount,
          lastError: `send failed: ${sendError instanceof Error ? sendError.message : 'unknown'}`,
          nextRetryAt: createNextRetryAt(retryCount, Date.now(), {
            baseDelayMs: RETRY_CONFIG.baseDelayMs,
            maxDelayMs: RETRY_CONFIG.maxDelayMs,
          }),
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
      }
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
    const nextMessages = { ...get().messagesBySession };
    delete nextMessages[sessionId];
    const nextPagination = { ...get().messagesPaginationBySession };
    delete nextPagination[sessionId];
    set({ messagesBySession: nextMessages, messagesPaginationBySession: nextPagination });
  },

  /**
   * 从本地删除单条消息（软删除语义：移除展示，不调后端）。
   * 同时清理关联的 pending 和 upload task，防止被 retryPending/retryPendingUploads 自动重新发送。
   */
  deleteLocalMessage(sessionId, messageId) {
    const list = get().messagesBySession[sessionId];
    if (!list) return;

    // 按多种身份字段匹配消息
    const message = list.find(
      (msg) =>
        msg.id === messageId ||
        msg.serverId === messageId ||
        msg.messageId === messageId ||
        msg.clientMessageId === messageId,
    );

    // 收集备选 ID 用于 pending/upload 清理（不做跨消息 UI 过滤）
    const candidateIds: string[] = [messageId];
    if (message) {
      candidateIds.push(message.id);
      if (message.serverId) candidateIds.push(message.serverId);
      if (message.messageId) candidateIds.push(message.messageId);
      if (message.clientMessageId) candidateIds.push(message.clientMessageId);
    }
    const idSet = new Set(candidateIds.filter(Boolean));

    // 1. 移除 UI 列表中的消息（仅按消息自身的 id 过滤，避免 messageId/serverId 冲突误删其他消息）
    const targetId = message?.id || messageId;
    const nextList = list.filter((msg) => msg.id !== targetId);
    set({ messagesBySession: { ...get().messagesBySession, [sessionId]: nextList } });

    // 2. 清理 messageRepository（按 idSet 中的所有 identity）
    for (const cid of idSet) {
      messageRepository.deleteMessage(sessionId, cid);
    }

    // 3. 清理 pending（按 localId + clientMessageId）
    for (const cid of idSet) {
      const pending = pendingMessageRepository.get(cid);
      if (pending) {
        // 解析 payload 获取 uploadTaskId（失败不抛异常）
        let uploadTaskId: string | undefined;
        try {
          const parsed = JSON.parse(pending.payloadJson) as Record<string, unknown>;
          uploadTaskId = typeof parsed.uploadTaskId === 'string' ? parsed.uploadTaskId : undefined;
        } catch {
          // payload 解析失败不中断删除流程
        }

        // 清理关联的 upload task
        if (uploadTaskId) {
          uploadTaskRepository.remove(uploadTaskId);
        }

        pendingMessageRepository.remove(cid);
      }

      // 清理按 localMessageId 关联的 upload task
      uploadTaskRepository.removeByLocalMessageId(cid);
    }

    // 4. 清理按 clientMessageId 关联的 pending
    if (message?.clientMessageId) {
      pendingMessageRepository.removeByClientMessageId(message.clientMessageId);
    }
  },

  /**
   * 撤回消息：调用后端 API，成功后替换本地消息为撤回版本。
   * 失败时抛出错误，由 UI 捕获。
   */
  async recallMessage(sessionId, message) {
    const serverId = message.serverId || message.messageId;
    if (!serverId) {
      throw new Error('无法撤回：缺少服务器消息 ID');
    }

    const response = await messageService.recallMessage(serverId);
    const recalled = { ...response.data, conversationId: sessionId, status: 'RECALLED' as const };

    const list = get().messagesBySession[sessionId] || [];
    const nextList = list.map((msg) =>
      msg.id === message.id ||
      msg.serverId === recalled.serverId ||
      msg.messageId === recalled.messageId
        ? recalled
        : msg,
    );
    set({ messagesBySession: { ...get().messagesBySession, [sessionId]: nextList } });
    messageRepository.upsertMessages(sessionId, [recalled]);
  },

  /**
   * 应用撤回消息到本地状态（供 WS 推送等被动场景使用）。
   */
  applyRecalledMessage(sessionId, recalledMessage) {
    const updated: MobileMessage = {
      ...recalledMessage,
      conversationId: sessionId,
      status: 'RECALLED',
    };
    const list = get().messagesBySession[sessionId] || [];
    const nextList = list.map((msg) =>
      msg.id === updated.id ||
      msg.serverId === updated.serverId ||
      msg.messageId === updated.messageId
        ? updated
        : msg,
    );
    set({ messagesBySession: { ...get().messagesBySession, [sessionId]: nextList } });
    messageRepository.upsertMessages(sessionId, [updated]);
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
