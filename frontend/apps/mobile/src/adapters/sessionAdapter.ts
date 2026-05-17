import { buildSessionId, resolveMessageSessionId as resolveSharedMessageSessionId } from '@im/shared-im-core';
import { normalizeConversation } from '@im/shared-normalizers';
import { asBoolean, asNumber, asString, isRecord, type ChatSession as SharedChatSession } from '@im/shared-types';
import { normalizeMobileMessage, toSharedMessage } from './messageAdapter';
import { isEncryptedMessage, maskEncryptedMessage } from '@/e2ee/e2eeDeferred';
import type { ChatSession } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';

export const resolvePrivateSessionId = (currentUserId: string, targetUserId: string): string =>
  buildSessionId('private', String(currentUserId), String(targetUserId));

export const resolveGroupSessionId = (groupId: string): string =>
  buildSessionId('group', '', String(groupId));

export const resolveMessageSessionId = (message: MobileMessage, currentUserId: string): string => {
  const resolved = resolveSharedMessageSessionId(toSharedMessage(message), String(currentUserId));
  return resolved || message.conversationId || '';
};

const encryptedFromRecord = (record: Record<string, unknown>, fallback?: unknown): boolean =>
  asBoolean(
    record.encrypted ??
      record.isEncrypted ??
      record.is_encrypted ??
      record.e2eeEnabled ??
      record.e2ee_enabled,
    fallback,
  );

const safeLastMessage = (message: unknown, encryptedFallback = false): MobileMessage | undefined => {
  if (!message) {
    return undefined;
  }
  const normalized = normalizeMobileMessage(message);
  const encrypted = encryptedFallback || isEncryptedMessage(normalized);
  return encrypted ? maskEncryptedMessage({ ...normalized, encrypted: true }) : normalized;
};

const toMobileSession = (session: SharedChatSession, raw?: unknown): ChatSession => {
  const record = isRecord(raw) ? raw : {};
  const sessionEncrypted = encryptedFromRecord(record, session.encrypted ?? false);
  const explicitRawLastMessage = isRecord(record.lastMessage)
    ? record.lastMessage
    : isRecord(record.last_message)
      ? record.last_message
      : undefined;
  const rawLastMessage = explicitRawLastMessage ?? session.lastMessage ?? record.lastMessage ?? record.last_message;
  const lastMessage = safeLastMessage(rawLastMessage, sessionEncrypted);
  const encrypted = sessionEncrypted || Boolean(lastMessage && isEncryptedMessage(lastMessage));
  return {
    ...session,
    encrypted,
    lastMessage,
    memberCount: Number.isFinite(asNumber(record.memberCount ?? record.member_count, Number.NaN))
      ? asNumber(record.memberCount ?? record.member_count)
      : undefined,
  };
};

export const normalizeMobileSession = (raw: unknown, currentUserId: string): ChatSession => {
  const sharedSession = normalizeConversation(raw, String(currentUserId));
  if (sharedSession) {
    return toMobileSession(sharedSession, raw);
  }

  // Minimal fallback for platform-local objects that lack standard DTO fields.
  // All backend conversation DTO compat is handled by normalizeConversation above.
  const record = isRecord(raw) ? raw : {};
  const sessionEncrypted = encryptedFromRecord(record);
  const type = asString(record.type ?? record.conversationType, 'private').toLowerCase().includes('group')
    ? 'group'
    : 'private';
  const targetId = asString(record.targetId ?? record.target_id ?? record.groupId ?? record.group_id ?? record.friendId);
  const id = type === 'group'
    ? resolveGroupSessionId(targetId)
    : resolvePrivateSessionId(String(currentUserId), targetId);
  const lastMessage = safeLastMessage(record.lastMessage ?? record.last_message, sessionEncrypted);
  return {
    id,
    type,
    targetId,
    targetName: asString(record.targetName ?? record.target_name ?? record.name ?? record.groupName ?? record.group_name ?? targetId),
    targetAvatar: asString(record.targetAvatar ?? record.target_avatar ?? record.avatar) || undefined,
    unreadCount: asNumber(record.unreadCount ?? record.unread_count, 0),
    lastActiveTime: asString(record.lastActiveTime ?? record.last_active_time ?? record.lastMessageTime ?? record.last_message_time),
    lastMessage,
    isPinned: asBoolean(record.isPinned ?? record.pinned),
    isMuted: asBoolean(record.isMuted ?? record.muted),
    encrypted: sessionEncrypted || Boolean(lastMessage && isEncryptedMessage(lastMessage)),
    memberCount: Number.isFinite(asNumber(record.memberCount ?? record.member_count, Number.NaN))
      ? asNumber(record.memberCount ?? record.member_count)
      : undefined,
  };
};

export const createSessionFromMessage = (
  message: MobileMessage,
  currentUserId: string,
): ChatSession | null => {
  const type = message.groupId || message.isGroupChat ? 'group' : 'private';
  const targetId =
    type === 'group'
      ? message.groupId
      : message.senderId === currentUserId
        ? message.receiverId
        : message.senderId;
  if (!targetId) {
    return null;
  }
  const id = type === 'group'
    ? resolveGroupSessionId(targetId)
    : resolvePrivateSessionId(currentUserId, targetId);
  return {
    id,
    type,
    targetId,
    targetName:
      type === 'group'
        ? message.groupName || targetId
        : message.senderId === currentUserId
          ? message.receiverName || targetId
          : message.senderName || targetId,
    targetAvatar:
      type === 'group'
        ? message.groupAvatar
        : message.senderId === currentUserId
          ? message.receiverAvatar
          : message.senderAvatar,
    unreadCount: 0,
    lastActiveTime: message.sendTime,
    lastMessage: maskEncryptedMessage(message),
    isPinned: false,
    isMuted: false,
    encrypted: isEncryptedMessage(message),
  };
};