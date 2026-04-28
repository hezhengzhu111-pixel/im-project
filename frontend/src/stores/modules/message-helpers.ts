import {safePreferExistingId, toBigIntId} from "@/normalizers/chat";
import type {Message} from "@/types";

export const MESSAGE_WINDOW_SIZE = 50;

export type ConversationClearMarker = {
  clearedAtMs: number;
  lastServerMessageId?: string;
};

export const messageIdentityValues = (message: Message): string[] =>
  [message.id, message.messageId, message.clientMessageId]
    .map((item) => String(item || ""))
    .filter(Boolean);

export const hasSameMessageIdentity = (left: Message, right: Message): boolean => {
  const rightValues = new Set(messageIdentityValues(right));
  return messageIdentityValues(left).some((item) => rightValues.has(item));
};

export const messageTimeValue = (message: Message): number => {
  const value = new Date(message.sendTime).getTime();
  return Number.isFinite(value) ? value : 0;
};

export const sortMessagesAscending = (left: Message, right: Message): number => {
  const timeDiff = messageTimeValue(left) - messageTimeValue(right);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
};

export const getServerMessages = (list: Message[]): Message[] =>
  list.filter((message) => !String(message.id).startsWith("local_"));

export const findOldestLoadedServerMessageId = (
  list: Message[],
): string | undefined => {
  const oldestId = getServerMessages(list)
    .map((message) => toBigIntId(message.id))
    .filter((item): item is bigint => item != null)
    .reduce<bigint | null>((minId, currentId) => {
      if (minId == null || currentId < minId) {
        return currentId;
      }
      return minId;
    }, null);
  return oldestId?.toString();
};

export const mergeMessagesChronologically = (...lists: Message[][]): Message[] => {
  const merged: Message[] = [];
  const identityIndex = new Map<string, number>();

  const indexMessage = (message: Message, index: number) => {
    messageIdentityValues(message).forEach((identity) => {
      identityIndex.set(identity, index);
    });
  };

  const upsertMessage = (message: Message) => {
    const identities = messageIdentityValues(message);
    const matchedIdentity = identities.find((identity) => identityIndex.has(identity));
    if (matchedIdentity) {
      const index = identityIndex.get(matchedIdentity);
      if (index != null) {
        const previous = merged[index];
        const nextMessage = {
          ...previous,
          ...message,
          id: safePreferExistingId(message.id, previous.id),
        };
        merged[index] = nextMessage;
        indexMessage(nextMessage, index);
        return;
      }
    }

    merged.push(message);
    indexMessage(message, merged.length - 1);
  };

  lists.forEach((list) => {
    list.forEach((message) => {
      upsertMessage(message);
    });
  });

  return merged.sort(sortMessagesAscending);
};

export const limitMessageWindow = (
  list: Message[],
  keep: "latest" | "oldest" = "latest",
  size = MESSAGE_WINDOW_SIZE,
): Message[] => {
  const sorted = list.slice().sort(sortMessagesAscending);
  if (sorted.length <= size) {
    return sorted;
  }
  return keep === "oldest" ? sorted.slice(0, size) : sorted.slice(-size);
};
