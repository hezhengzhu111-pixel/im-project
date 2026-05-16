import type { Message } from "@im/shared-types";
import { safePreferExistingId } from "./session-id.js";
import { messageIdentityValues } from "./message-identity.js";
import { sortMessagesAscending } from "./message-sort.js";

export const dedupeMessages = (messages: Message[]): Message[] => {
  const seen = new Set<string>();
  const result: Message[] = [];

  for (const message of messages) {
    const identities = messageIdentityValues(message);
    const alreadySeen = identities.some((id) => seen.has(id));
    if (alreadySeen) {
      continue;
    }
    for (const id of identities) {
      seen.add(id);
    }
    result.push(message);
  }

  return result;
};

export const mergeMessagesChronologically = (
  ...lists: Message[][]
): Message[] => {
  const merged: Message[] = [];
  const identityIndex = new Map<string, number>();

  const indexMessage = (message: Message, index: number) => {
    messageIdentityValues(message).forEach((identity) => {
      identityIndex.set(identity, index);
    });
  };

  const upsertMessage = (message: Message) => {
    const identities = messageIdentityValues(message);
    const matchedIdentity = identities.find((identity) =>
      identityIndex.has(identity),
    );
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

export const mergeServerMessageWithPending = (
  pending: Message,
  serverMessage: Message,
): Message => ({
  ...pending,
  ...serverMessage,
  // 优先使用server的id，但保留pending的id作为fallback
  id: safePreferExistingId(serverMessage.id, pending.id),
  // 优先使用server的messageId
  messageId: serverMessage.messageId ?? pending.messageId,
  // 保留clientMessageId
  clientMessageId: serverMessage.clientMessageId ?? pending.clientMessageId,
  // 优先使用server的sendTime
  sendTime: serverMessage.sendTime || pending.sendTime,
  // 保留本地媒体资源，除非server已返回
  mediaUrl: serverMessage.mediaUrl || pending.mediaUrl,
  thumbnailUrl: serverMessage.thumbnailUrl || pending.thumbnailUrl,
  mediaName: serverMessage.mediaName || pending.mediaName,
  mediaSize: serverMessage.mediaSize ?? pending.mediaSize,
  // 优先使用server的状态
  status: serverMessage.status || pending.status,
});

export const applyMessageToMessageList = (
  messages: Message[],
  incoming: Message,
): Message[] => mergeMessagesChronologically(messages, [incoming]);
