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
    ...sharedUser,
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
  return isRecord(raw) ? normalizeUserSettings(raw) : defaultUserSettings();
};

export const normalizeFriendship = (raw: unknown): Friendship => {
  return normalizeSharedFriendship(raw);
};

export const normalizeFriendRequest = (raw: unknown): FriendRequest => {
  return normalizeSharedFriendRequest(raw);
};

export const normalizeGroup = (raw: unknown): Group => {
  return normalizeSharedGroup(raw);
};

export const normalizeGroupMember = (raw: unknown): GroupMember => {
  return normalizeSharedGroupMember(raw);
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
