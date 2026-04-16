import {computed, ref} from "vue";
import {defineStore} from "pinia";
import {ElMessage} from "element-plus";
import {messageService} from "@/services/message";
import {messageRepo} from "@/utils/messageRepo";
import {normalizeReadReceipt, splitTextByCodePoints} from "@/utils/messageNormalize";
import {buildSessionId, safePreferExistingId, toBigIntId} from "@/normalizers/chat";
import type {ChatSession, Message, MessageConfig, MessageSearchResult, MessageType, ReadReceipt,} from "@/types";
import {useGroupStore} from "@/stores/group";
import {useSessionStore} from "@/stores/session";
import {useUserStore} from "@/stores/user";
import {STORAGE_CONFIG} from "@/config";

const DEFAULT_MESSAGE_CONFIG: MessageConfig = {
  textEnforce: true,
  textMaxLength: 2000,
};

type ConversationClearMarker = {
  clearedAtMs: number;
  lastServerMessageId?: string;
};

type MessageHistoryResponse =
  | Awaited<ReturnType<typeof messageService.getPrivateHistoryCursor>>
  | Awaited<ReturnType<typeof messageService.getGroupHistoryCursor>>
  | Awaited<ReturnType<typeof messageService.getPrivateHistory>>
  | Awaited<ReturnType<typeof messageService.getGroupHistory>>;

const messageIdentityValues = (message: Message): string[] =>
  [message.id, message.messageId, message.clientMessageId]
    .map((item) => String(item || ""))
    .filter(Boolean);

const hasSameMessageIdentity = (left: Message, right: Message): boolean => {
  const rightValues = new Set(messageIdentityValues(right));
  return messageIdentityValues(left).some((item) => rightValues.has(item));
};

const messageTimeValue = (message: Message): number => {
  const value = new Date(message.sendTime).getTime();
  return Number.isFinite(value) ? value : 0;
};

const sortMessagesAscending = (left: Message, right: Message): number => {
  const timeDiff = messageTimeValue(left) - messageTimeValue(right);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
};

const mergeMessagesChronologically = (...lists: Message[][]): Message[] => {
  const merged: Message[] = [];
  const identityIndex = new Map<string, number>();

  const indexMessage = (message: Message, index: number) => {
    messageIdentityValues(message).forEach((identity) => {
      identityIndex.set(identity, index);
    });
  };

  const upsertMessage = (message: Message) => {
    const identities = messageIdentityValues(message);
    const matchedIdentity = identities.find((identity) => identityIndex.has(identity));
    if (matchedIdentity) {
      const index = identityIndex.get(matchedIdentity);
      if (index != null) {
        const previous = merged[index];
        const nextMessage = {
          ...previous,
          ...message,
          id: safePreferExistingId(message.id, previous.id),
        };
        merged[index] = nextMessage;
        indexMessage(nextMessage, index);
        return;
      }
    }

    merged.push(message);
    indexMessage(message, merged.length - 1);
  };

  lists.forEach((list) => {
    list.forEach((message) => {
      upsertMessage(message);
    });
  });

  return merged.sort(sortMessagesAscending);
};

const readPersistedClearMarkers = (): Record<string, ConversationClearMarker> => {
  if (typeof localStorage === "undefined") {
    return {};
  }
  const raw = localStorage.getItem(STORAGE_CONFIG.CHAT_CLEAR_MARKERS_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, ConversationClearMarker>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem(STORAGE_CONFIG.CHAT_CLEAR_MARKERS_KEY);
    return {};
  }
};

export const useMessageStore = defineStore("message", () => {
  const messages = ref<Map<string, Message[]>>(new Map());
  const loading = ref(false);
  const loadingHistoryBySession = ref<Map<string, boolean>>(new Map());
  const hasMoreHistoryBySession = ref<Map<string, boolean>>(new Map());
  const oldestLoadedServerMessageIdBySession = ref<Map<string, string>>(new Map());
  const fallbackHistoryPageBySession = ref<Map<string, number>>(new Map());
  const sendQueueBySession = ref<Map<string, Promise<void>>>(new Map());
  const searchResults = ref<MessageSearchResult[]>([]);
  const messageTextConfig = ref<MessageConfig | null>(null);
  const readSessionLocks = ref<Set<string>>(new Set());
  const readSessionLastAt = ref<Map<string, number>>(new Map());
  const clearMarkers = ref<Map<string, ConversationClearMarker>>(
    new Map(Object.entries(readPersistedClearMarkers())),
  );

  const sessionStore = useSessionStore();
  const groupStore = useGroupStore();

  const getClearMarkerStorageKey = (sessionId: string): string => {
    const userStore = useUserStore();
    return `${String(userStore.userId || "anonymous")}:${sessionId}`;
  };

  const persistClearMarkers = () => {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(
      STORAGE_CONFIG.CHAT_CLEAR_MARKERS_KEY,
      JSON.stringify(Object.fromEntries(clearMarkers.value.entries())),
    );
  };

  const getClearMarker = (sessionId: string): ConversationClearMarker | undefined =>
    clearMarkers.value.get(getClearMarkerStorageKey(sessionId));

  const setClearMarker = (sessionId: string, marker?: ConversationClearMarker) => {
    const storageKey = getClearMarkerStorageKey(sessionId);
    if (marker) {
      clearMarkers.value.set(storageKey, marker);
    } else {
      clearMarkers.value.delete(storageKey);
    }
    persistClearMarkers();
  };

  const shouldHideClearedMessage = (sessionId: string, message: Message): boolean => {
    const marker = getClearMarker(sessionId);
    if (!marker) {
      return false;
    }
    const markerId = toBigIntId(marker.lastServerMessageId);
    const messageId = toBigIntId(message.id);
    if (markerId != null && messageId != null) {
      return messageId <= markerId;
    }
    const messageTime = new Date(message.sendTime).getTime();
    return Number.isFinite(messageTime) && messageTime <= marker.clearedAtMs;
  };

  const filterClearedMessages = (sessionId: string, list: Message[]): Message[] =>
    list.filter((message) => !shouldHideClearedMessage(sessionId, message));

  const currentMessages = computed(() => {
    if (!sessionStore.currentSession) {
      return [];
    }
    return messages.value.get(sessionStore.currentSession.id) || [];
  });

  const resolveSession = (sessionId: string): ChatSession | undefined =>
    sessionStore.sessions.find((item) => item.id === sessionId);

  const getServerMessages = (list: Message[]): Message[] =>
    list.filter((message) => !String(message.id).startsWith("local_"));

  const findOldestLoadedServerMessageId = (list: Message[]): string | undefined => {
    const oldestId = getServerMessages(list)
      .map((message) => toBigIntId(message.id))
      .filter((item): item is bigint => item != null)
      .reduce<bigint | null>((minId, currentId) => {
        if (minId == null || currentId < minId) {
          return currentId;
        }
        return minId;
      }, null);
    return oldestId?.toString();
  };

  const syncHistoryState = (
    sessionId: string,
    list: Message[],
    options?: {
      hasMoreHistory?: boolean;
      preserveHasMore?: boolean;
    },
  ) => {
    const oldestId = findOldestLoadedServerMessageId(list);
    if (oldestId) {
      oldestLoadedServerMessageIdBySession.value.set(sessionId, oldestId);
    } else {
      oldestLoadedServerMessageIdBySession.value.delete(sessionId);
    }

    if (typeof options?.hasMoreHistory === "boolean") {
      hasMoreHistoryBySession.value.set(sessionId, options.hasMoreHistory);
      return;
    }

    if (options?.preserveHasMore && hasMoreHistoryBySession.value.has(sessionId)) {
      return;
    }

    hasMoreHistoryBySession.value.set(sessionId, Boolean(oldestId));
  };

  const resetHistoryState = (sessionId: string) => {
    loadingHistoryBySession.value.delete(sessionId);
    hasMoreHistoryBySession.value.delete(sessionId);
    oldestLoadedServerMessageIdBySession.value.delete(sessionId);
    fallbackHistoryPageBySession.value.delete(sessionId);
  };

  const resetSessionRuntimeState = (sessionId: string) => {
    resetHistoryState(sessionId);
    readSessionLocks.value.delete(sessionId);
    readSessionLastAt.value.delete(sessionId);
    sendQueueBySession.value.delete(sessionId);
  };

  const resolveReadConversationId = (sessionId: string): string => {
    const session = resolveSession(sessionId);
    if (!session) {
      return sessionId;
    }
    if (session.type === "group") {
      return `group_${session.targetId}`;
    }
    return session.conversationId || session.targetId || sessionId;
  };

  const saveConversationMessages = async (sessionId: string, list: Message[]) => {
    const serverMessages = getServerMessages(list);
    if (serverMessages.length > 0) {
      await messageRepo.upsertServerMessages(sessionId, serverMessages);
    }
  };

  const reviveCachedMessages = async (sessionId: string): Promise<Message[]> => {
    const cached = await messageRepo.listConversation(sessionId);
    if (cached.length === 0) {
      return [];
    }
    const revived = cached.map((message) => {
      if (String(message.id).startsWith("local_") && message.status === "SENDING") {
        return {
          ...message,
          status: "FAILED" as const,
        };
      }
      return message;
    });
    if (revived.some((message) => message.status === "FAILED")) {
      ElMessage.warning("Detected unsent messages and marked them as failed.");
    }
    return revived;
  };

  const enqueueSendTask = async <T>(
    sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    const previous = sendQueueBySession.value.get(sessionId) || Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    sendQueueBySession.value.set(sessionId, tail);

    try {
      return await run;
    } finally {
      if (sendQueueBySession.value.get(sessionId) === tail) {
        sendQueueBySession.value.delete(sessionId);
      }
    }
  };

  const fetchLatestMessages = async (
    session: ChatSession,
    size: number,
    afterMessageId?: string,
  ): Promise<MessageHistoryResponse> => {
    const baseParams: Record<string, unknown> = { limit: size };
    if (afterMessageId) {
      baseParams.after_message_id = afterMessageId;
      baseParams.limit = Math.max(size, 50);
    }
    return session.type === "group"
      ? await messageService.getGroupHistoryCursor(session.targetId, baseParams)
      : await messageService.getPrivateHistoryCursor(session.targetId, baseParams);
  };

  const fetchHistoryByCursor = async (
    session: ChatSession,
    size: number,
    oldestMessageId: string,
  ): Promise<MessageHistoryResponse> => {
    const params = {
      limit: size,
      last_message_id: oldestMessageId,
    };
    return session.type === "group"
      ? await messageService.getGroupHistoryCursor(session.targetId, params)
      : await messageService.getPrivateHistoryCursor(session.targetId, params);
  };

  const fetchHistoryByPage = async (
    session: ChatSession,
    page: number,
    size: number,
  ): Promise<MessageHistoryResponse> =>
    session.type === "group"
      ? await messageService.getGroupHistory(session.targetId, { page, size })
      : await messageService.getPrivateHistory(session.targetId, { page, size });

  const loadMessages = async (sessionId: string, page = 0, size = 20) => {
    if (page > 0) {
      await loadMoreHistory(sessionId, size);
      return;
    }

    loading.value = true;
    try {
      if (!messages.value.has(sessionId)) {
        const revived = await reviveCachedMessages(sessionId);
        if (revived.length > 0) {
          messages.value.set(sessionId, revived);
          syncHistoryState(sessionId, revived, { preserveHasMore: true });
        }
      }

      const session = resolveSession(sessionId);
      if (!session) {
        return;
      }

      const existingMessages = messages.value.get(sessionId) || [];
      const maxServerId = getServerMessages(existingMessages)
        .map((message) => toBigIntId(message.id))
        .filter((item): item is bigint => item != null)
        .reduce<bigint | null>((maxId, currentId) => {
          if (maxId == null || currentId > maxId) {
            return currentId;
          }
          return maxId;
        }, null);

      let response: MessageHistoryResponse;
      try {
        response = await fetchLatestMessages(session, size, maxServerId?.toString());
      } catch {
        response = await fetchHistoryByPage(session, 0, size);
      }

      const normalizedMessages = response.data.slice().sort(sortMessagesAscending);
      const visibleMessages = filterClearedMessages(sessionId, normalizedMessages);
      const pendingMessages = existingMessages.filter((message) =>
        String(message.id).startsWith("local_"),
      );
      const serverMessages = getServerMessages(existingMessages);
      const merged = mergeMessagesChronologically(
        pendingMessages,
        serverMessages,
        visibleMessages,
      );
      const serverClientIds = new Set(
        merged
          .filter((message) => !String(message.id).startsWith("local_"))
          .map((message) => message.clientMessageId)
          .filter((item): item is string => Boolean(item)),
      );
      const nextMessages = merged.filter((message) => {
        if (!String(message.id).startsWith("local_")) {
          return true;
        }
        if (!message.clientMessageId) {
          return true;
        }
        return !serverClientIds.has(message.clientMessageId);
      });

      messages.value.set(sessionId, nextMessages);
      syncHistoryState(sessionId, nextMessages, { preserveHasMore: true });
      await saveConversationMessages(sessionId, nextMessages);
    } finally {
      loading.value = false;
    }
  };

  const loadMoreHistory = async (sessionId: string, size = 20) => {
    if (loadingHistoryBySession.value.get(sessionId)) {
      return;
    }

    if (!messages.value.has(sessionId)) {
      await loadMessages(sessionId, 0, Math.max(size, 50));
    }

    const session = resolveSession(sessionId);
    if (!session) {
      return;
    }

    const existingMessages = messages.value.get(sessionId) || [];
    const oldestMessageId =
      oldestLoadedServerMessageIdBySession.value.get(sessionId) ||
      findOldestLoadedServerMessageId(existingMessages);

    if (!oldestMessageId) {
      syncHistoryState(sessionId, existingMessages, { hasMoreHistory: false });
      return;
    }

    loadingHistoryBySession.value.set(sessionId, true);
    try {
      let response: MessageHistoryResponse;
      try {
        response = await fetchHistoryByCursor(session, size, oldestMessageId);
      } catch {
        const fallbackPage = fallbackHistoryPageBySession.value.get(sessionId) ?? 1;
        response = await fetchHistoryByPage(session, fallbackPage, size);
        fallbackHistoryPageBySession.value.set(sessionId, fallbackPage + 1);
      }

      const normalizedMessages = response.data.slice().sort(sortMessagesAscending);
      const visibleMessages = filterClearedMessages(sessionId, normalizedMessages);
      const merged = mergeMessagesChronologically(existingMessages, visibleMessages);

      messages.value.set(sessionId, merged);
      syncHistoryState(sessionId, merged, {
        hasMoreHistory: normalizedMessages.length >= size,
      });
      await saveConversationMessages(sessionId, merged);
    } finally {
      loadingHistoryBySession.value.delete(sessionId);
    }
  };

  const addMessage = async (message: Message) => {
    const userStore = useUserStore();
    let sessionId = "";

    if (message.isGroupChat && message.groupId) {
      sessionId = buildSessionId("group", String(userStore.userId || ""), message.groupId);
      const group = groupStore.groups.find((item) => item.id === message.groupId);
      if (group) {
        sessionStore.ensureGroupSession(group);
      } else {
        sessionStore.ensureSession({
          id: sessionId,
          type: "group",
          targetId: message.groupId,
          targetName: message.groupName || "Unknown Group",
          targetAvatar: message.groupAvatar,
          unreadCount: 0,
          lastActiveTime: message.sendTime,
          isPinned: false,
          isMuted: false,
        });
      }
    } else if (message.senderId && message.receiverId) {
      const currentUserId = String(userStore.userId || "");
      const targetId =
        message.senderId === currentUserId ? message.receiverId : message.senderId;
      const session = sessionStore.ensurePrivateSession(
        targetId,
        message.senderName || targetId,
        message.senderAvatar,
      );
      if (!session) {
        return;
      }
      sessionId = session.id;
    }

    if (!sessionId || shouldHideClearedMessage(sessionId, message)) {
      return;
    }

    const list = messages.value.get(sessionId) || [];
    const existingIndex = list.findIndex((item) =>
      hasSameMessageIdentity(item, message),
    );

    if (existingIndex >= 0) {
      const previous = list[existingIndex];
      list[existingIndex] = {
        ...previous,
        ...message,
        id: safePreferExistingId(message.id, previous.id),
      };
      if (
        String(previous.id).startsWith("local_") &&
        !String(message.id).startsWith("local_")
      ) {
        await messageRepo.removePendingMessage(sessionId, previous.id);
      }
    } else {
      list.push(message);
    }

    list.sort(sortMessagesAscending);
    messages.value.set(sessionId, list);
    syncHistoryState(sessionId, list, { preserveHasMore: true });

    const isSelfMessage = message.senderId === String(userStore.userId || "");
    sessionStore.applyMessageToSession(sessionId, message, {
      incrementUnread: !isSelfMessage && sessionStore.currentSession?.id !== sessionId,
    });

    if (String(message.id).startsWith("local_")) {
      await messageRepo.upsertPendingMessage(sessionId, message.id, message);
    } else {
      await messageRepo.upsertServerMessages(sessionId, [message]);
    }
  };

  const sendSingleMessage = async (
    session: ChatSession,
    content: string,
    type: MessageType,
    extra?: Record<string, unknown>,
  ) => {
    const userStore = useUserStore();
    const currentUser = userStore.currentUser;
    if (!currentUser) {
      return false;
    }

    const localId = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const clientMessageId = `cm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const isTextLike = type === "TEXT";
    const pendingMessage: Message = {
      id: localId,
      clientMessageId,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      senderAvatar: currentUser.avatar,
      receiverId: session.type === "private" ? session.targetId : undefined,
      groupId: session.type === "group" ? session.targetId : undefined,
      isGroupChat: session.type === "group",
      messageType: type,
      content: isTextLike ? content : "",
      mediaUrl: isTextLike ? undefined : content,
      sendTime: new Date().toISOString(),
      status: "SENDING",
      extra,
    };

    await addMessage(pendingMessage);
    await messageRepo.upsertPendingMessage(session.id, localId, pendingMessage);

    try {
      const response =
        session.type === "group"
          ? await messageService.sendGroup({
              groupId: session.targetId,
              clientMessageId,
              messageType: type,
              content: isTextLike ? content : undefined,
              mediaUrl: isTextLike ? undefined : content,
              extra,
            })
          : await messageService.sendPrivate({
              receiverId: session.targetId,
              clientMessageId,
              messageType: type,
              content: isTextLike ? content : undefined,
              mediaUrl: isTextLike ? undefined : content,
              extra,
            });

      const serverMessage: Message = {
        ...response.data,
        id: safePreferExistingId(response.data.id, pendingMessage.id),
        clientMessageId: response.data.clientMessageId || pendingMessage.clientMessageId,
        senderId: safePreferExistingId(response.data.senderId, pendingMessage.senderId),
        receiverId: response.data.receiverId || pendingMessage.receiverId,
        groupId: response.data.groupId || pendingMessage.groupId,
        status: "SENT",
      };
      const list = messages.value.get(session.id) || [];
      const targetIndex = list.findIndex(
        (item) =>
          item.id === localId ||
          (item.clientMessageId &&
            item.clientMessageId === serverMessage.clientMessageId),
      );
      if (targetIndex >= 0) {
        list[targetIndex] = serverMessage;
        messages.value.set(session.id, list);
        syncHistoryState(session.id, list, { preserveHasMore: true });
      }
      await messageRepo.removePendingMessage(session.id, localId);
      await messageRepo.upsertServerMessages(session.id, [serverMessage]);
      sessionStore.applyMessageToSession(session.id, serverMessage);
      return true;
    } catch {
      const list = messages.value.get(session.id) || [];
      const targetIndex = list.findIndex((item) => item.id === localId);
      if (targetIndex >= 0) {
        list[targetIndex] = {
          ...list[targetIndex],
          status: "FAILED",
        };
        messages.value.set(session.id, list);
      }
      await messageRepo.upsertPendingMessage(session.id, localId, {
        ...pendingMessage,
        status: "FAILED",
      });
      return false;
    }
  };

  const sendMessage = async (
    session: ChatSession | null,
    content: string,
    type: MessageType = "TEXT",
    extra?: Record<string, unknown>,
  ) => {
    if (!session) {
      ElMessage.error("Please select a chat first.");
      return false;
    }

    return enqueueSendTask(session.id, async () => {
      if (type === "TEXT") {
        if (!messageTextConfig.value) {
          const response = await messageService.getConfig();
          messageTextConfig.value = response.data;
        }
        const config = messageTextConfig.value || DEFAULT_MESSAGE_CONFIG;
        if (config.textEnforce && config.textMaxLength > 0) {
          const parts = splitTextByCodePoints(content, config.textMaxLength);
          if (parts.length > 1) {
            ElMessage.warning(
              `Message was split into ${parts.length} parts because it exceeded the limit.`,
            );
            for (const part of parts) {
              const success = await sendSingleMessage(session, part, type, extra);
              if (!success) {
                return false;
              }
            }
            return true;
          }
        }
      }

      return sendSingleMessage(session, content, type, extra);
    });
  };

  const markAsRead = async (sessionId: string) => {
    const now = Date.now();
    const last = readSessionLastAt.value.get(sessionId) || 0;
    if (now - last < 400 || readSessionLocks.value.has(sessionId)) {
      sessionStore.markSessionReadLocally(sessionId);
      return;
    }
    readSessionLocks.value.add(sessionId);
    try {
      await messageService.markRead(resolveReadConversationId(sessionId));
      readSessionLastAt.value.set(sessionId, now);
      sessionStore.markSessionReadLocally(sessionId);
    } finally {
      readSessionLocks.value.delete(sessionId);
    }
  };

  const resolveReadReceiptSessionId = (
    receipt: ReadReceipt,
    currentUserId: string,
  ): string => {
    if (receipt.conversationId && receipt.conversationId.startsWith("group_")) {
      return receipt.conversationId;
    }
    return buildSessionId("private", currentUserId, receipt.readerId);
  };

  const resolveReadSyncSessionId = (
    receipt: ReadReceipt,
    currentUserId: string,
  ): string | null => {
    if (receipt.conversationId && receipt.conversationId.startsWith("group_")) {
      return receipt.conversationId;
    }
    const targetId =
      receipt.toUserId && receipt.toUserId !== currentUserId
        ? receipt.toUserId
        : receipt.readerId !== currentUserId
          ? receipt.readerId
          : "";
    return targetId ? buildSessionId("private", currentUserId, targetId) : null;
  };

  const applyReadSync = async (rawReceipt: unknown) => {
    const receipt = normalizeReadReceipt(rawReceipt);
    if (!receipt) {
      return;
    }
    const userStore = useUserStore();
    const currentUserId = String(userStore.userId || "");
    if (!currentUserId || receipt.readerId !== currentUserId) {
      return;
    }

    const sessionId = resolveReadSyncSessionId(receipt, currentUserId);
    if (!sessionId) {
      return;
    }
    sessionStore.markSessionReadLocally(sessionId);

    const list = messages.value.get(sessionId) || [];
    if (list.length === 0) {
      return;
    }
    const lastReadMessageId = receipt.lastReadMessageId
      ? toBigIntId(receipt.lastReadMessageId)
      : null;
    if (lastReadMessageId == null) {
      return;
    }

    const readAtMilliseconds = receipt.readAt
      ? new Date(receipt.readAt).getTime()
      : Number.NaN;
    let changed = false;
    const updated = list.map((message) => {
      if (message.senderId === currentUserId) {
        return message;
      }
      const messageId = toBigIntId(message.id);
      if (messageId == null || messageId > lastReadMessageId) {
        return message;
      }
      const messageMilliseconds = new Date(message.sendTime).getTime();
      if (
        Number.isFinite(readAtMilliseconds) &&
        Number.isFinite(messageMilliseconds) &&
        messageMilliseconds > readAtMilliseconds
      ) {
        return message;
      }

      changed = true;
      return {
        ...message,
        status: "READ" as const,
        readStatus: 1,
        readAt: receipt.readAt || message.readAt,
      };
    });

    if (!changed) {
      return;
    }
    messages.value.set(sessionId, updated);
    await saveConversationMessages(sessionId, updated);
  };

  const applyReadReceipt = async (rawReceipt: unknown) => {
    const receipt = normalizeReadReceipt(rawReceipt);
    if (!receipt) {
      return;
    }
    const userStore = useUserStore();
    const currentUserId = String(userStore.userId || "");
    if (!currentUserId) {
      return;
    }
    if (receipt.readerId === currentUserId) {
      await applyReadSync(receipt);
      return;
    }

    const sessionId = resolveReadReceiptSessionId(receipt, currentUserId);
    const list = messages.value.get(sessionId) || [];
    const lastReadMessageId = receipt.lastReadMessageId
      ? toBigIntId(receipt.lastReadMessageId)
      : null;
    const readAtMilliseconds = receipt.readAt
      ? new Date(receipt.readAt).getTime()
      : Number.NaN;
    let changed = false;

    const updated = list.map((message) => {
      if (message.senderId !== currentUserId) {
        return message;
      }
      if (lastReadMessageId != null) {
        const messageId = toBigIntId(message.id);
        if (messageId == null || messageId > lastReadMessageId) {
          return message;
        }
      }
      const messageMilliseconds = new Date(message.sendTime).getTime();
      if (
        Number.isFinite(readAtMilliseconds) &&
        Number.isFinite(messageMilliseconds) &&
        messageMilliseconds > readAtMilliseconds
      ) {
        return message;
      }

      changed = true;
      if (sessionId.startsWith("group_")) {
        const readers = message.readBy || [];
        if (readers.includes(receipt.readerId)) {
          return message;
        }
        return {
          ...message,
          readBy: [...readers, receipt.readerId],
          readByCount: readers.length + 1,
          readStatus: 1,
        };
      }
      return {
        ...message,
        status: "READ" as const,
        readStatus: 1,
        readAt: receipt.readAt || message.readAt,
      };
    });

    if (!changed) {
      return;
    }
    messages.value.set(sessionId, updated);
    await saveConversationMessages(sessionId, updated);
  };

  const deleteMessage = async (messageId: string) => {
    messages.value.forEach((messageList, sessionId) => {
      const next = messageList.filter((message) => message.id !== messageId);
      if (next.length !== messageList.length) {
        messages.value.set(sessionId, next);
        syncHistoryState(sessionId, next, { preserveHasMore: true });
      }
    });
  };

  const clearMessages = async (sessionId: string) => {
    const list = messages.value.get(sessionId) || [];
    const latestServerMessageId = list
      .map((message) => toBigIntId(message.id))
      .filter((item): item is bigint => item != null)
      .reduce<bigint | null>((maxId, currentId) => {
        if (maxId == null || currentId > maxId) {
          return currentId;
        }
        return maxId;
      }, null);
    const latestMessageTimestamp = list
      .map((message) => new Date(message.sendTime).getTime())
      .filter((item) => Number.isFinite(item))
      .reduce((maxTime, currentTime) => Math.max(maxTime, currentTime), 0);

    setClearMarker(sessionId, {
      clearedAtMs: latestMessageTimestamp > 0 ? latestMessageTimestamp : Date.now(),
      lastServerMessageId: latestServerMessageId?.toString(),
    });
    messages.value.set(sessionId, []);
    resetHistoryState(sessionId);
    sessionStore.clearSessionConversationState(sessionId);
    await messageRepo.clearConversation(sessionId);
  };

  const searchMessages = async (keyword: string, sessionId?: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      searchResults.value = [];
      return;
    }

    const sessionIds = sessionId ? [sessionId] : Array.from(messages.value.keys());
    const results: MessageSearchResult[] = [];
    for (const id of sessionIds) {
      const list = messages.value.get(id) || [];
      for (let index = 0; index < list.length; index += 1) {
        const message = list[index];
        if (!message.content.toLowerCase().includes(normalizedKeyword)) {
          continue;
        }
        results.push({
          message,
          highlight: keyword,
          context: list.slice(Math.max(0, index - 1), Math.min(list.length, index + 2)),
        });
      }
    }
    searchResults.value = results;
  };

  const clear = () => {
    messages.value.clear();
    loading.value = false;
    loadingHistoryBySession.value.clear();
    hasMoreHistoryBySession.value.clear();
    oldestLoadedServerMessageIdBySession.value.clear();
    fallbackHistoryPageBySession.value.clear();
    sendQueueBySession.value.clear();
    searchResults.value = [];
    messageTextConfig.value = null;
    readSessionLocks.value.clear();
    readSessionLastAt.value.clear();
  };

  return {
    messages,
    loading,
    loadingHistoryBySession,
    hasMoreHistoryBySession,
    oldestLoadedServerMessageIdBySession,
    sendQueueBySession,
    searchResults,
    currentMessages,
    loadMessages,
    loadMoreHistory,
    addMessage,
    sendMessage,
    markAsRead,
    applyReadSync,
    applyReadReceipt,
    deleteMessage,
    clearMessages,
    searchMessages,
    resetSessionRuntimeState,
    clear,
  };
});
