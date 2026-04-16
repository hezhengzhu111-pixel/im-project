import type {Ref} from "vue";
import type {messageService} from "@/services/message";
import {buildSessionId, toBigIntId} from "@/normalizers/chat";
import {normalizeReadReceipt} from "@/utils/messageNormalize";
import type {ChatSession, Message, ReadReceipt} from "@/types";

type SessionStoreLike = {
  sessions: ChatSession[];
  markSessionReadLocally: (sessionId: string) => void;
};

type MessageReadModuleContext = {
  messages: Ref<Map<string, Message[]>>;
  readSessionLocks: Ref<Set<string>>;
  readSessionLastAt: Ref<Map<string, number>>;
  messageService: typeof messageService;
  sessionStore: SessionStoreLike;
  getCurrentUserId: () => string;
  scheduleServerMessagePersist: (
    sessionId: string,
    messages: Message[],
    options?: { immediate?: boolean },
  ) => Promise<void> | void;
};

export function createMessageReadModule(ctx: MessageReadModuleContext) {
  const resolveSession = (sessionId: string): ChatSession | undefined =>
    ctx.sessionStore.sessions.find((item) => item.id === sessionId);

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

  const markAsRead = async (sessionId: string) => {
    const now = Date.now();
    const last = ctx.readSessionLastAt.value.get(sessionId) || 0;
    if (now - last < 400 || ctx.readSessionLocks.value.has(sessionId)) {
      ctx.sessionStore.markSessionReadLocally(sessionId);
      return;
    }
    ctx.readSessionLocks.value.add(sessionId);
    try {
      await ctx.messageService.markRead(resolveReadConversationId(sessionId));
      ctx.readSessionLastAt.value.set(sessionId, now);
      ctx.sessionStore.markSessionReadLocally(sessionId);
    } finally {
      ctx.readSessionLocks.value.delete(sessionId);
    }
  };

  const applyReadSync = async (rawReceipt: unknown) => {
    const receipt = normalizeReadReceipt(rawReceipt);
    if (!receipt) {
      return;
    }
    const currentUserId = ctx.getCurrentUserId();
    if (!currentUserId || receipt.readerId !== currentUserId) {
      return;
    }

    const sessionId = resolveReadSyncSessionId(receipt, currentUserId);
    if (!sessionId) {
      return;
    }
    ctx.sessionStore.markSessionReadLocally(sessionId);

    const list = ctx.messages.value.get(sessionId) || [];
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
    const changedMessages: Message[] = [];
    const next = list.map((message) => {
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

      const updated: Message = {
        ...message,
        status: "READ",
        readStatus: 1,
        readAt: receipt.readAt || message.readAt,
      };
      changedMessages.push(updated);
      return updated;
    });

    if (changedMessages.length === 0) {
      return;
    }
    ctx.messages.value.set(sessionId, next);
    await ctx.scheduleServerMessagePersist(sessionId, changedMessages);
  };

  const applyReadReceipt = async (rawReceipt: unknown) => {
    const receipt = normalizeReadReceipt(rawReceipt);
    if (!receipt) {
      return;
    }
    const currentUserId = ctx.getCurrentUserId();
    if (!currentUserId) {
      return;
    }
    if (receipt.readerId === currentUserId) {
      await applyReadSync(receipt);
      return;
    }

    const sessionId = resolveReadReceiptSessionId(receipt, currentUserId);
    const list = ctx.messages.value.get(sessionId) || [];
    const lastReadMessageId = receipt.lastReadMessageId
      ? toBigIntId(receipt.lastReadMessageId)
      : null;
    const readAtMilliseconds = receipt.readAt
      ? new Date(receipt.readAt).getTime()
      : Number.NaN;
    const changedMessages: Message[] = [];

    const next = list.map((message) => {
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

      let updated: Message;
      if (sessionId.startsWith("group_")) {
        const readers = message.readBy || [];
        if (readers.includes(receipt.readerId)) {
          return message;
        }
        updated = {
          ...message,
          readBy: [...readers, receipt.readerId],
          readByCount: readers.length + 1,
          readStatus: 1,
        };
      } else {
        updated = {
          ...message,
          status: "READ",
          readStatus: 1,
          readAt: receipt.readAt || message.readAt,
        };
      }

      changedMessages.push(updated);
      return updated;
    });

    if (changedMessages.length === 0) {
      return;
    }
    ctx.messages.value.set(sessionId, next);
    await ctx.scheduleServerMessagePersist(sessionId, changedMessages);
  };

  return {
    markAsRead,
    applyReadSync,
    applyReadReceipt,
  };
}
