import type {
  Group,
  GroupMember,
  RawGroupDTO,
  RawGroupMemberDTO,
} from "@im/shared-types";
import {
  asNumber,
  asString,
  isRawGroup,
  isRawGroupMember,
  isRecord,
} from "@im/shared-types";

const normalizeMemberRole = (role: unknown): GroupMember["role"] => {
  if (role === 3 || role === "3" || role === "OWNER") return "OWNER";
  if (role === 2 || role === "2" || role === "ADMIN") return "ADMIN";
  return "MEMBER";
};

export const normalizeGroup = (raw: RawGroupDTO | Group | unknown): Group => {
  const record = isRawGroup(raw) ? raw : {};
  const looseRecord = isRecord(raw) ? raw : {};
  const groupName = asString(record.groupName ?? looseRecord.group_name ?? record.name);
  return {
    id: asString(record.id ?? looseRecord.groupId ?? looseRecord.group_id),
    name: asString(record.name) || undefined,
    groupName,
    description:
      asString(record.description ?? record.announcement) || undefined,
    announcement: asString(record.announcement) || undefined,
    type: record.type,
    avatar: asString(record.avatar) || undefined,
    ownerId: asString(record.ownerId ?? looseRecord.owner_id),
    memberCount: asNumber(record.memberCount ?? looseRecord.member_count, 0),
    maxMembers: Number.isFinite(asNumber(record.maxMembers, Number.NaN))
      ? asNumber(record.maxMembers)
      : undefined,
    status: record.status,
    unreadCount: Number.isFinite(asNumber(record.unreadCount, Number.NaN))
      ? asNumber(record.unreadCount)
      : undefined,
    lastMessageTime: asString(record.lastMessageTime) || undefined,
    lastActivityAt: asString(record.lastActivityAt) || undefined,
    createTime: asString(record.createTime),
  };
};

export const normalizeGroupMember = (
  raw: RawGroupMemberDTO | GroupMember | unknown,
): GroupMember => {
  const record: RawGroupMemberDTO = isRawGroupMember(raw) ? raw : {};
  const looseRecord = isRecord(raw) ? raw : {};
  return {
    id: asString(record.id) || undefined,
    groupId: asString(record.groupId ?? looseRecord.group_id) || undefined,
    userId: asString(record.userId ?? looseRecord.user_id ?? record.id),
    username: asString(record.username) || undefined,
    nickname: asString(record.nickname) || undefined,
    avatar: asString(record.avatar) || undefined,
    role: normalizeMemberRole(record.role),
    joinTime: asString(record.joinTime),
  };
};
