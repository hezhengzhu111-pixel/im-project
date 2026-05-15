import type {
  ChatSession,
  ChatSessionType,
  Message,
  RawConversationDTO,
} from "@im/shared-types";
import { asBoolean, asNumber, asString, isRecord } from "@im/shared-types";

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    const text = asString(value).trim();
    if (text) {
      return text;
    }
  }
  return "";
};

const stripSessionPrefix = (type: ChatSessionType, value: string): string => {
  if (type === "group" && value.startsWith("group_")) {
    return value.slice("group_".length);
  }
  if (type === "private" && value.startsWith("private_")) {
    return value.slice("private_".length);
  }
  return value;
};

export const toBigIntId = (value: unknown): bigint | null => {
  if (value == null) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value <= 0) {
      return null;
    }
    return BigInt(value);
  }
  const stringValue = asString(value);
  if (!/^\d+$/.test(stringValue)) return null;
  try {
    return BigInt(stringValue);
  } catch {
    return null;
  }
};

export const compareIds = (left: unknown, right: unknown): number => {
  const leftId = toBigIntId(left);
  const rightId = toBigIntId(right);
  if (leftId != null && rightId != null) {
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }
  return asString(left).localeCompare(asString(right));
};

export const buildSessionId = (
  type: ChatSessionType,
  currentUserId: string,
  targetId: string,
): string => {
  if (type === "group") {
    return `group_${targetId}`;
  }
  return compareIds(currentUserId, targetId) < 0
    ? `${currentUserId}_${targetId}`
    : `${targetId}_${currentUserId}`;
};

export const safePreferExistingId = (
  incoming: unknown,
  existing: unknown,
): string => {
  const incomingBigInt = toBigIntId(incoming);
  if (incomingBigInt != null) {
    return incomingBigInt.toString();
  }
  const existingBigInt = toBigIntId(existing);
  if (existingBigInt != null) {
    return existingBigInt.toString();
  }
  return asString(incoming ?? existing);
};

const normalizeLastMessage = (
  raw: RawConversationDTO,
  lastTime: string,
): Message | undefined => {
  const messageType = asString(raw.lastMessageType).toUpperCase();
  const content = raw.lastMessage;
  if (!content && !messageType) {
    return undefined;
  }
  return {
    id: `preview_${asString(raw.conversationId) || asString(raw.targetId)}`,
    senderId: asString(raw.lastMessageSenderId),
    senderName: asString(raw.lastMessageSenderName) || undefined,
    isGroupChat: false,
    messageType:
      messageType === "IMAGE" ||
      messageType === "FILE" ||
      messageType === "VIDEO" ||
      messageType === "VOICE" ||
      messageType === "SYSTEM"
        ? messageType
        : "TEXT",
    content: typeof content === "string" ? content : "",
    sendTime: lastTime,
    status: "SENT",
  };
};

export const normalizeConversation = (
  raw: unknown,
  currentUserId: string,
): ChatSession | null => {
  const record = (isRecord(raw) ? raw : {}) as RawConversationDTO;
  const looseRecord = (isRecord(raw) ? raw : {}) as Record<string, unknown>;
  const conversationType = firstString(
    record.conversationType,
    looseRecord.conversation_type,
    record.type,
  );
  const isGroup =
    conversationType === "2" || conversationType.toUpperCase() === "GROUP";

  const type: ChatSessionType = isGroup ? "group" : "private";
  const rawTargetId = isGroup
    ? record.targetId ??
      looseRecord.target_id ??
      looseRecord.groupId ??
      looseRecord.group_id ??
      record.partnerId ??
      record.friendId ??
      record.userId
    : record.targetId ??
      looseRecord.target_id ??
      record.partnerId ??
      looseRecord.partner_id ??
      record.friendId ??
      looseRecord.friend_id ??
      record.userId ??
      looseRecord.user_id;
  const conversationId = firstString(
    record.conversationId,
    looseRecord.conversation_id,
    looseRecord.id,
  );
  let targetId = stripSessionPrefix(type, asString(rawTargetId));

  if (!isGroup && (!targetId || targetId === currentUserId)) {
    const privateConversationId = stripSessionPrefix("private", conversationId);
    const parts = privateConversationId.split("_");
    const other = parts.find((part) => part && part !== currentUserId);
    if (other) {
      targetId = other;
    }
  }

  if (!targetId) {
    targetId = stripSessionPrefix(type, conversationId);
  }
  if (!targetId) {
    return null;
  }

  const lastActiveTime = firstString(
    record.lastMessageTime,
    looseRecord.last_message_time,
    looseRecord.lastActiveTime,
    looseRecord.last_active_time,
  );
  const targetName = firstString(
    record.conversationName,
    looseRecord.conversation_name,
    looseRecord.targetName,
    looseRecord.target_name,
    looseRecord.groupName,
    looseRecord.group_name,
    looseRecord.name,
    targetId,
  );
  const targetAvatar =
    firstString(
      record.conversationAvatar,
      looseRecord.conversation_avatar,
      looseRecord.targetAvatar,
      looseRecord.target_avatar,
      looseRecord.avatar,
    ) || undefined;
  const isPinned = asBoolean(record.isPinned ?? looseRecord.is_pinned ?? record.pinned, false);
  const isMuted = asBoolean(record.isMuted ?? looseRecord.is_muted ?? record.muted, false);
  const encrypted = asBoolean(record.encrypted ?? looseRecord.encrypted, false);
  return {
    id: buildSessionId(type, currentUserId, targetId),
    conversationId: conversationId || undefined,
    type,
    targetId,
    targetName,
    targetAvatar,
    name: targetName,
    avatar: targetAvatar,
    conversationType: isGroup ? "GROUP" : "PRIVATE",
    conversationName: asString(record.conversationName) || undefined,
    conversationAvatar: asString(record.conversationAvatar) || undefined,
    lastMessage: normalizeLastMessage(record, lastActiveTime),
    lastMessageTime: lastActiveTime || undefined,
    lastMessageSenderId: asString(record.lastMessageSenderId) || undefined,
    lastMessageSenderName: asString(record.lastMessageSenderName) || undefined,
    unreadCount: asNumber(record.unreadCount, 0),
    lastActiveTime,
    updateTime: lastActiveTime || undefined,
    isPinned,
    pinned: isPinned,
    isMuted,
    muted: isMuted,
    encrypted,
  };
};
