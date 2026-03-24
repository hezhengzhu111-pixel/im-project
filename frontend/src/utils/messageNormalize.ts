import type { Message } from "@/types";

type RawMessage = Record<string, any>;

const normalizeFractionalSeconds = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})\d+$/,
    "$1.$2",
  );
};

export const normalizeMessageStatus = (status: any): Message["status"] => {
  const statusNum = typeof status === "number" ? status : Number(status);
  if (Number.isFinite(statusNum) && statusNum > 0) {
    if (statusNum === 3) return "READ";
    if (statusNum === 2) return "DELIVERED";
    if (statusNum === 1) return "SENT";
    if (statusNum === 4) return "RECALLED";
    if (statusNum === 5) return "DELETED";
    return "SENT";
  }
  return (status as Message["status"]) || "SENT";
};

export const normalizeMessageSendTime = (
  message: RawMessage,
  fallback = new Date().toISOString(),
) => {
  const created =
    message.created_at ||
    message.createdAt ||
    message.createdTime ||
    message.created_time ||
    message.sendTime ||
    message.send_time;

  return (
    normalizeFractionalSeconds(created) ||
    message.sendTime ||
    normalizeFractionalSeconds(fallback) ||
    new Date().toISOString()
  );
};

export const normalizeMessageBase = (
  message: RawMessage,
  fallbackSendTime?: string,
) => {
  return {
    ...message,
    senderId: message.senderId || message.sender?.id || message.sender_id,
    messageType: message.messageType || message.type || "TEXT",
    type: message.type || message.messageType || "TEXT",
    senderName:
      message.senderName ||
      message.sender?.nickname ||
      message.sender?.username,
    senderAvatar: message.senderAvatar || message.sender?.avatar,
    content: typeof message.content === "string" ? message.content : "",
    sendTime: normalizeMessageSendTime(message, fallbackSendTime),
    status: normalizeMessageStatus(message.status),
  };
};
