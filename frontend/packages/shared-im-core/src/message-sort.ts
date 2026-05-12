import type { Message } from "@im/shared-types";

export const messageTimeValue = (message: Message): number => {
  const value = new Date(message.sendTime).getTime();
  return Number.isFinite(value) ? value : 0;
};

export const sortMessagesAscending = (
  left: Message,
  right: Message,
): number => {
  const timeDiff = messageTimeValue(left) - messageTimeValue(right);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
};
