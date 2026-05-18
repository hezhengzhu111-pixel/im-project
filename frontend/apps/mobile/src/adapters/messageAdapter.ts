import {
  applyIncomingMessageToList,
  hasSameMessageIdentity,
  messageIdentityValues,
  mergeServerMessageWithPending,
  safePreferExistingId,
} from '@im/shared-im-core';
import { isEncryptedValue } from '@im/shared-e2ee-core';
import { normalizeMessage as normalizeSharedMessage } from '@im/shared-normalizers';
import { asString, isRecord, type Message as SharedMessage } from '@im/shared-types';
import { E2EE_UNSUPPORTED_TEXT, hasKnownE2eeDisplayPlaintext, markE2eeDisplayDecrypted } from '@/e2ee/e2eeDeferred';
import type { MobileMessage } from '@/types/models';

const rawRecord = (raw: unknown): Record<string, unknown> => (isRecord(raw) ? raw : {});

export const toSharedMessage = (message: MobileMessage): SharedMessage => ({
  ...message,
  id: message.messageId || message.serverId || message.id,
  messageId: message.messageId || message.serverId,
  senderId: String(message.senderId || ''),
  isGroupChat: Boolean(message.isGroupChat || message.groupId),
  content: message.content || '',
  status: message.status || 'SENT',
});

export const toMobileMessage = (message: SharedMessage, raw?: unknown): MobileMessage => {
  const record = rawRecord(raw);
  const serverId =
    asString(record.serverId ?? record.server_id ?? record.messageId ?? record.message_id) ||
    message.messageId ||
    message.id ||
    undefined;
  const rawEncrypted = record.encrypted;
  return {
    ...message,
    id: message.id || serverId || message.clientMessageId || '',
    messageId: message.messageId || serverId,
    serverId,
    conversationId: asString(record.conversationId ?? record.conversation_id) || undefined,
    encrypted: typeof rawEncrypted === 'number' ? rawEncrypted : Boolean(message.encrypted),
    rawJson: JSON.stringify(isRecord(raw) ? raw : message),
  };
};

export const normalizeMobileMessage = (
  raw: unknown,
  fallbackTime = new Date().toISOString(),
): MobileMessage => toMobileMessage(normalizeSharedMessage(raw, fallbackTime), raw);

export const hasSameMobileMessageIdentity = (
  left: MobileMessage,
  right: MobileMessage,
): boolean => hasSameMessageIdentity(toSharedMessage(left), toSharedMessage(right));

export const mergeServerMobileMessageWithPending = (
  pending: MobileMessage,
  serverMessage: MobileMessage,
): MobileMessage => {
  const merged = mergeServerMessageWithPending(toSharedMessage(pending), toSharedMessage(serverMessage));
  const serverRawJson = serverMessage.rawJson || JSON.stringify(serverMessage);
  const encryptedEcho = isEncryptedValue(serverMessage.encrypted) || isEncryptedValue(pending.encrypted);
  const sameClientMessage = Boolean(
    pending.clientMessageId &&
      serverMessage.clientMessageId &&
      pending.clientMessageId === serverMessage.clientMessageId,
  );
  const pendingHasDisplayPlaintext = Boolean(
    pending.content &&
      pending.content !== E2EE_UNSUPPORTED_TEXT &&
      (hasKnownE2eeDisplayPlaintext(pending) || sameClientMessage),
  );
  const result: MobileMessage = {
    ...pending,
    ...serverMessage,
    ...toMobileMessage(merged, { ...pending, ...serverMessage }),
    // 优先使用server的id
    id: safePreferExistingId(serverMessage.serverId || serverMessage.id, pending.id),
    // 保留clientMessageId
    clientMessageId: serverMessage.clientMessageId || pending.clientMessageId,
    // 优先使用server的sendTime
    sendTime: serverMessage.sendTime || pending.sendTime,
    // 保留本地媒体资源，除非server已返回
    mediaUrl: serverMessage.mediaUrl || pending.mediaUrl,
    thumbnailUrl: serverMessage.thumbnailUrl || pending.thumbnailUrl,
    mediaName: serverMessage.mediaName || pending.mediaName,
    mediaSize: serverMessage.mediaSize ?? pending.mediaSize,
    rawJson: serverRawJson,
  };
  if (encryptedEcho && sameClientMessage && pendingHasDisplayPlaintext) {
    return markE2eeDisplayDecrypted({
      ...result,
      content: pending.content,
      encrypted: serverMessage.encrypted ?? pending.encrypted,
      rawJson: serverRawJson,
    }, 'own-echo-preserved');
  }
  return result;
};

export const applyMobileMessageToList = (
  messages: MobileMessage[],
  incoming: MobileMessage,
): MobileMessage[] => {
  const sharedMessages = messages.map(toSharedMessage);
  const sharedIncoming = toSharedMessage(incoming);

  const sharedResult = applyIncomingMessageToList(sharedMessages, sharedIncoming, { keep: 'all' });

  const identityToMobile = new Map<string, MobileMessage>();
  for (const m of messages) {
    for (const v of messageIdentityValues(m)) {
      identityToMobile.set(v, m);
    }
  }

  return sharedResult.map((shared) => {
    const identities = messageIdentityValues(shared);
    let original: MobileMessage | undefined;
    for (const v of identities) {
      const found = identityToMobile.get(v);
      if (found) {
        original = found;
        break;
      }
    }

    if (!original) {
      return incoming;
    }

    if (hasSameMessageIdentity(shared, sharedIncoming)) {
      return mergeServerMobileMessageWithPending(original, incoming);
    }

    return original;
  });
};
