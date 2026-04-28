import type {Ref} from "vue";
import type {messageService} from "@/services/message";
import type {messageRepo} from "@/utils/messageRepo";
import {safePreferExistingId} from "@/normalizers/chat";
import {splitTextByCodePoints} from "@/utils/messageNormalize";
import type {ChatSession, Message, MessageConfig, MessageType} from "@/types";

const DEFAULT_MESSAGE_CONFIG: MessageConfig = {
  textEnforce: true,
  textMaxLength: 2000,
};

type UserLike = {
  id: string;
  username?: string;
  nickname?: string;
  avatar?: string;
};

type SessionStoreLike = {
  applyMessageToSession: (
    sessionId: string,
    message: Message,
    options?: { incrementUnread?: boolean },
  ) => void;
};

type MessageSendQueueModuleContext = {
  messages: Ref<Map<string, Message[]>>;
  sendQueueBySession: Ref<Map<string, Promise<void>>>;
  messageTextConfig: Ref<MessageConfig | null>;
  messageService: typeof messageService;
  messageRepo: typeof messageRepo;
  sessionStore: SessionStoreLike;
  getCurrentUser: () => UserLike | null;
  addMessage: (message: Message) => Promise<void>;
  notifyWarning: (message: string) => void;
  syncHistoryState: (
    sessionId: string,
    list: Message[],
    options?: { preserveHasMore?: boolean; hasMoreHistory?: boolean },
  ) => void;
  scheduleServerMessagePersist: (
    sessionId: string,
    messages: Message[],
    options?: { immediate?: boolean },
  ) => Promise<void> | void;
};

type MediaMetadata = {
  mediaName?: string;
  mediaSize?: number;
  thumbnailUrl?: string;
  duration?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "bigint") {
      return String(value);
    }
  }
  return "";
};

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return undefined;
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const filenameFromUrl = (url: string) => {
  try {
    const parsed = new URL(url, window.location.origin);
    const filename = parsed.pathname.split("/").filter(Boolean).pop();
    return filename ? safeDecode(filename) : "";
  } catch {
    const filename = url.split("?")[0].split("#")[0].split("/").filter(Boolean).pop();
    return filename ? safeDecode(filename) : "";
  }
};

const resolveMediaMetadata = (
  mediaUrl: string,
  extra?: Record<string, unknown>,
): MediaMetadata => {
  const record = isRecord(extra) ? extra : {};
  const mediaName =
    firstString(
      record.mediaName,
      record.media_name,
      record.fileName,
      record.file_name,
      record.originalFilename,
      record.original_filename,
      record.filename,
    ) || filenameFromUrl(mediaUrl);
  return {
    mediaName: mediaName || undefined,
    mediaSize: firstNumber(record.mediaSize, record.media_size, record.size),
    thumbnailUrl:
      firstString(record.thumbnailUrl, record.thumbnail_url) || undefined,
    duration: firstNumber(record.duration),
  };
};

export function createMessageSendQueueModule(ctx: MessageSendQueueModuleContext) {
  const enqueueSendTask = async <T>(
    sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    const previous = ctx.sendQueueBySession.value.get(sessionId) || Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    ctx.sendQueueBySession.value.set(sessionId, tail);

    try {
      return await run;
    } finally {
      if (ctx.sendQueueBySession.value.get(sessionId) === tail) {
        ctx.sendQueueBySession.value.delete(sessionId);
      }
    }
  };

  const replaceLocalMessage = (sessionId: string, localId: string, message: Message) => {
    const existing = ctx.messages.value.get(sessionId) || [];
    const next = existing.slice();
    const targetIndex = next.findIndex(
      (item) =>
        item.id === localId ||
        (item.clientMessageId && item.clientMessageId === message.clientMessageId),
    );
    if (targetIndex >= 0) {
      next[targetIndex] = message;
      ctx.messages.value.set(sessionId, next);
      ctx.syncHistoryState(sessionId, next, {preserveHasMore: true});
    }
  };

  const markPendingFailed = (sessionId: string, localId: string) => {
    const existing = ctx.messages.value.get(sessionId) || [];
    const targetIndex = existing.findIndex((item) => item.id === localId);
    if (targetIndex < 0) {
      return;
    }
    const next = existing.slice();
    next[targetIndex] = {
      ...next[targetIndex],
      status: "FAILED",
    };
    ctx.messages.value.set(sessionId, next);
    ctx.syncHistoryState(sessionId, next, {preserveHasMore: true});
  };

  const sendSingleMessage = async (
    session: ChatSession,
    content: string,
    type: MessageType,
    extra?: Record<string, unknown>,
  ) => {
    const currentUser = ctx.getCurrentUser();
    if (!currentUser) {
      return false;
    }

    const localId = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const clientMessageId = `cm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const isTextLike = type === "TEXT";
    const mediaMetadata: MediaMetadata = isTextLike
      ? {}
      : resolveMediaMetadata(content, extra);
    const pendingMessage: Message = {
      id: localId,
      clientMessageId,
      senderId: currentUser.id,
      senderName: currentUser.nickname || currentUser.username,
      senderAvatar: currentUser.avatar,
      receiverId: session.type === "private" ? session.targetId : undefined,
      groupId: session.type === "group" ? session.targetId : undefined,
      isGroupChat: session.type === "group",
      messageType: type,
      content: isTextLike ? content : "",
      mediaUrl: isTextLike ? undefined : content,
      mediaSize: mediaMetadata.mediaSize,
      mediaName: mediaMetadata.mediaName,
      thumbnailUrl: mediaMetadata.thumbnailUrl,
      duration: mediaMetadata.duration,
      sendTime: new Date().toISOString(),
      status: "SENDING",
      extra,
    };

    await ctx.addMessage(pendingMessage);
    await ctx.messageRepo.upsertPendingMessage(session.id, localId, pendingMessage);

    try {
      const response =
        session.type === "group"
          ? await ctx.messageService.sendGroup({
              groupId: session.targetId,
              clientMessageId,
              messageType: type,
              content: isTextLike ? content : undefined,
              mediaUrl: isTextLike ? undefined : content,
              mediaSize: mediaMetadata.mediaSize,
              mediaName: mediaMetadata.mediaName,
              thumbnailUrl: mediaMetadata.thumbnailUrl,
              duration: mediaMetadata.duration,
              extra,
            })
          : await ctx.messageService.sendPrivate({
              receiverId: session.targetId,
              clientMessageId,
              messageType: type,
              content: isTextLike ? content : undefined,
              mediaUrl: isTextLike ? undefined : content,
              mediaSize: mediaMetadata.mediaSize,
              mediaName: mediaMetadata.mediaName,
              thumbnailUrl: mediaMetadata.thumbnailUrl,
              duration: mediaMetadata.duration,
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
      replaceLocalMessage(session.id, localId, serverMessage);
      await ctx.messageRepo.removePendingMessage(session.id, localId);
      await ctx.scheduleServerMessagePersist(session.id, [serverMessage]);
      ctx.sessionStore.applyMessageToSession(session.id, serverMessage);
      return true;
    } catch {
      markPendingFailed(session.id, localId);
      await ctx.messageRepo.upsertPendingMessage(session.id, localId, {
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
      return false;
    }

    return enqueueSendTask(session.id, async () => {
      if (type === "TEXT") {
        if (!ctx.messageTextConfig.value) {
          const response = await ctx.messageService.getConfig();
          ctx.messageTextConfig.value = response.data;
        }
        const config = ctx.messageTextConfig.value || DEFAULT_MESSAGE_CONFIG;
        if (config.textEnforce && config.textMaxLength > 0) {
          const parts = splitTextByCodePoints(content, config.textMaxLength);
          if (parts.length > 1) {
            ctx.notifyWarning(
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

  return {
    enqueueSendTask,
    sendMessage,
  };
}
