import type {
  AiApiKey,
  ChatSession,
  FriendRequest,
  Friendship,
  Group,
  GroupMember,
  MobileMessage,
  User,
  UserAuthResponse,
  UserSettings,
} from '@/types/models';

type RecordLike = Record<string, unknown>;

export const isRecord = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null;

export const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return fallback;
};

export const asNumber = (value: unknown, fallback = 0): number => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

export const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }
  return fallback;
};

export const normalizeUser = (raw: unknown): User => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: asString(record.id ?? record.userId),
    username: asString(record.username),
    nickname: asString(record.nickname),
    avatar: asString(record.avatar),
    email: asString(record.email),
    phone: asString(record.phone),
    gender: asString(record.gender),
    birthday: asString(record.birthday),
    signature: asString(record.signature),
    region: asString(record.region),
    status: asString(record.status),
    permissions: Array.isArray(record.permissions)
      ? record.permissions.map((item) => asString(item)).filter(Boolean)
      : undefined,
  };
};

export const normalizeAuthResponse = (raw: unknown): UserAuthResponse => {
  const record = isRecord(raw) ? raw : {};
  return {
    success: asBoolean(record.success, true),
    message: asString(record.message),
    token: asString(record.token),
    accessToken: asString(record.accessToken ?? record.access_token),
    user: record.user ? normalizeUser(record.user) : undefined,
    permissions: Array.isArray(record.permissions)
      ? record.permissions.map((item) => asString(item)).filter(Boolean)
      : undefined,
  };
};

export const normalizeSettings = (raw: unknown): UserSettings => {
  const record = isRecord(raw) ? raw : {};
  return {
    privacy: isRecord(record.privacy) ? (record.privacy as Record<string, boolean>) : {},
    message: isRecord(record.message) ? (record.message as Record<string, boolean>) : {},
    general: isRecord(record.general) ? record.general : {},
  };
};

export const normalizeFriendship = (raw: unknown): Friendship => {
  const record = isRecord(raw) ? raw : {};
  return {
    friendId: asString(record.friendId ?? record.friend_user_id ?? record.userId ?? record.id),
    username: asString(record.username),
    nickname: asString(record.nickname),
    remark: asString(record.remark),
    avatar: asString(record.avatar),
    online: asBoolean(record.online),
    status: asString(record.status),
  };
};

export const normalizeFriendRequest = (raw: unknown): FriendRequest => {
  const record = isRecord(raw) ? raw : {};
  return {
    requestId: asString(record.requestId ?? record.id),
    fromUserId: asString(record.fromUserId ?? record.from_user_id ?? record.userId),
    toUserId: asString(record.toUserId ?? record.to_user_id),
    username: asString(record.username),
    nickname: asString(record.nickname),
    avatar: asString(record.avatar),
    reason: asString(record.reason ?? record.message),
    status: asString(record.status, 'PENDING'),
    createdAt: asString(record.createdAt ?? record.created_at),
  };
};

export const normalizeGroup = (raw: unknown): Group => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: asString(record.id ?? record.groupId ?? record.group_id),
    groupName: asString(record.groupName ?? record.group_name ?? record.name),
    name: asString(record.name ?? record.groupName ?? record.group_name),
    avatar: asString(record.avatar),
    announcement: asString(record.announcement ?? record.description),
    ownerId: asString(record.ownerId ?? record.owner_id),
    memberCount: asNumber(record.memberCount ?? record.member_count, 0),
    lastMessageTime: asString(record.lastMessageTime ?? record.last_message_time),
    lastActivityAt: asString(record.lastActivityAt ?? record.last_activity_at),
  };
};

export const normalizeGroupMember = (raw: unknown): GroupMember => {
  const record = isRecord(raw) ? raw : {};
  return {
    userId: asString(record.userId ?? record.user_id ?? record.id),
    username: asString(record.username),
    nickname: asString(record.nickname),
    avatar: asString(record.avatar),
    role: asString(record.role),
    online: asBoolean(record.online),
  };
};

export const normalizeMessage = (raw: unknown, fallbackTime = new Date().toISOString()): MobileMessage => {
  const record = isRecord(raw) ? raw : {};
  const messageType = asString(record.messageType ?? record.message_type ?? record.type, 'TEXT');
  return {
    id: asString(record.id ?? record.messageId ?? record.message_id ?? record.serverId),
    serverId: asString(record.serverId ?? record.server_id ?? record.id),
    clientMessageId: asString(record.clientMessageId ?? record.client_message_id),
    conversationId: asString(record.conversationId ?? record.conversation_id),
    senderId: asString(record.senderId ?? record.sender_id),
    senderName: asString(record.senderName ?? record.sender_name),
    senderAvatar: asString(record.senderAvatar ?? record.sender_avatar),
    receiverId: asString(record.receiverId ?? record.receiver_id),
    receiverName: asString(record.receiverName ?? record.receiver_name),
    receiverAvatar: asString(record.receiverAvatar ?? record.receiver_avatar),
    groupId: asString(record.groupId ?? record.group_id),
    groupName: asString(record.groupName ?? record.group_name),
    groupAvatar: asString(record.groupAvatar ?? record.group_avatar),
    isGroupChat: asBoolean(record.isGroupChat ?? record.is_group_chat),
    messageType: messageType as MobileMessage['messageType'],
    content: asString(record.content),
    mediaUrl: asString(record.mediaUrl ?? record.media_url),
    thumbnailUrl: asString(record.thumbnailUrl ?? record.thumbnail_url),
    mediaName: asString(record.mediaName ?? record.media_name),
    mediaSize: record.mediaSize || record.media_size ? asNumber(record.mediaSize ?? record.media_size) : undefined,
    duration: record.duration ? asNumber(record.duration) : undefined,
    status: asString(record.status, 'SENT') as MobileMessage['status'],
    readStatus: record.readStatus || record.read_status ? asNumber(record.readStatus ?? record.read_status) : undefined,
    readBy: Array.isArray(record.readBy) ? record.readBy.map((item) => asString(item)).filter(Boolean) : undefined,
    readByCount: record.readByCount || record.read_by_count ? asNumber(record.readByCount ?? record.read_by_count) : undefined,
    readAt: asString(record.readAt ?? record.read_at),
    sendTime: asString(record.sendTime ?? record.send_time ?? record.createdAt ?? record.created_at, fallbackTime),
    encrypted: record.encrypted as MobileMessage['encrypted'],
    isAiGenerated: asBoolean(record.isAiGenerated ?? record.is_ai_generated),
    extra: isRecord(record.extra) ? record.extra : undefined,
    rawJson: JSON.stringify(record),
  };
};

export const normalizeSession = (raw: unknown, currentUserId: string): ChatSession => {
  const record = isRecord(raw) ? raw : {};
  const type = asString(record.type ?? record.conversationType, 'private').toLowerCase().includes('group')
    ? 'group'
    : 'private';
  const targetId = asString(record.targetId ?? record.target_id ?? record.groupId ?? record.friendId);
  return {
    id:
      asString(record.id) ||
      (type === 'group' ? `group_${targetId}` : `private_${currentUserId}_${targetId}`),
    type,
    targetId,
    targetName: asString(record.targetName ?? record.name ?? record.groupName ?? record.nickname ?? targetId),
    targetAvatar: asString(record.targetAvatar ?? record.avatar),
    unreadCount: asNumber(record.unreadCount ?? record.unread_count, 0),
    lastActiveTime: asString(record.lastActiveTime ?? record.last_active_time ?? record.lastMessageTime),
    lastMessage: record.lastMessage ? normalizeMessage(record.lastMessage) : undefined,
    isPinned: asBoolean(record.isPinned ?? record.pinned),
    isMuted: asBoolean(record.isMuted ?? record.muted),
    encrypted: asBoolean(record.encrypted),
    memberCount: record.memberCount ? asNumber(record.memberCount) : undefined,
  };
};

export const normalizeAiKey = (raw: unknown): AiApiKey => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: asString(record.id),
    provider: asString(record.provider),
    keyName: asString(record.keyName ?? record.key_name),
    maskedKey: asString(record.maskedKey ?? record.masked_key),
    isActive: asBoolean(record.isActive ?? record.is_active),
    validateStatus: asString(record.validateStatus ?? record.validate_status),
    lastValidatedAt: asString(record.lastValidatedAt ?? record.last_validated_at),
  };
};
