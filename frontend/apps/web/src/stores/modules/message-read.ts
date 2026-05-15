import type { Ref } from "vue";
import type { messageService } from "@/services/message";
import { buildSessionId } from "@/normalizers/chat";
import { normalizeReadReceipt } from "@/normalizers/message";
import { applyReadReceiptToMessages } from "@im/shared-im-core";
import type { ChatSession, Message, ReadReceipt } from "@/types";

type SessionStoreLike = {
  sessions: ChatSession[];
  markSessionReadLocally: (sessionId: string) => void;
};

export type MessageReadModuleContext = {
  messages: Ref<Map<string, Message[]>>;
  readSessionLocks: Ref<Set<string>>;
  readSessionLastAt: Ref<Map<string, number>>;
  readSessionDirty: Ref<Set<string>>;
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
      ctx.readSessionDirty.value.add(sessionId);
      ctx.sessionStore.markSessionReadLocally(sessionId);
      return;
    }
    await doFlushMarkRead(sessionId, now);
  };

  const doFlushMarkRead = async (sessionId: string, now: number) => {
    ctx.readSessionLocks.value.add(sessionId);
    let succeeded = false;
    try {
      await ctx.messageService.markRead(resolveReadConversationId(sessionId));
      ctx.sessionStore.markSessionReadLocally(sessionId);
      succeeded = true;
    } finally {
      ctx.readSessionLocks.value.delete(sessionId);
      ctx.readSessionLastAt.value.set(sessionId, now);
      if (succeeded && ctx.readSessionDirty.value.has(sessionId)) {
        ctx.readSessionDirty.value.delete(sessionId);
        doFlushMarkRead(sessionId, Date.now()).catch(() => {});
      }
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
    if (!receipt.lastReadMessageId) {
      return;
    }

    const { updated, changed } = applyReadReceiptToMessages(list, receipt, {
      targetUserId: currentUserId,
      mode: "sync",
      isGroupSession: sessionId.startsWith("group_"),
    });

    if (changed.length === 0) {
      return;
    }
    ctx.messages.value.set(sessionId, updated);
    await ctx.scheduleServerMessagePersist(sessionId, changed);
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
    if (list.length === 0) {
      return;
    }
    if (!receipt.lastReadMessageId) {
      return;
    }

    const { updated, changed } = applyReadReceiptToMessages(list, receipt, {
      targetUserId: currentUserId,
      mode: "received",
      isGroupSession: sessionId.startsWith("group_"),
    });

    if (changed.length === 0) {
      return;
    }
    ctx.messages.value.set(sessionId, updated);
    await ctx.scheduleServerMessagePersist(sessionId, changed);
  };

  return {
    markAsRead,
    applyReadSync,
    applyReadReceipt,
  };
}
