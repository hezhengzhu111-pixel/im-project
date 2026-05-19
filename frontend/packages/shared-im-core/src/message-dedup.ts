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
        // E2EE: avoid empty fields from server overwriting non-empty local fields.
        // server ack / self echo may have empty content for encrypted messages.
        const isIncomingEmptyContent = !message.content && previous.content;
        // 当 incoming 解密成功时，清除旧的失败 displayContent，优先使用 content 明文
        const incomingDecryptSuccess = message.decryptStatus === "success";
        const resolvedContent = incomingDecryptSuccess
          ? (message.content || previous.content)
          : isIncomingEmptyContent
            ? previous.content
            : (message.content || previous.content);
        const resolvedDisplayContent = incomingDecryptSuccess
          ? undefined // 清除旧的失败占位，让 content 明文显示
          : (message.displayContent || previous.displayContent || undefined);
        const resolvedDecryptStatus = message.decryptStatus || previous.decryptStatus || undefined;
        const nextMessage = {
          ...previous,
          ...message,
          id: safePreferExistingId(message.id, previous.id),
          content: resolvedContent,
          displayContent: resolvedDisplayContent,
          decryptStatus: resolvedDecryptStatus,
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
  // E2EE: server ack content is empty for encrypted messages.
  // Keep pending displayContent (user's plaintext) and avoid empty content overwrite.
  const isE2eeOwn =
    pending.encrypted === true || pending.encrypted === 1;
  const mergedContent = isE2eeOwn && !serverMessage.content
    ? pending.content
    : (serverMessage.content || pending.content);
  const mergedDisplayContent = isE2eeOwn
    ? (pending.displayContent || serverMessage.displayContent)
    : (serverMessage.displayContent || pending.displayContent);
  const mergedDecryptStatus = isE2eeOwn
    ? (pending.decryptStatus || "skipped_own")
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
    displayContent: mergedDisplayContent || undefined,
    decryptStatus: mergedDecryptStatus || undefined,
  };
};

export const applyMessageToMessageList = (
  messages: Message[],
  incoming: Message,
): Message[] => mergeMessagesChronologically(messages, [incoming]);
