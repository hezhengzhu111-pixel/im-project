import {
  applyIncomingMessageToList,
  hasSameMessageIdentity,
  messageIdentityValues,
  mergeServerMessageWithPending,
  safePreferExistingId,
} from '@im/shared-im-core';
import { normalizeMessage as normalizeSharedMessage } from '@im/shared-normalizers';
import { asString, isRecord, type Message as SharedMessage } from '@im/shared-types';
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
  return {
    ...pending,
    ...serverMessage,
    ...toMobileMessage(merged, { ...pending, ...serverMessage }),
    id: safePreferExistingId(serverMessage.serverId || serverMessage.id, pending.id),
    clientMessageId: serverMessage.clientMessageId || pending.clientMessageId,
  };
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
