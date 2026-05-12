import type { Message } from "@im/shared-types";

export const messageIdentityValues = (message: Message): string[] =>
  [message.id, message.messageId, message.clientMessageId]
    .map((item) => String(item || ""))
    .filter(Boolean);

export const hasSameMessageIdentity = (
  left: Message,
  right: Message,
): boolean => {
  const rightValues = new Set(messageIdentityValues(right));
  return messageIdentityValues(left).some((item) => rightValues.has(item));
};
