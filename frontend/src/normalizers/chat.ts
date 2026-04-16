import type {ChatSession, ChatSessionType, Message, RawConversationDTO,} from "@/types";
import {asBoolean, asNumber, asString, isRecord} from "@/types/utils";

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
  const conversationType = asString(record.conversationType ?? record.type);
  const isGroup =
    conversationType === "2" ||
    conversationType.toUpperCase() === "GROUP";

  const rawTargetId =
    record.targetId ?? record.partnerId ?? record.friendId ?? record.userId;
  const conversationId = asString(record.conversationId);
  let targetId = asString(rawTargetId);

  if (!isGroup && (!targetId || targetId === currentUserId)) {
    const parts = conversationId.split("_");
    const other = parts.find((part) => part && part !== currentUserId);
    if (other) {
      targetId = other;
    }
  }

  if (!targetId) {
    targetId = conversationId;
  }
  if (!targetId) {
    return null;
  }

  const lastActiveTime = asString(record.lastMessageTime);
  const type: ChatSessionType = isGroup ? "group" : "private";
  const targetName = asString(record.conversationName, targetId);
  const targetAvatar = asString(record.conversationAvatar) || undefined;
  const isPinned = asBoolean(record.isPinned ?? record.pinned, false);
  const isMuted = asBoolean(record.isMuted ?? record.muted, false);
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
  };
};
