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
        // E2EE: 服务端无 e2eeEnvelope/content，保留本地已持久化的数据
        const resolvedContent = message.content || previous.content;
        const resolvedDecryptStatus = message.decryptStatus || previous.decryptStatus || undefined;
        const resolvedE2eeEnvelope = message.e2eeEnvelope || previous.e2eeEnvelope || undefined;
        const resolvedEncrypted = message.encrypted || previous.encrypted || undefined;
        const nextMessage = {
          ...previous,
          ...message,
          id: safePreferExistingId(message.id, previous.id),
          content: resolvedContent,
          decryptStatus: resolvedDecryptStatus,
          e2eeEnvelope: resolvedE2eeEnvelope,
          encrypted: resolvedEncrypted,
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
): Message => {
  const isE2eeOwn =
    pending.encrypted === true || pending.encrypted === 1;
  // E2EE own: server ack content 为空，保留 pending content（用户明文）
  const mergedContent = isE2eeOwn
    ? (pending.content || serverMessage.content)
    : (serverMessage.content || pending.content);
  const mergedDecryptStatus = isE2eeOwn
    ? "skipped_own"
    : (serverMessage.decryptStatus || pending.decryptStatus);

  return {
    ...pending,
    ...serverMessage,
    id: safePreferExistingId(serverMessage.id, pending.id),
    messageId: serverMessage.messageId ?? pending.messageId,
    clientMessageId: serverMessage.clientMessageId ?? pending.clientMessageId,
    sendTime: serverMessage.sendTime || pending.sendTime,
    mediaUrl: serverMessage.mediaUrl || pending.mediaUrl,
    thumbnailUrl: serverMessage.thumbnailUrl || pending.thumbnailUrl,
    mediaName: serverMessage.mediaName || pending.mediaName,
    mediaSize: serverMessage.mediaSize ?? pending.mediaSize,
    status: serverMessage.status || pending.status,
    content: mergedContent,
    decryptStatus: mergedDecryptStatus || undefined,
    e2eeEnvelope: serverMessage.e2eeEnvelope || pending.e2eeEnvelope || undefined,
    encrypted: serverMessage.encrypted || pending.encrypted || undefined,
  };
};

export const applyMessageToMessageList = (
  messages: Message[],
  incoming: Message,
): Message[] => mergeMessagesChronologically(messages, [incoming]);
