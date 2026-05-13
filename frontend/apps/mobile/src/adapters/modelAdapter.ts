import {
  defaultUserSettings,
  normalizeFriendRequest as normalizeSharedFriendRequest,
  normalizeFriendship as normalizeSharedFriendship,
  normalizeGroup as normalizeSharedGroup,
  normalizeGroupMember as normalizeSharedGroupMember,
  normalizeUser as normalizeSharedUser,
  normalizeUserAuthResponse,
  normalizeUserSettings,
} from '@im/shared-normalizers';
import { asBoolean, asString, isRecord } from '@im/shared-types';
import type {
  AiApiKey,
  FriendRequest,
  Friendship,
  Group,
  GroupMember,
  User,
  UserAuthResponse,
  UserSettings,
} from '@/types/models';

const permissionsFrom = (raw: unknown): string[] | undefined => {
  const record = isRecord(raw) ? raw : {};
  const values = Array.isArray(record.permissions)
    ? record.permissions
    : Array.isArray(record.resourcePermissions)
      ? record.resourcePermissions
      : undefined;
  return values?.map((item) => asString(item)).filter(Boolean);
};

export const normalizeUser = (raw: unknown): User => {
  const sharedUser = normalizeSharedUser(raw as Parameters<typeof normalizeSharedUser>[0]);
  return {
    id: sharedUser.id,
    username: sharedUser.username,
    nickname: sharedUser.nickname,
    avatar: sharedUser.avatar,
    email: sharedUser.email,
    phone: sharedUser.phone,
    gender: sharedUser.gender,
    birthday: sharedUser.birthday,
    signature: sharedUser.signature,
    region: sharedUser.location,
    status: sharedUser.status,
    permissions: permissionsFrom(raw),
  };
};

export const normalizeAuthResponse = (raw: unknown): UserAuthResponse => {
  const record = isRecord(raw) ? raw : {};
  const sharedResponse = normalizeUserAuthResponse(raw);
  const user = record.user ? normalizeUser(record.user) : undefined;
  return {
    success: sharedResponse.success,
    message: sharedResponse.message,
    token: sharedResponse.token || asString(record.token),
    accessToken: asString(record.accessToken ?? record.access_token),
    user,
    permissions: sharedResponse.permissions || permissionsFrom(raw),
  };
};

export const normalizeSettings = (raw: unknown): UserSettings => {
  const settings = isRecord(raw) ? normalizeUserSettings(raw) : defaultUserSettings();
  return {
    privacy: { ...settings.privacy },
    message: { ...settings.message },
    general: { ...settings.general },
  };
};

export const normalizeFriendship = (raw: unknown): Friendship => {
  const friend = normalizeSharedFriendship(raw);
  return {
    friendId: friend.friendId,
    username: friend.username,
    nickname: friend.nickname,
    remark: friend.remark,
    avatar: friend.avatar,
    online: Boolean(friend.isOnline),
    status: friend.isOnline ? 'online' : undefined,
  };
};

export const normalizeFriendRequest = (raw: unknown): FriendRequest => {
  const request = normalizeSharedFriendRequest(raw);
  return {
    requestId: request.id,
    fromUserId: request.applicantId,
    toUserId: request.targetUserId,
    username: request.applicantUsername,
    nickname: request.applicantNickname,
    avatar: request.applicantAvatar,
    reason: request.reason,
    status: request.status,
    createdAt: request.createTime,
  };
};

export const normalizeGroup = (raw: unknown): Group => {
  const group = normalizeSharedGroup(raw);
  return {
    id: group.id,
    groupName: group.groupName,
    name: group.name,
    avatar: group.avatar,
    announcement: group.announcement || group.description,
    ownerId: group.ownerId,
    memberCount: group.memberCount,
    lastMessageTime: group.lastMessageTime,
    lastActivityAt: group.lastActivityAt,
  };
};

export const normalizeGroupMember = (raw: unknown): GroupMember => {
  const member = normalizeSharedGroupMember(raw);
  return {
    userId: member.userId,
    username: member.username,
    nickname: member.nickname,
    avatar: member.avatar,
    role: member.role,
    online: member.online,
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
