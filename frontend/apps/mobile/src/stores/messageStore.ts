import { create } from 'zustand';
import { applyMessageToSession, applyReadReceiptToMessages, buildSessionId, createNextRetryAt, shouldStopRetry } from '@im/shared-im-core';
import { normalizeReadReceipt } from '@im/shared-normalizers';
import { applyMobileMessageToList, hasSameMobileMessageIdentity, resolveMessageSessionId } from '@/utils/normalizers';
import { E2EE_DECRYPT_RETRY_CONFIG, RETRY_CONFIG } from '@/constants/config';
import {
  E2EE_ENCRYPTED_MEDIA_UNSUPPORTED_TEXT,
  E2EE_PRIVATE_MEDIA_UNSUPPORTED_TEXT,
  E2EE_SEND_DISABLED_TEXT,
  blockEncryptedPendingPayload,
  getSessionE2eeStatus,
  maskEncryptedMessage,
} from '@/e2ee/e2eeDeferred';
import { compareE2eeDecryptOrder, processE2eeMessage, processE2eeMessages, shouldDrainPendingAfterDecrypt, type ProcessedE2eeMessage } from '@/e2ee/messageProcessor';
import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { ensureLocalE2eeDeviceRegistered } from '@/e2ee/manager/localDevice';
import { initiateNegotiation, loadLocalSessionStatus } from '@/e2ee/manager/negotiation';
import {
  cleanupPendingE2eePlaintext,
  enqueuePendingE2eeText,
  encryptPendingE2eePayload,
  findPendingE2eeSends,
  isE2eePendingPayload,
  type PendingSendPayload,
} from '@/e2ee/outbound/pendingE2eeSend';
import { subscribeE2eeStatusChanges } from '@/e2ee/statusEvents';
import {
  cachePendingEncryptedMessage,
  clearPendingEncryptedMessages as clearPendingDecryptCache,
  configurePendingDecryptQueue,
  retryDecryptPendingMessages as retryDecryptPendingFromStore,
  type PendingEncryptedMessageEntry,
} from '@/e2ee/store/pendingDecryptStore';
import { messageService, resolveMarkReadTarget, type SendMessagePayload } from '@/services/chat/messageService';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadService } from '@/services/upload/uploadService';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { logger } from '@/utils/logger';
import { createClientMessageId, createLocalMessageId } from '@/utils/ids';
import { createInitialPaginationState, getMessageCursor, mergePagedMessages } from '@/utils/messagePagination';
import { isEncryptedValue, sanitizeE2eeLogValue } from '@im/shared-e2ee-core';
import { useAuthStore } from './authStore';
import { useSessionStore } from './sessionStore';
import type { ChatSession, MessageType } from '@im/shared-types';
import type { MobileMessage, PendingMessage, MessagePaginationState } from '@/types/models';
import type { MobileFile } from '@/services/file/fileService';

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
  retryDecryptPendingMessages: (sessionId: string, entries: PendingEncryptedMessageEntry[]) => Promise<PendingEncryptedMessageEntry[]>;
  retryDecryptVisibleEncryptedMessages: (sessionId: string) => Promise<number>;
  clearPendingEncryptedMessages: (sessionId: string) => void;
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

const findOptimisticMessage = (state: MessageState, sessionId: string, clientMessageId: string): MobileMessage | undefined =>
  (state.messagesBySession[sessionId] || []).find((item) => item.clientMessageId === clientMessageId);

const processMessagesForSession = async (
  state: MessageState,
  sessionId: string,
  messages: MobileMessage[],
): Promise<MobileMessage[]> => {
  const currentUserId = useAuthStore.getState().currentUser?.id || '';
  if (!currentUserId) {
    return messages.map(maskEncryptedMessage);
  }
  const processed = await processE2eeMessages(messages, {
    sessionId,
    currentUserId,
    findOptimisticMessage: (clientMessageId) => findOptimisticMessage(state, sessionId, clientMessageId),
  });
  processed.forEach((item) => {
    if (item.decryptStatus === 'pending') {
      cachePendingEncryptedMessage(sessionId, item.rawMessage);
    }
  });
  if (processed.some((item) => shouldDrainPendingAfterDecrypt(item))) {
    triggerPendingDrain(sessionId);
  }
  return processed.map((item) => item.displayMessage);
};

const processMessageForSession = async (
  state: MessageState,
  sessionId: string,
  message: MobileMessage,
): Promise<MobileMessage> => {
  const currentUserId = useAuthStore.getState().currentUser?.id || '';
  if (!currentUserId) {
    return maskEncryptedMessage(message);
  }
  const processed = await processE2eeMessage(message, {
    sessionId,
    currentUserId,
    findOptimisticMessage: (clientMessageId) => findOptimisticMessage(state, sessionId, clientMessageId),
  });
  if (processed.decryptStatus === 'pending') {
    cachePendingEncryptedMessage(sessionId, processed.rawMessage);
  }
  if (shouldDrainPendingAfterDecrypt(processed)) {
    triggerPendingDrain(sessionId);
  }
  return processed.displayMessage;
};

const markDecryptFailed = (sessionId: string, message: MobileMessage, processed: ProcessedE2eeMessage) => {
  const failed: MobileMessage = {
    ...processed.rawMessage,
    content: processed.displayMessage.content,
    decryptStatus: 'failed',
    isE2eeDisplayDecrypted: false,
    rawJson: processed.rawMessage.rawJson || processed.displayMessage.rawJson || JSON.stringify(processed.rawMessage),
  };
  messageRepository.upsertMessages(sessionId, [failed]);
};

const triggerPendingDrain = (sessionId: string) => {
  if (!sessionId) return;
  retryDecryptPendingFromStore(sessionId).catch((error) => {
    logger.warn('e2ee', 'pending decrypt drain failed', sanitizeE2eeLogValue({ sessionId, error }));
  });
};

const resolveEffectiveE2eeStatus = async (session: ChatSession) => {
  if (session.type !== 'private') {
    return getSessionE2eeStatus(session);
  }
  const loaded = await loadLocalSessionStatus(session.id).catch(() => getSessionE2eeStatus(session));
  if (loaded !== 'plaintext') {
    return loaded;
  }
  return getSessionE2eeStatus(session);
};

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
    payloadJson: JSON.stringify({ sendType: session.type, data: payload, encrypted: payload.encrypted, uploadTaskId }),
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  pendingMessageRepository.enqueue(pending);
};

/**
 * Resume a single E2EE-waiting pending send.
 *
 * 1. Calls `encryptPendingE2eePayload` to encrypt the plaintext and
 *    replace the pending payload with an encrypted envelope.
 * 2. On success: updates the local optimistic message, then calls
 *    `retryMessage` with force=true to send through the standard pipeline.
 * 3. On retryable failure: the pending already has nextRetryAt set by
 *    encryptPendingE2eePayload; returns false, caller should skip.
 * 4. On exhausted failure: encryptPendingE2eePayload already marked the
 *    pending as failed. This helper marks the local optimistic message
 *    FAILED as well.
 *
 * Returns true if the message was resumed and sent (or queued for send).
 */
const resumeOnePendingE2eeSend = async (item: PendingMessage): Promise<boolean> => {
  const result = await encryptPendingE2eePayload(item);
  if (!result.ok) {
    // Check whether this was exhausted (pending status now 'failed')
    const updated = pendingMessageRepository.get(item.localId);
    if (updated?.status === 'failed') {
      // Mark the local optimistic message FAILED so the UI reflects exhaustion
      const store = useMessageStore.getState();
      const messages = store.messagesBySession[item.conversationId] || [];
      const idx = messages.findIndex((msg) => msg.id === item.localId);
      if (idx >= 0) {
        const nextList = [...messages];
        nextList[idx] = { ...nextList[idx], status: 'FAILED' };
        useMessageStore.setState({
          messagesBySession: {
            ...store.messagesBySession,
            [item.conversationId]: nextList,
          },
        });
        messageRepository.upsertMessages(item.conversationId, [nextList[idx]]);
      }
    }
    return false;
  }

  // Update local optimistic message so the UI reflects the
  // encrypted state before retryMessage overwrites it with the
  // server response.
  const store = useMessageStore.getState();
  const messages = store.messagesBySession[item.conversationId] || [];
  const idx = messages.findIndex((msg) => msg.id === item.localId);
  if (idx >= 0 && result.envelope) {
    const existing = messages[idx];
    const updated: MobileMessage = {
      ...existing,
      encrypted: true,
      e2eeEnvelope: result.envelope,
      e2eeDeviceId: result.envelope.senderDeviceId,
      rawJson: JSON.stringify({
        ...existing,
        content: '',
        encrypted: true,
        e2eeEnvelope: result.envelope,
        e2eeDeviceId: result.envelope.senderDeviceId,
      }),
      isE2eeDisplayDecrypted: true,
      decryptStatus: 'own-echo-preserved',
    };
    const nextList = [...messages];
    nextList[idx] = updated;
    useMessageStore.setState({
      messagesBySession: {
        ...store.messagesBySession,
        [item.conversationId]: nextList,
      },
    });
    messageRepository.upsertMessages(item.conversationId, [updated]);
  }

  await useMessageStore.getState().retryMessage(item.localId, { force: true });
  return true;
};

/**
 * Resume all E2EE-waiting pending sends for a session.
 *
 * Called when the session E2EE status transitions to `encrypted`.
 *
 * This is a module-private function; it is NOT exported so it does not
 * create import cycles. Callers trigger it indirectly via
 * `setLocalSessionStatus('encrypted')` which emits an E2EE status
 * change event.
 */
const resumeOutboundE2eeSends = async (sessionId: string): Promise<number> => {
  const items = findPendingE2eeSends(sessionId);
  if (items.length === 0) {
    return 0;
  }

  let resumed = 0;
  for (const item of items) {
    const ok = await resumeOnePendingE2eeSend(item);
    if (ok) {
      resumed++;
    }
  }

  return resumed;
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
      localMessages = await processMessagesForSession(get(), sid, localPage.messages);
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
      const remoteMessages = await processMessagesForSession(get(), sid, response.data);
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
      localOlder = await processMessagesForSession(get(), sid, localPage.messages);
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
      const remoteOlder = await processMessagesForSession(get(), sid, response.data);
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
      const remoteNewer = await processMessagesForSession(get(), sid, response.data);
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
    const safeMessage = isEncryptedValue(message.encrypted)
      ? maskEncryptedMessage({ ...message, rawJson: message.rawJson || JSON.stringify(message) })
      : message;
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
    const e2eeStatus = await resolveEffectiveE2eeStatus(session);

    // Rule D: failed status blocks sending entirely.
    if (session.type === 'private' && e2eeStatus === 'failed') {
      throw new Error(E2EE_SEND_DISABLED_TEXT);
    }
    if (session.type === 'group' && e2eeStatus !== 'plaintext') {
      throw new Error(E2EE_SEND_DISABLED_TEXT);
    }

    // Rule A + B: plaintext or negotiating private session → hold message
    // until E2EE negotiation completes. Do NOT send plaintext.
    //
    // SECURITY: The optimistic message carries the real content in
    // memory for UI display, but decryptStatus='plaintext' signals
    // sanitizeE2eeMessageForPersist to replace the content with a
    // placeholder before persisting to SQLite.
    if (session.type === 'private' && (e2eeStatus === 'plaintext' || e2eeStatus === 'negotiating')) {
      const message = optimisticMessage(session, 'TEXT', {
        content,
        rawJson: JSON.stringify({ content: '' }),
        decryptStatus: 'plaintext',
      });

      // Ensure local E2EE device is provisioned before we try to save
      // pending plaintext to secure storage. For first-time E2EE users,
      // this creates the deviceId + key material that enqueuePendingE2eeText
      // requires.
      try {
        await ensureLocalE2eeDeviceRegistered();
      } catch (error) {
        logger.warn('e2ee', 'E2EE device registration failed before pending send', sanitizeE2eeLogValue(error));
        throw new Error('E2EE device registration failed, cannot send message');
      }

      // Save plaintext to secure storage + enqueue pending BEFORE addMessage.
      // If either step fails, the message must not land in UI or SQLite.
      try {
        await enqueuePendingE2eeText(session, message, content, 'negotiation');
      } catch (error) {
        // Best-effort cleanup of pending plaintext that may have been saved
        // before the enqueue step failed.
        cleanupPendingE2eePlaintext(message.id).catch(() => {});
        throw error;
      }

      // Only after secure storage write + pending enqueue both succeed:
      // add the optimistic message to UI state and persist to SQLite.
      get().addMessage(message, session.id);

      if (e2eeStatus === 'plaintext') {
        const initiated = await initiateNegotiation(session.id, session.targetId).catch(() => false);
        if (!initiated) {
          const { nextList } = updateLocalMessage(get(), session.id, message.id, (item) => ({
            ...item,
            status: 'FAILED',
          }));
          set({ messagesBySession: { ...get().messagesBySession, [session.id]: nextList } });
        }
      }
      return;
    }

    // Rule C: encrypted private session — encrypt and send.
    const message = optimisticMessage(session, 'TEXT', {
      content,
      encrypted: session.type === 'private' && e2eeStatus === 'encrypted',
    });
    if (message.encrypted) {
      message.rawJson = JSON.stringify({ ...message, content: '', encrypted: true });
      message.isE2eeDisplayDecrypted = true;
      message.decryptStatus = 'own-echo-preserved';
    }
    get().addMessage(message, session.id);
    let payload = payloadFor(session, message);
    if (session.type === 'private' && e2eeStatus === 'encrypted') {
      try {
        const e2eeEnvelope = await e2eeManager.encryptToEnvelope({
          sessionId: session.id,
          plaintext: content,
          recipientUserId: session.targetId,
        });
        const { nextList } = updateLocalMessage(get(), session.id, message.id, (item) => ({
          ...item,
          encrypted: true,
          e2eeEnvelope,
          e2eeDeviceId: e2eeEnvelope.senderDeviceId,
          rawJson: JSON.stringify({
            ...item,
            content: '',
            encrypted: true,
            e2eeEnvelope,
            e2eeDeviceId: e2eeEnvelope.senderDeviceId,
          }),
        }));
        set({ messagesBySession: { ...get().messagesBySession, [session.id]: nextList } });
        payload = {
          receiverId: session.targetId,
          clientMessageId: message.clientMessageId || createClientMessageId(),
          messageType: 'TEXT',
          encrypted: true,
          e2eeEnvelope,
          e2eeDeviceId: e2eeEnvelope.senderDeviceId,
        };
      } catch (error) {
        const { nextList } = updateLocalMessage(get(), session.id, message.id, (item) => ({
          ...item,
          status: 'FAILED',
        }));
        set({ messagesBySession: { ...get().messagesBySession, [session.id]: nextList } });
        logger.warn('e2ee', 'encrypted send preparation failed', sanitizeE2eeLogValue(error));
        throw error;
      }
    }
    enqueuePending(session, message, payload);
    await get().retryMessage(message.id, { force: true });
  },

  async sendMedia(session, file, type) {
    // Mobile private media is NOT supported under E2EE policy.
    // Regardless of session E2EE status (plaintext/negotiating/encrypted/failed),
    // private media must not be sent as plaintext downgrade.
    if (session.type === 'private') {
      throw new Error(E2EE_PRIVATE_MEDIA_UNSUPPORTED_TEXT);
    }

    const e2eeStatus = await resolveEffectiveE2eeStatus(session);
    if (session.type === 'group' && e2eeStatus !== 'plaintext') {
      throw new Error(E2EE_SEND_DISABLED_TEXT);
    }
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
      // Parse payload to check if this is an E2EE-waiting pending
      let isE2eePending = false;
      try {
        const payload = JSON.parse(item.payloadJson) as Record<string, unknown>;
        isE2eePending = payload.requiresE2ee === true;
      } catch {
        // If we can't parse, let retryMessage handle it normally
      }

      if (isE2eePending) {
        // E2EE-waiting pending: only resume if the session is encrypted
        const e2eeStatus = await loadLocalSessionStatus(item.conversationId).catch(() => 'plaintext' as const);
        if (e2eeStatus === 'encrypted') {
          // Try to encrypt and send. If it fails (retryable), nextRetryAt was
          // already set by encryptPendingE2eePayload so listReadyToSend will
          // exclude it until the backoff expires. If exhausted, the pending
          // was marked failed and the local optimistic message FAILED.
          await resumeOnePendingE2eeSend(item);
        }
        // If status is not encrypted (still negotiating/plaintext/failed),
        // skip — do NOT send plaintext.
        continue;
      }

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

      // 跳过等待 E2EE negotiation 的 pending：消息保留在 pending 中，
      // 等待 handleNegotiationAccepted 触发 resumePendingE2eeSends 后恢复发送。
      if (isE2eePendingPayload(payload)) {
        return;
      }

      // 3. E2EE blocked：pending status=blocked，本地消息 FAILED
      if (blockEncryptedPendingPayload(payload)) {
        pendingMessageRepository.update({ ...pending, status: 'blocked', lastError: 'Encrypted payload incomplete' });
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
        const encryptedPayload = isEncryptedValue(payload.encrypted) || isEncryptedValue(data.encrypted);
        if (encryptedPayload && payload.sendType !== 'private') {
          throw new Error('Encrypted group sending is not supported on mobile');
        }
        const response = payload.sendType === 'group'
          ? await messageService.sendGroup(data)
          : encryptedPayload
            ? await messageService.sendPrivateEncrypted(data)
            : await messageService.sendPrivate(data);
        const serverMessage: MobileMessage = {
          ...response.data,
          messageId: response.data.id || response.data.messageId,
          clientMessageId: response.data.clientMessageId || data.clientMessageId,
          conversationId: pending.conversationId,
          status: 'SENT',
        };
        const displayMessage = await processMessageForSession(get(), pending.conversationId, serverMessage);
        get().addMessage(displayMessage, pending.conversationId);
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

  async retryDecryptPendingMessages(sessionId, entries) {
    const currentUserId = useAuthStore.getState().currentUser?.id || '';
    if (!currentUserId || entries.length === 0) {
      return [];
    }

    const remaining: PendingEncryptedMessageEntry[] = [];
    const sorted = [...entries].sort((a, b) => compareE2eeDecryptOrder(a.message, b.message));

    for (const entry of sorted) {
      const processed = await processE2eeMessage(entry.message, {
        sessionId,
        currentUserId,
        findOptimisticMessage: (clientMessageId) => findOptimisticMessage(get(), sessionId, clientMessageId),
      });

      if (processed.decryptStatus === 'decrypted' || processed.decryptStatus === 'own-echo-preserved') {
        get().addMessage(processed.displayMessage, sessionId);
        messageRepository.upsertMessages(sessionId, [processed.displayMessage]);
        continue;
      }

      if (processed.decryptStatus === 'pending') {
        const classification = processed.errorClassification;
        const retryable = classification?.retryable ?? false;
        if (!retryable) {
          markDecryptFailed(sessionId, entry.message, processed);
          continue;
        }

        const newRetryCount = entry.retryCount + 1;
        if (shouldStopRetry(newRetryCount, E2EE_DECRYPT_RETRY_CONFIG.maxRetryCount)) {
          markDecryptFailed(sessionId, entry.message, processed);
          continue;
        }

        remaining.push({
          ...entry,
          retryCount: newRetryCount,
          nextRetryAt: createNextRetryAt(newRetryCount, Date.now(), {
            baseDelayMs: E2EE_DECRYPT_RETRY_CONFIG.baseDelayMs,
            maxDelayMs: E2EE_DECRYPT_RETRY_CONFIG.maxDelayMs,
          }),
          lastError: classification?.safeMessage ?? 'Unknown E2EE error',
          lastTriedAt: Date.now(),
        });
        continue;
      }

      // failed or other non-success status
      markDecryptFailed(sessionId, entry.message, processed);
    }

    return remaining;
  },

  async retryDecryptVisibleEncryptedMessages(sessionId) {
    const currentUserId = useAuthStore.getState().currentUser?.id || '';
    if (!currentUserId) {
      return 0;
    }
    const visible = (get().messagesBySession[sessionId] || []).filter((message) =>
      isEncryptedValue(message.encrypted) &&
      !message.isE2eeDisplayDecrypted &&
      message.decryptStatus !== 'decrypted' &&
      message.decryptStatus !== 'own-echo-preserved',
    );
    if (visible.length === 0) {
      return 0;
    }
    const processed = await processE2eeMessages(visible, {
      sessionId,
      currentUserId,
      findOptimisticMessage: (clientMessageId) => findOptimisticMessage(get(), sessionId, clientMessageId),
    });
    let decryptedCount = 0;
    processed.forEach((item) => {
      if (item.decryptStatus === 'pending') {
        cachePendingEncryptedMessage(sessionId, item.rawMessage);
        return;
      }
      if (item.decryptStatus === 'decrypted' || item.decryptStatus === 'own-echo-preserved') {
        decryptedCount += 1;
        get().addMessage(item.displayMessage, sessionId);
        messageRepository.upsertMessages(sessionId, [item.displayMessage]);
      }
    });
    return decryptedCount;
  },

  clearPendingEncryptedMessages(sessionId) {
    clearPendingDecryptCache(sessionId);
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

    messageRepository.upsertMessages(sessionId, changed as MobileMessage[]);
    set({ messagesBySession: { ...get().messagesBySession, [sessionId]: updated as MobileMessage[] } });
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

        // 清理安全存储中的 pending E2EE plaintext
        cleanupPendingE2eePlaintext(cid).catch(() => {});

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
    // Best-effort cleanup of pending E2EE plaintext in secure storage
    const allPending = pendingMessageRepository.listAll();
    for (const item of allPending) {
      try {
        const payload = JSON.parse(item.payloadJson) as Record<string, unknown>;
        if (payload.requiresE2ee === true && item.localId) {
          cleanupPendingE2eePlaintext(item.localId).catch(() => {});
        }
      } catch {
        // parse failure is non-fatal
      }
    }
    pendingMessageRepository.clear();
    inflightPendingRetries.clear();
    set({ messagesBySession: {}, messagesPaginationBySession: {}, searchResults: [] });
  },
}));

configurePendingDecryptQueue({
  retryPendingMessages: (sessionId, entries) =>
    useMessageStore.getState().retryDecryptPendingMessages(sessionId, entries),
  retryVisibleMessages: (sessionId) =>
    useMessageStore.getState().retryDecryptVisibleEncryptedMessages(sessionId),
});

// When E2EE negotiation is accepted and the session status transitions to
// `encrypted`, resume any outbound pending sends that were held waiting
// for the negotiation to complete.
subscribeE2eeStatusChanges((sessionId, status) => {
  if (status === 'encrypted') {
    resumeOutboundE2eeSends(sessionId).catch(() => 0);
  }
});
