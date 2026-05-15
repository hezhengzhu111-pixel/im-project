import {
  hasSameMessageIdentity,
  mergeServerMessageWithPending,
  messageTimeValue,
  safePreferExistingId,
} from '@im/shared-im-core';
import { normalizeMessage as normalizeSharedMessage } from '@im/shared-normalizers';
import { asString, isRecord, type Message as SharedMessage } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';

const rawRecord = (raw: unknown): Record<string, unknown> => (isRecord(raw) ? raw : {});

export const toSharedMessage = (message: MobileMessage): SharedMessage => ({
  id: message.messageId || message.serverId || message.id,
  messageId: message.messageId || message.serverId,
  clientMessageId: message.clientMessageId,
  senderId: String(message.senderId || ''),
  senderName: message.senderName,
  senderAvatar: message.senderAvatar,
  receiverId: message.receiverId,
  receiverName: message.receiverName,
  receiverAvatar: message.receiverAvatar,
  groupId: message.groupId,
  groupName: message.groupName,
  groupAvatar: message.groupAvatar,
  isGroupChat: Boolean(message.isGroupChat || message.groupId),
  messageType: message.messageType,
  content: message.content || '',
  mediaUrl: message.mediaUrl,
  mediaSize: message.mediaSize,
  mediaName: message.mediaName,
  thumbnailUrl: message.thumbnailUrl,
  duration: message.duration,
  sendTime: message.sendTime,
  status: message.status || 'SENT',
  extra: message.extra,
  readBy: message.readBy,
  readByCount: message.readByCount,
  readStatus: message.readStatus,
  readAt: message.readAt,
  isAiGenerated: message.isAiGenerated,
  encrypted: message.encrypted === true || message.encrypted === 1,
  e2eeHeader: message.e2eeHeader,
  e2eeDeviceId: message.e2eeDeviceId,
  e2eeSenderIdentityKey: message.e2eeSenderIdentityKey,
  e2eeEphemeralKey: message.e2eeEphemeralKey,
});

export const toMobileMessage = (message: SharedMessage, raw?: unknown): MobileMessage => {
  const record = rawRecord(raw);
  const rawServerId = asString(
    record.serverId ??
      record.server_id ??
      record.messageId ??
      record.message_id,
  );
  const serverId = rawServerId || message.messageId || message.id || undefined;
  const rawConversationId = asString(record.conversationId ?? record.conversation_id);
  const rawEncrypted = record.encrypted;
  return {
    id: message.id || serverId || message.clientMessageId || '',
    messageId: message.messageId || serverId,
    serverId,
    clientMessageId: message.clientMessageId,
    conversationId: rawConversationId || undefined,
    senderId: message.senderId,
    senderName: message.senderName,
    senderAvatar: message.senderAvatar,
    receiverId: message.receiverId,
    receiverName: message.receiverName,
    receiverAvatar: message.receiverAvatar,
    groupId: message.groupId,
    groupName: message.groupName,
    groupAvatar: message.groupAvatar,
    isGroupChat: message.isGroupChat,
    messageType: message.messageType,
    content: message.content,
    mediaUrl: message.mediaUrl,
    thumbnailUrl: message.thumbnailUrl,
    mediaName: message.mediaName,
    mediaSize: message.mediaSize,
    duration: message.duration,
    status: message.status,
    readStatus: message.readStatus,
    readBy: message.readBy,
    readByCount: message.readByCount,
    readAt: message.readAt,
    sendTime: message.sendTime,
    encrypted: typeof rawEncrypted === 'number' ? rawEncrypted : Boolean(message.encrypted),
    isAiGenerated: message.isAiGenerated,
    extra: message.extra,
    e2eeHeader: message.e2eeHeader,
    e2eeDeviceId: message.e2eeDeviceId,
    e2eeSenderIdentityKey: message.e2eeSenderIdentityKey,
    e2eeEphemeralKey: message.e2eeEphemeralKey,
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
  const next = messages.slice();
  const index = next.findIndex((item) => hasSameMobileMessageIdentity(item, incoming));
  if (index >= 0) {
    next[index] = mergeServerMobileMessageWithPending(next[index], incoming);
  } else {
    next.push(incoming);
  }
  return next.sort((left, right) => messageTimeValue(toSharedMessage(left)) - messageTimeValue(toSharedMessage(right)));
};
