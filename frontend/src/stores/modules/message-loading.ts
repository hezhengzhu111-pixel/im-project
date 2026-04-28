import type {Ref} from "vue";
import type {messageRepo} from "@/utils/messageRepo";
import type {messageService} from "@/services/message";
import type {ChatSession, Message} from "@/types";
import {
    findOldestLoadedServerMessageId,
    getServerMessages,
    limitMessageWindow,
    mergeMessagesChronologically,
    sortMessagesAscending,
} from "@/stores/modules/message-helpers";
import {toBigIntId} from "@/normalizers/chat";

type MessageHistoryResponse =
  | Awaited<ReturnType<typeof messageService.getPrivateHistoryCursor>>
  | Awaited<ReturnType<typeof messageService.getGroupHistoryCursor>>
  | Awaited<ReturnType<typeof messageService.getPrivateHistory>>
  | Awaited<ReturnType<typeof messageService.getGroupHistory>>;

type SessionStoreLike = {
  sessions: ChatSession[];
};

type MessageLoadingModuleContext = {
  messages: Ref<Map<string, Message[]>>;
  loading: Ref<boolean>;
  loadingHistoryBySession: Ref<Map<string, boolean>>;
  hasMoreHistoryBySession: Ref<Map<string, boolean>>;
  oldestLoadedServerMessageIdBySession: Ref<Map<string, string>>;
  fallbackHistoryPageBySession: Ref<Map<string, number>>;
  messageService: typeof messageService;
  messageRepo: typeof messageRepo;
  sessionStore: SessionStoreLike;
  filterClearedMessages: (sessionId: string, list: Message[]) => Message[];
  scheduleServerMessagePersist: (
    sessionId: string,
    messages: Message[],
    options?: { immediate?: boolean },
  ) => Promise<void> | void;
  notifyWarning: (message: string) => void;
};

export function createMessageLoadingModule(ctx: MessageLoadingModuleContext) {
  const resolveSession = (sessionId: string): ChatSession | undefined =>
    ctx.sessionStore.sessions.find((item) => item.id === sessionId);

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
      ctx.oldestLoadedServerMessageIdBySession.value.set(sessionId, oldestId);
    } else {
      ctx.oldestLoadedServerMessageIdBySession.value.delete(sessionId);
    }

    if (typeof options?.hasMoreHistory === "boolean") {
      ctx.hasMoreHistoryBySession.value.set(sessionId, options.hasMoreHistory);
      return;
    }

    if (options?.preserveHasMore && ctx.hasMoreHistoryBySession.value.has(sessionId)) {
      return;
    }

    ctx.hasMoreHistoryBySession.value.set(sessionId, Boolean(oldestId));
  };

  const resetHistoryState = (sessionId: string) => {
    ctx.loadingHistoryBySession.value.delete(sessionId);
    ctx.hasMoreHistoryBySession.value.delete(sessionId);
    ctx.oldestLoadedServerMessageIdBySession.value.delete(sessionId);
    ctx.fallbackHistoryPageBySession.value.delete(sessionId);
  };

  const reviveCachedMessages = async (sessionId: string): Promise<Message[]> => {
    const cached = await ctx.messageRepo.listConversation(sessionId);
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
      ctx.notifyWarning("Detected unsent messages and marked them as failed.");
    }
    return revived;
  };

  const fetchLatestMessages = async (
    session: ChatSession,
    size: number,
    afterMessageId?: string,
  ): Promise<MessageHistoryResponse> => {
    const baseParams: Record<string, unknown> = {limit: size};
    if (afterMessageId) {
      baseParams.after_message_id = afterMessageId;
      baseParams.limit = Math.max(size, 50);
    }
    return session.type === "group"
      ? await ctx.messageService.getGroupHistoryCursor(session.targetId, baseParams)
      : await ctx.messageService.getPrivateHistoryCursor(session.targetId, baseParams);
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
      ? await ctx.messageService.getGroupHistoryCursor(session.targetId, params)
      : await ctx.messageService.getPrivateHistoryCursor(session.targetId, params);
  };

  const fetchHistoryByPage = async (
    session: ChatSession,
    page: number,
    size: number,
  ): Promise<MessageHistoryResponse> =>
    session.type === "group"
      ? await ctx.messageService.getGroupHistory(session.targetId, {page, size})
      : await ctx.messageService.getPrivateHistory(session.targetId, {page, size});

  const loadMessages = async (sessionId: string, size = 20) => {
    ctx.loading.value = true;
    try {
      if (!ctx.messages.value.has(sessionId)) {
        const revived = limitMessageWindow(await reviveCachedMessages(sessionId), "latest");
        if (revived.length > 0) {
          ctx.messages.value.set(sessionId, revived);
          syncHistoryState(sessionId, revived, {preserveHasMore: true});
        }
      }

      const session = resolveSession(sessionId);
      if (!session) {
        return;
      }

      const existingMessages = ctx.messages.value.get(sessionId) || [];
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
      const visibleMessages = ctx.filterClearedMessages(sessionId, normalizedMessages);
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
        if (!String(message.id).startsWith("local_") || !message.clientMessageId) {
          return true;
        }
        return !serverClientIds.has(message.clientMessageId);
      });

      const windowedMessages = limitMessageWindow(nextMessages, "latest");
      ctx.messages.value.set(sessionId, windowedMessages);
      syncHistoryState(sessionId, windowedMessages, {preserveHasMore: true});
      await ctx.scheduleServerMessagePersist(sessionId, visibleMessages);
    } finally {
      ctx.loading.value = false;
    }
  };

  const loadMoreHistory = async (sessionId: string, size = 20) => {
    if (ctx.loadingHistoryBySession.value.get(sessionId)) {
      return;
    }

    if (!ctx.messages.value.has(sessionId)) {
      await loadMessages(sessionId, Math.max(size, 50));
    }

    const session = resolveSession(sessionId);
    if (!session) {
      return;
    }

    const existingMessages = ctx.messages.value.get(sessionId) || [];
    const oldestMessageId =
      ctx.oldestLoadedServerMessageIdBySession.value.get(sessionId) ||
      findOldestLoadedServerMessageId(existingMessages);

    if (!oldestMessageId) {
      syncHistoryState(sessionId, existingMessages, {hasMoreHistory: false});
      return;
    }

    ctx.loadingHistoryBySession.value.set(sessionId, true);
    try {
      let response: MessageHistoryResponse;
      try {
        response = await fetchHistoryByCursor(session, size, oldestMessageId);
      } catch {
        const fallbackPage = ctx.fallbackHistoryPageBySession.value.get(sessionId) ?? 1;
        response = await fetchHistoryByPage(session, fallbackPage, size);
        ctx.fallbackHistoryPageBySession.value.set(sessionId, fallbackPage + 1);
      }

      const normalizedMessages = response.data.slice().sort(sortMessagesAscending);
      const visibleMessages = ctx.filterClearedMessages(sessionId, normalizedMessages);
      const merged = limitMessageWindow(
        mergeMessagesChronologically(visibleMessages, existingMessages),
        "oldest",
      );

      ctx.messages.value.set(sessionId, merged);
      syncHistoryState(sessionId, merged, {
        hasMoreHistory: normalizedMessages.length >= size,
      });
      await ctx.scheduleServerMessagePersist(sessionId, visibleMessages);
    } finally {
      ctx.loadingHistoryBySession.value.delete(sessionId);
    }
  };

  return {
    loadMessages,
    loadMoreHistory,
    syncHistoryState,
    resetHistoryState,
    resolveSession,
  };
}
