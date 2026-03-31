import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import { messageService } from "@/services/message";
import { messageRepo } from "@/utils/messageRepo";
import { normalizeReadReceipt, splitTextByCodePoints } from "@/utils/messageNormalize";
import { safePreferExistingId, toBigIntId, buildSessionId } from "@/normalizers/chat";
import type {
  ChatSession,
  Message,
  MessageConfig,
  MessageSearchResult,
  MessageType,
  ReadReceipt,
} from "@/types";
import { useUserStore } from "@/stores/user";
import { useSessionStore } from "@/stores/session";
import { useGroupStore } from "@/stores/group";

const DEFAULT_MESSAGE_CONFIG: MessageConfig = {
  textEnforce: true,
  textMaxLength: 2000,
};

export const useMessageStore = defineStore("message", () => {
  const messages = ref<Map<string, Message[]>>(new Map());
  const loading = ref(false);
  const searchResults = ref<MessageSearchResult[]>([]);
  const messageTextConfig = ref<MessageConfig | null>(null);
  const sendingSessionLocks = ref<Set<string>>(new Set());
  const readSessionLocks = ref<Set<string>>(new Set());
  const readSessionLastAt = ref<Map<string, number>>(new Map());

  const sessionStore = useSessionStore();
  const groupStore = useGroupStore();

  const currentMessages = computed(() => {
    if (!sessionStore.currentSession) {
      return [];
    }
    return messages.value.get(sessionStore.currentSession.id) || [];
  });

  const resolveSession = (sessionId: string): ChatSession | undefined => {
    return sessionStore.sessions.find((item) => item.id === sessionId);
  };

  const saveConversationMessages = async (
    sessionId: string,
    list: Message[],
  ) => {
    const serverMessages = list.filter(
      (item) => !String(item.id).startsWith("local_"),
    );
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
      if (
        String(message.id).startsWith("local_") &&
        message.status === "SENDING"
      ) {
        return {
          ...message,
          status: "FAILED" as const,
        };
      }
      return message;
    });
    if (revived.some((message) => message.status === "FAILED")) {
      ElMessage.warning("检测到未送达消息，已标记为失败，可重发");
    }
    return revived;
  };

  const loadMessages = async (sessionId: string, page = 0, size = 20) => {
    loading.value = true;
    try {
      if (page === 0 && !messages.value.has(sessionId)) {
        const revived = await reviveCachedMessages(sessionId);
        if (revived.length) {
          messages.value.set(sessionId, revived);
        }
      }

      const session = resolveSession(sessionId);
      if (!session) {
        return;
      }

      const existingMessages = messages.value.get(sessionId) || [];
      const serverIds = existingMessages
        .map((message) => {
          if (String(message.id).startsWith("local_")) {
            return null;
          }
          return toBigIntId(message.id);
        })
        .filter((item): item is bigint => item != null);
      const maxServerId =
        serverIds.length > 0
          ? serverIds.reduce((left, right) => (left > right ? left : right))
          : null;
      const minServerId =
        serverIds.length > 0
          ? serverIds.reduce((left, right) => (left < right ? left : right))
          : null;
      const baseParams: Record<string, unknown> = { limit: size };

      let response:
        | Awaited<ReturnType<typeof messageService.getPrivateHistoryCursor>>
        | Awaited<ReturnType<typeof messageService.getGroupHistoryCursor>>
        | Awaited<ReturnType<typeof messageService.getPrivateHistory>>
        | Awaited<ReturnType<typeof messageService.getGroupHistory>>;

      try {
        if (page === 0) {
          if (maxServerId != null) {
            response =
              session.type === "group"
                ? await messageService.getGroupHistoryCursor(session.targetId, {
                    ...baseParams,
                    after_message_id: maxServerId.toString(),
                    limit: Math.max(size, 50),
                  })
                : await messageService.getPrivateHistoryCursor(
                    session.targetId,
                    {
                      ...baseParams,
                      after_message_id: maxServerId.toString(),
                      limit: Math.max(size, 50),
                    },
                  );
          } else {
            response =
              session.type === "group"
                ? await messageService.getGroupHistoryCursor(
                    session.targetId,
                    baseParams,
                  )
                : await messageService.getPrivateHistoryCursor(
                    session.targetId,
                    baseParams,
                  );
          }
        } else if (minServerId != null) {
          response =
            session.type === "group"
              ? await messageService.getGroupHistoryCursor(session.targetId, {
                  ...baseParams,
                  last_message_id: minServerId.toString(),
                })
              : await messageService.getPrivateHistoryCursor(session.targetId, {
                  ...baseParams,
                  last_message_id: minServerId.toString(),
                });
        } else {
          return;
        }
      } catch {
        response =
          session.type === "group"
            ? await messageService.getGroupHistory(session.targetId, {
                page,
                size,
              })
            : await messageService.getPrivateHistory(session.targetId, {
                page,
                size,
              });
      }

      const normalizedMessages = response.data.slice().sort((left, right) => {
        return (
          new Date(left.sendTime).getTime() - new Date(right.sendTime).getTime()
        );
      });

      if (page === 0) {
        const pending = existingMessages.filter((message) =>
          String(message.id).startsWith("local_"),
        );
        const serverMessages = existingMessages.filter(
          (message) => !String(message.id).startsWith("local_"),
        );
        const mergedSource = maxServerId != null
          ? [...serverMessages, ...normalizedMessages]
          : normalizedMessages;
        const byId = new Map<string, Message>();
        for (const message of mergedSource) {
          byId.set(String(message.id), message);
        }
        const merged = [...byId.values(), ...pending].sort((left, right) => {
          return (
            new Date(left.sendTime).getTime() -
            new Date(right.sendTime).getTime()
          );
        });
        const serverClientIds = new Set(
          normalizedMessages
            .map((message) => message.clientMessageId)
            .filter((item): item is string => Boolean(item)),
        );
        messages.value.set(
          sessionId,
          merged.filter((message) => {
            if (!String(message.id).startsWith("local_")) {
              return true;
            }
            if (!message.clientMessageId) {
              return true;
            }
            return !serverClientIds.has(message.clientMessageId);
          }),
        );
      } else {
        const merged = [...normalizedMessages, ...existingMessages].sort(
          (left, right) => {
            return (
              new Date(left.sendTime).getTime() -
              new Date(right.sendTime).getTime()
            );
          },
        );
        messages.value.set(sessionId, merged);
      }
      await saveConversationMessages(
        sessionId,
        messages.value.get(sessionId) || [],
      );
    } finally {
      loading.value = false;
    }
  };

  const addMessage = async (message: Message) => {
    const sessionStore = useSessionStore();
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
          targetName: message.groupName || "未知群组",
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

    if (!sessionId) {
      return;
    }

    const list = messages.value.get(sessionId) || [];
    const existingIndex = list.findIndex((item) => {
      if (item.id === message.id) {
        return true;
      }
      return Boolean(
        item.clientMessageId &&
          message.clientMessageId &&
          item.clientMessageId === message.clientMessageId,
      );
    });
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
    list.sort((left, right) => {
      return new Date(left.sendTime).getTime() - new Date(right.sendTime).getTime();
    });
    messages.value.set(sessionId, list);
    const isSelfMessage = message.senderId === String(userStore.userId || "");
    sessionStore.applyMessageToSession(sessionId, message, {
      incrementUnread:
        !isSelfMessage && sessionStore.currentSession?.id !== sessionId,
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
        clientMessageId:
          response.data.clientMessageId || pendingMessage.clientMessageId,
        senderId: safePreferExistingId(
          response.data.senderId,
          pendingMessage.senderId,
        ),
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
      ElMessage.error("请先选择聊天对象");
      return false;
    }

    const lockSessionId = session.id;
    let waitDuration = 0;
    while (sendingSessionLocks.value.has(lockSessionId) && waitDuration < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      waitDuration += 25;
    }
    if (sendingSessionLocks.value.has(lockSessionId)) {
      ElMessage.warning("会话发送繁忙，请稍后重试");
      return false;
    }
    sendingSessionLocks.value.add(lockSessionId);

    try {
      if (type === "TEXT") {
        if (!messageTextConfig.value) {
          const response = await messageService.getConfig();
          messageTextConfig.value = response.data;
        }
        const config = messageTextConfig.value || DEFAULT_MESSAGE_CONFIG;
        if (config.textEnforce && config.textMaxLength > 0) {
          const parts = splitTextByCodePoints(content, config.textMaxLength);
          if (parts.length > 1) {
            ElMessage.warning(`内容过长，已拆分为${parts.length}条发送`);
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
    } finally {
      sendingSessionLocks.value.delete(lockSessionId);
    }
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
      await messageService.markRead(sessionId);
      readSessionLastAt.value.set(sessionId, now);
      sessionStore.markSessionReadLocally(sessionId);
    } finally {
      readSessionLocks.value.delete(sessionId);
    }
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
    const sessionId =
      receipt.conversationId && receipt.conversationId.startsWith("group_")
        ? receipt.conversationId
        : buildSessionId("private", currentUserId, receipt.readerId);
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
      }
    });
  };

  const clearMessages = async (sessionId: string) => {
    messages.value.set(sessionId, []);
    await messageRepo.clearConversation(sessionId);
  };

  const searchMessages = async (keyword: string, sessionId?: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      searchResults.value = [];
      return;
    }
    const sessionIds = sessionId
      ? [sessionId]
      : Array.from(messages.value.keys());
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
    searchResults.value = [];
    messageTextConfig.value = null;
    sendingSessionLocks.value.clear();
    readSessionLocks.value.clear();
    readSessionLastAt.value.clear();
  };

  return {
    messages,
    loading,
    searchResults,
    currentMessages,
    loadMessages,
    addMessage,
    sendMessage,
    markAsRead,
    applyReadReceipt,
    deleteMessage,
    clearMessages,
    searchMessages,
    clear,
  };
});
