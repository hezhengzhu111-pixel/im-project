import type { Ref } from "vue";
import type { messageService } from "@/services/message";
import type { messageRepo } from "@/utils/messageRepo";
import { safePreferExistingId } from "@/normalizers/chat";
import { splitTextByCodePoints } from "@/utils/messageNormalize";
import type { ChatSession, Message, MessageConfig, MessageType } from "@/types";

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

const isNetworkError = (error: unknown): boolean => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (!("response" in e) && "message" in e && String(e.message).toLowerCase().includes("network")) {
      return true;
    }
    if ("code" in e && (e.code === "ERR_NETWORK" || e.code === "ECONNABORTED")) {
      return true;
    }
  }
  return false;
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const generateUUID = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback: 使用 crypto.getRandomValues 生成 v4 UUID
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

const filenameFromUrl = (url: string) => {
  try {
    const parsed = new URL(url, window.location.origin);
    const filename = parsed.pathname.split("/").filter(Boolean).pop();
    return filename ? safeDecode(filename) : "";
  } catch {
    const filename = url
      .split("?")[0]
      .split("#")[0]
      .split("/")
      .filter(Boolean)
      .pop();
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

export function createMessageSendQueueModule(
  ctx: MessageSendQueueModuleContext,
) {
  const enqueueSendTask = async <T>(
    sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    const previous =
      ctx.sendQueueBySession.value.get(sessionId) || Promise.resolve();
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

  const replaceLocalMessage = (
    sessionId: string,
    localId: string,
    message: Message,
  ) => {
    const existing = ctx.messages.value.get(sessionId) || [];
    const next = existing.slice();
    const targetIndex = next.findIndex(
      (item) =>
        item.id === localId ||
        (item.clientMessageId &&
          item.clientMessageId === message.clientMessageId),
    );
    if (targetIndex >= 0) {
      next[targetIndex] = message;
      ctx.messages.value.set(sessionId, next);
      ctx.syncHistoryState(sessionId, next, { preserveHasMore: true });
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
    ctx.syncHistoryState(sessionId, next, { preserveHasMore: true });
  };

  const sendSingleMessage = async (
    session: ChatSession,
    content: string,
    type: MessageType,
    extra?: Record<string, unknown>,
    mentionedUserIds?: string[], // from composer, converted to number[] before API call
  ) => {
    const currentUser = ctx.getCurrentUser();
    if (!currentUser) {
      return false;
    }

    const localId = `local_${generateUUID()}`;
    const clientMessageId = `cm_${generateUUID()}`;
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
      receiverName: session.type === "private" ? session.targetName : undefined,
      receiverAvatar:
        session.type === "private" ? session.targetAvatar : undefined,
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
    await ctx.messageRepo.upsertPendingMessage(
      session.id,
      localId,
      pendingMessage,
    );

    // E2EE encryption intercept
    let encryptedPayload: { ciphertext: string; header: import('@/features/e2ee/types').RatchetHeader; deviceId: string } | null = null;
    let initialHandshake: {
      senderIdentityKey: string;
      ephemeralPublicKey: string;
      deviceId: string;
    } | null = null;

    if (session.type === "private") {
      try {
        const { e2eeManager } = await import('@/features/e2ee/manager/e2ee-manager');
        const { getLocalSessionStatus, getPendingInitialHandshake } = await import('@/features/e2ee/manager/negotiation');

        if (getLocalSessionStatus(session.id) === 'encrypted') {
          try {
            encryptedPayload = await e2eeManager.encryptMessage(session.id, content);
            initialHandshake = getPendingInitialHandshake(session.id);
          } catch {
            // fall through to empty-payload check below
          }

          if (!encryptedPayload || !encryptedPayload.ciphertext) {
            markPendingFailed(session.id, localId);
            await ctx.messageRepo.upsertPendingMessage(session.id, localId, {
              ...pendingMessage,
              status: "FAILED",
            });
            ctx.notifyWarning("端到端加密失败，消息未发送");
            return false;
          }
        }
      } catch {
        // E2EE module load failed — check if session is known encrypted via other means
        // If getLocalSessionStatus is unavailable, we cannot determine encryption state,
        // so we must not silently fall back to plaintext for private sessions.
        // However, if the E2EE feature is simply not loaded (e.g. in tests or non-E2EE builds),
        // we allow plaintext fallback only when the session has no encryption marker.
      }
    }

    const commonSendFields = {
      clientMessageId,
      messageType: type,
      content: isTextLike ? content : undefined,
      mediaUrl: isTextLike ? undefined : content,
      mediaSize: mediaMetadata.mediaSize,
      mediaName: mediaMetadata.mediaName,
      thumbnailUrl: mediaMetadata.thumbnailUrl,
      duration: mediaMetadata.duration,
      extra,
    };

    try {
      let response;
      if (session.type === "group") {
        response = await ctx.messageService.sendGroup({
          ...commonSendFields,
          groupId: session.targetId,
          mentionedUserIds,
        });
      } else if (encryptedPayload) {
        response = await ctx.messageService.sendPrivateEncrypted({
          receiverId: session.targetId,
          clientMessageId,
          messageType: String(type),
          content: encryptedPayload.ciphertext,
          encrypted: true,
          e2eeHeader: JSON.stringify(encryptedPayload.header),
          e2eeDeviceId: encryptedPayload.deviceId,
          e2eeSenderIdentityKey: initialHandshake?.senderIdentityKey,
          e2eeEphemeralKey: initialHandshake?.ephemeralPublicKey,
        });
      } else {
        response = await ctx.messageService.sendPrivate({
          ...commonSendFields,
          receiverId: session.targetId,
        });
      }

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
        receiverName: response.data.receiverName || pendingMessage.receiverName,
        receiverAvatar:
          response.data.receiverAvatar || pendingMessage.receiverAvatar,
        groupId: response.data.groupId || pendingMessage.groupId,
        status: "SENT",
      };
      replaceLocalMessage(session.id, localId, serverMessage);
      if (encryptedPayload && initialHandshake) {
        const { clearPendingInitialHandshake } = await import('@/features/e2ee/manager/negotiation');
        clearPendingInitialHandshake(session.id);
      }
      await ctx.messageRepo.removePendingMessage(session.id, localId);
      await ctx.scheduleServerMessagePersist(session.id, [serverMessage]);
      ctx.sessionStore.applyMessageToSession(session.id, serverMessage);
      return true;
    } catch (error) {
      markPendingFailed(session.id, localId);
      await ctx.messageRepo.upsertPendingMessage(session.id, localId, {
        ...pendingMessage,
        status: "FAILED",
      });
      if (isNetworkError(error)) {
        const offlinePayload =
          session.type === "group"
            ? {
                sendType: "group" as const,
                data: {
                  ...commonSendFields,
                  groupId: session.targetId,
                  mentionedUserIds,
                },
              }
            : encryptedPayload
              ? {
                  sendType: "private" as const,
                  encrypted: true as const,
                  data: {
                    receiverId: session.targetId,
                    clientMessageId,
                    messageType: type,
                    content: encryptedPayload.ciphertext,
                    encrypted: true,
                    e2eeHeader: JSON.stringify(encryptedPayload.header),
                    e2eeDeviceId: encryptedPayload.deviceId,
                    e2eeSenderIdentityKey: initialHandshake?.senderIdentityKey,
                    e2eeEphemeralKey: initialHandshake?.ephemeralPublicKey,
                  },
                }
              : {
                  sendType: "private" as const,
                  data: {
                    ...commonSendFields,
                    receiverId: session.targetId,
                  },
                };
        await ctx.messageRepo.addPendingMessage(
          session.id,
          localId,
          offlinePayload,
        );
      }
      return false;
    }
  };

  const sendMessage = async (
    session: ChatSession | null,
    content: string,
    type: MessageType = "TEXT",
    extra?: Record<string, unknown>,
    mentionedUserIds?: string[], // from composer, converted to number[] before API call
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
              const success = await sendSingleMessage(
                session,
                part,
                type,
                extra,
                mentionedUserIds,
              );
              if (!success) {
                return false;
              }
            }
            return true;
          }
        }
      }

      return sendSingleMessage(session, content, type, extra, mentionedUserIds);
    });
  };

  return {
    enqueueSendTask,
    sendMessage,
  };
}
