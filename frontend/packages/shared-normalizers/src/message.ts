import type {
  Message,
  MessageConfig,
  MessageStatus,
  MessageType,
  RawMessageDTO,
  ReadReceipt,
} from "@im/shared-types";
import { asNumber, asString, isRawMessage, isRecord } from "@im/shared-types";

const MESSAGE_TYPES: MessageType[] = [
  "TEXT",
  "IMAGE",
  "FILE",
  "VIDEO",
  "VOICE",
  "SYSTEM",
  "AI_REPLY",
];

const normalizeFractionalSeconds = (value: unknown): string => {
  const raw = asString(value);
  if (!raw) {
    return "";
  }
  return raw.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})\d+(Z?)$/,
    "$1.$2$3",
  );
};

export const normalizeMessageType = (value: unknown): MessageType => {
  const normalized = asString(value, "TEXT").toUpperCase();
  return MESSAGE_TYPES.includes(normalized as MessageType)
    ? (normalized as MessageType)
    : "TEXT";
};

export const normalizeMessageStatus = (status: unknown): MessageStatus => {
  const statusNum = typeof status === "number" ? status : Number(status);
  if (Number.isFinite(statusNum) && statusNum > 0) {
    if (statusNum === 3) return "READ";
    if (statusNum === 2) return "DELIVERED";
    if (statusNum === 1) return "SENT";
    if (statusNum === 4) return "RECALLED";
    if (statusNum === 5) return "DELETED";
    return "SENT";
  }
  const normalized = asString(status, "SENT").toUpperCase();
  if (normalized === "SENDING") return "SENDING";
  if (normalized === "DELIVERED") return "DELIVERED";
  if (normalized === "READ") return "READ";
  if (normalized === "FAILED") return "FAILED";
  if (normalized === "OFFLINE") return "OFFLINE";
  if (normalized === "RECALLED") return "RECALLED";
  if (normalized === "DELETED") return "DELETED";
  return "SENT";
};

export const normalizeMessageSendTime = (
  raw: RawMessageDTO,
  fallback = new Date().toISOString(),
): string => {
  const created =
    raw.created_at ??
    raw.createdAt ??
    raw.createdTime ??
    raw.created_time ??
    raw.sendTime ??
    raw.send_time;
  return normalizeFractionalSeconds(created || fallback) || fallback;
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = asString(value).trim();
    if (text) {
      return text;
    }
  }
  return "";
};

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const number = asNumber(value, Number.NaN);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return undefined;
};

const VALID_DECRYPT_STATUSES = new Set([
  "success",
  "failed",
  "session_missing",
  "skipped_own",
]);

const validateDecryptStatus = (
  value: string,
): Message["decryptStatus"] => {
  if (VALID_DECRYPT_STATUSES.has(value)) {
    return value as Message["decryptStatus"];
  }
  return undefined;
};

export const normalizeMessage = (
  raw: RawMessageDTO | unknown,
  fallbackSendTime?: string,
): Message => {
  const record: RawMessageDTO = isRawMessage(raw) ? raw : {};
  const extra = isRecord(record.extra) ? record.extra : undefined;
  const receiverId =
    record.receiverId ?? record.receiver?.id ?? record.receiver_id;
  const groupId = record.groupId ?? record.group?.id ?? record.group_id;
  const isGroupMessage =
    record.isGroupChat ??
    record.isGroupMessage ??
    record.isGroup ??
    (groupId != null && groupId !== "");
  const messageType = normalizeMessageType(record.messageType ?? record.type);
  const content = typeof record.content === "string" ? record.content : "";
  const mediaUrl =
    firstString(
      record.mediaUrl,
      record.media_url,
      extra?.mediaUrl,
      extra?.media_url,
      extra?.url,
    ) || (messageType === "TEXT" || messageType === "SYSTEM" ? "" : content);
  const mediaSize = firstNumber(
    record.mediaSize,
    record.media_size,
    extra?.mediaSize,
    extra?.media_size,
    extra?.size,
  );
  const mediaName = firstString(
    record.mediaName,
    record.media_name,
    extra?.mediaName,
    extra?.media_name,
    extra?.fileName,
    extra?.file_name,
    extra?.originalFilename,
    extra?.original_filename,
    extra?.filename,
  );
  const thumbnailUrl = firstString(
    record.thumbnailUrl,
    record.thumbnail_url,
    extra?.thumbnailUrl,
    extra?.thumbnail_url,
  );
  const duration = firstNumber(record.duration, extra?.duration);

  return {
    id: asString(record.id ?? record.messageId ?? record.message_id),
    messageId: asString(record.messageId ?? record.message_id) || undefined,
    clientMessageId:
      asString(record.clientMessageId ?? record.client_message_id) || undefined,
    senderId: asString(
      record.senderId ?? record.sender?.id ?? record.sender_id,
    ),
    senderName:
      asString(record.senderName) ||
      asString(record.sender?.nickname) ||
      asString(record.sender?.username) ||
      undefined,
    senderAvatar:
      asString(record.senderAvatar ?? record.sender?.avatar) || undefined,
    receiverId: asString(receiverId) || undefined,
    receiverName:
      asString(record.receiverName) ||
      asString(record.receiver?.nickname) ||
      asString(record.receiver?.username) ||
      undefined,
    receiverAvatar:
      asString(record.receiverAvatar ?? record.receiver?.avatar) || undefined,
    groupId: asString(groupId) || undefined,
    conversationSeq: firstNumber(
      record.conversationSeq,
      record.conversation_seq,
    ),
    groupName: asString(record.groupName) || undefined,
    groupAvatar: asString(record.groupAvatar) || undefined,
    isGroupChat: Boolean(isGroupMessage),
    messageType,
    content,
    mediaUrl: mediaUrl || undefined,
    mediaSize,
    mediaName: mediaName || undefined,
    thumbnailUrl: thumbnailUrl || undefined,
    duration,
    sendTime: normalizeMessageSendTime(record, fallbackSendTime),
    status: normalizeMessageStatus(record.status),
    extra,
    readBy: Array.isArray(record.readBy)
      ? record.readBy.map((item) => asString(item)).filter(Boolean)
      : undefined,
    readByCount: Number.isFinite(asNumber(record.readByCount, Number.NaN))
      ? asNumber(record.readByCount)
      : Number.isFinite(asNumber(record.read_by_count, Number.NaN))
        ? asNumber(record.read_by_count)
        : undefined,
    readStatus: Number.isFinite(asNumber(record.readStatus, Number.NaN))
      ? asNumber(record.readStatus)
      : undefined,
    readAt:
      normalizeFractionalSeconds(record.readAt ?? record.read_at) || undefined,
    isAiGenerated: Boolean(
      (record as Record<string, unknown>).isAiGenerated ??
        (record as Record<string, unknown>).is_ai_generated,
    ),
    aiProvider:
      asString(
        (record as Record<string, unknown>).aiProvider ??
          (record as Record<string, unknown>).ai_provider,
      ) || undefined,
    aiModel:
      asString(
        (record as Record<string, unknown>).aiModel ??
          (record as Record<string, unknown>).ai_model,
      ) || undefined,
    encrypted: Boolean(record.encrypted),
    e2eeHeader: asString(record.e2eeHeader ?? record.e2ee_header) || undefined,
    e2eeDeviceId:
      asString(record.e2eeDeviceId ?? record.e2ee_device_id) || undefined,
    e2eeSenderIdentityKey:
      asString(
        record.e2eeSenderIdentityKey ?? record.e2ee_sender_identity_key,
      ) || undefined,
    e2eeEphemeralKey:
      asString(record.e2eeEphemeralKey ?? record.e2ee_ephemeral_key) ||
      undefined,
    e2eeEnvelope: record.e2eeEnvelope ?? record.e2ee_envelope,
    decryptStatus: validateDecryptStatus(asString(record.decryptStatus)),
    displayContent: asString(record.displayContent) || undefined,
  };
};

export const normalizeMessageConfig = (raw: unknown): MessageConfig => {
  const record = isRecord(raw) ? raw : {};
  return {
    textEnforce: Boolean(record.textEnforce),
    textMaxLength: Math.max(1, asNumber(record.textMaxLength, 2000)),
  };
};

export const normalizeReadReceipt = (raw: unknown): ReadReceipt | null => {
  const record = isRecord(raw) ? raw : null;
  if (!record) {
    return null;
  }
  const readerId = asString(record.readerId ?? record.reader_id);
  if (!readerId) {
    return null;
  }
  return {
    readerId,
    toUserId: asString(record.toUserId ?? record.to_user_id) || undefined,
    conversationId: asString(record.conversationId) || undefined,
    lastReadMessageId:
      asString(record.lastReadMessageId ?? record.last_read_message_id) ||
      undefined,
    lastReadSeq: firstNumber(record.lastReadSeq ?? record.last_read_seq),
    readAt:
      normalizeFractionalSeconds(record.readAt ?? record.read_at) || undefined,
  };
};

export const splitTextByCodePoints = (
  text: string,
  maxLen: number,
): string[] => {
  const chars = Array.from(text ?? "");
  if (chars.length <= maxLen) {
    return [text ?? ""];
  }
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += maxLen) {
    chunks.push(chars.slice(index, index + maxLen).join(""));
  }
  return chunks;
};

export interface MediaMetadata {
  mediaName?: string;
  mediaSize?: number;
  thumbnailUrl?: string;
  duration?: number;
}

export const normalizeMediaMetadata = (
  raw: Record<string, unknown>,
): MediaMetadata => {
  const mediaName =
    firstString(
      raw.mediaName,
      raw.media_name,
      raw.fileName,
      raw.file_name,
      raw.originalFilename,
      raw.original_filename,
      raw.filename,
    ) || undefined;
  return {
    mediaName,
    mediaSize: firstNumber(raw.mediaSize, raw.media_size, raw.size),
    thumbnailUrl:
      firstString(raw.thumbnailUrl, raw.thumbnail_url) || undefined,
    duration: firstNumber(raw.duration),
  };
};
