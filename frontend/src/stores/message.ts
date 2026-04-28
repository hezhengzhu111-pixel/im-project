import {computed, ref} from "vue";
import {defineStore} from "pinia";
import {ElMessage} from "element-plus";
import {messageService} from "@/services/message";
import {messageRepo} from "@/utils/messageRepo";
import {buildSessionId, toBigIntId} from "@/normalizers/chat";
import type {Message, MessageConfig, MessageSearchResult} from "@/types";
import {useGroupStore} from "@/stores/group";
import {useSessionStore} from "@/stores/session";
import {useUserStore} from "@/stores/user";
import {STORAGE_CONFIG} from "@/config";
import {
    ConversationClearMarker,
    getServerMessages,
    hasSameMessageIdentity,
    limitMessageWindow,
    sortMessagesAscending,
} from "@/stores/modules/message-helpers";
import {createMessageLoadingModule} from "@/stores/modules/message-loading";
import {createMessageSendQueueModule} from "@/stores/modules/message-send-queue";
import {createMessageReadModule} from "@/stores/modules/message-read";
import {createMessageSearchModule} from "@/stores/modules/message-search";

type PersistHandle =
  | { kind: "idle"; id: number }
  | { kind: "microtask"; cancel: () => void };

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

let persistenceListenersBound = false;

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

  const pendingServerPersistBySession = new Map<string, Map<string, Message>>();
  const pendingPersistHandleBySession = new Map<string, PersistHandle>();
  const flushPromiseBySession = new Map<string, Promise<void>>();

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

  const cancelPersistHandle = (sessionId: string) => {
    const handle = pendingPersistHandleBySession.get(sessionId);
    if (!handle) {
      return;
    }
    if (handle.kind === "idle" && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(handle.id);
    }
    if (handle.kind === "microtask") {
      handle.cancel();
    }
    pendingPersistHandleBySession.delete(sessionId);
  };

  const flushSessionServerPersist = async (sessionId: string): Promise<void> => {
    cancelPersistHandle(sessionId);

    if (flushPromiseBySession.has(sessionId)) {
      return flushPromiseBySession.get(sessionId)!;
    }

    const batch = pendingServerPersistBySession.get(sessionId);
    if (!batch || batch.size === 0) {
      return;
    }

    pendingServerPersistBySession.delete(sessionId);
    const flushPromise = messageRepo
      .upsertServerMessages(sessionId, Array.from(batch.values()))
      .catch((error) => {
        const nextBatch = pendingServerPersistBySession.get(sessionId) || new Map<string, Message>();
        batch.forEach((message, key) => {
          nextBatch.set(key, message);
        });
        pendingServerPersistBySession.set(sessionId, nextBatch);
        throw error;
      })
      .finally(() => {
        flushPromiseBySession.delete(sessionId);
      });

    flushPromiseBySession.set(sessionId, flushPromise);
    return flushPromise;
  };

  const schedulePersistFlush = (sessionId: string) => {
    if (pendingPersistHandleBySession.has(sessionId) || flushPromiseBySession.has(sessionId)) {
      return;
    }

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(
        () => {
          pendingPersistHandleBySession.delete(sessionId);
          void flushSessionServerPersist(sessionId);
        },
        { timeout: 120 },
      );
      pendingPersistHandleBySession.set(sessionId, {kind: "idle", id});
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      pendingPersistHandleBySession.delete(sessionId);
      void flushSessionServerPersist(sessionId);
    });
    pendingPersistHandleBySession.set(sessionId, {
      kind: "microtask",
      cancel: () => {
        cancelled = true;
      },
    });
  };

  const scheduleServerMessagePersist = async (
    sessionId: string,
    nextMessages: Message[],
    options?: { immediate?: boolean },
  ) => {
    const serverMessages = getServerMessages(nextMessages);
    if (serverMessages.length === 0) {
      return;
    }

    const batch = pendingServerPersistBySession.get(sessionId) || new Map<string, Message>();
    serverMessages.forEach((message) => {
      const key = String(message.id || message.clientMessageId || "");
      if (key) {
        batch.set(key, message);
      }
    });
    pendingServerPersistBySession.set(sessionId, batch);

    if (options?.immediate) {
      await flushSessionServerPersist(sessionId);
      return;
    }

    schedulePersistFlush(sessionId);
  };

  const flushAllPendingPersist = async () => {
    const sessionIds = Array.from(
      new Set([
        ...pendingServerPersistBySession.keys(),
        ...flushPromiseBySession.keys(),
      ]),
    );
    if (sessionIds.length === 0) {
      return;
    }
    await Promise.allSettled(sessionIds.map((sessionId) => flushSessionServerPersist(sessionId)));
  };

  if (!persistenceListenersBound && typeof window !== "undefined") {
    persistenceListenersBound = true;
    const flushNow = () => {
      void flushAllPendingPersist();
    };
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        flushNow();
      }
    });
  }

  const loadingModule = createMessageLoadingModule({
    messages,
    loading,
    loadingHistoryBySession,
    hasMoreHistoryBySession,
    oldestLoadedServerMessageIdBySession,
    fallbackHistoryPageBySession,
    messageService,
    messageRepo,
    sessionStore,
    filterClearedMessages,
    scheduleServerMessagePersist,
    notifyWarning: (message) => {
      ElMessage.warning(message);
    },
  });

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

    const existing = messages.value.get(sessionId) || [];
    const next = existing.slice();
    const existingIndex = next.findIndex((item) => hasSameMessageIdentity(item, message));
    let replacedPendingId = "";

    if (existingIndex >= 0) {
      const previous = next[existingIndex];
      next[existingIndex] = {
        ...previous,
        ...message,
        id: message.id || previous.id,
      };
      if (
        String(previous.id).startsWith("local_") &&
        !String(message.id).startsWith("local_")
      ) {
        replacedPendingId = previous.id;
      }
    } else {
      next.push(message);
    }

    const windowedMessages = limitMessageWindow(next.sort(sortMessagesAscending), "latest");
    messages.value.set(sessionId, windowedMessages);
    loadingModule.syncHistoryState(sessionId, windowedMessages, {preserveHasMore: true});

    const isSelfMessage = message.senderId === String(userStore.userId || "");
    sessionStore.applyMessageToSession(sessionId, message, {
      incrementUnread: !isSelfMessage && sessionStore.currentSession?.id !== sessionId,
    });

    if (String(message.id).startsWith("local_")) {
      await messageRepo.upsertPendingMessage(sessionId, message.id, message);
      return;
    }

    if (replacedPendingId) {
      await messageRepo.removePendingMessage(sessionId, replacedPendingId);
    }
    await scheduleServerMessagePersist(sessionId, [message]);
  };

  const sendQueueModule = createMessageSendQueueModule({
    messages,
    sendQueueBySession,
    messageTextConfig,
    messageService,
    messageRepo,
    sessionStore,
    getCurrentUser: () => useUserStore().currentUser,
    addMessage,
    notifyWarning: (message) => {
      ElMessage.warning(message);
    },
    syncHistoryState: loadingModule.syncHistoryState,
    scheduleServerMessagePersist,
  });

  const readModule = createMessageReadModule({
    messages,
    readSessionLocks,
    readSessionLastAt,
    messageService,
    sessionStore,
    getCurrentUserId: () => String(useUserStore().userId || ""),
    scheduleServerMessagePersist,
  });

  const searchModule = createMessageSearchModule({
    messages,
    searchResults,
  });

  const loadMessages = async (sessionId: string, page = 0, size = 20) => {
    if (page > 0) {
      await loadingModule.loadMoreHistory(sessionId, size);
      return;
    }
    await loadingModule.loadMessages(sessionId, size);
  };

  const resetSessionRuntimeState = (sessionId: string) => {
    loadingModule.resetHistoryState(sessionId);
    readSessionLocks.value.delete(sessionId);
    readSessionLastAt.value.delete(sessionId);
    sendQueueBySession.value.delete(sessionId);
    cancelPersistHandle(sessionId);
  };

  const deleteMessage = async (messageId: string) => {
    messages.value.forEach((messageList, sessionId) => {
      const next = limitMessageWindow(
        messageList.filter((message) => message.id !== messageId),
        "latest",
      );
      if (next.length !== messageList.length) {
        messages.value.set(sessionId, next);
        loadingModule.syncHistoryState(sessionId, next, {preserveHasMore: true});
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
    loadingModule.resetHistoryState(sessionId);
    sessionStore.clearSessionConversationState(sessionId);
    cancelPersistHandle(sessionId);
    pendingServerPersistBySession.delete(sessionId);
    await messageRepo.clearConversation(sessionId);
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
    pendingServerPersistBySession.clear();
    pendingPersistHandleBySession.forEach((_handle, sessionId) => {
      cancelPersistHandle(sessionId);
    });
    flushPromiseBySession.clear();
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
    loadMoreHistory: loadingModule.loadMoreHistory,
    addMessage,
    sendMessage: sendQueueModule.sendMessage,
    markAsRead: readModule.markAsRead,
    applyReadSync: readModule.applyReadSync,
    applyReadReceipt: readModule.applyReadReceipt,
    deleteMessage,
    clearMessages,
    searchMessages: searchModule.searchMessages,
    resetSessionRuntimeState,
    flushPendingPersist: flushAllPendingPersist,
    clear,
  };
});
