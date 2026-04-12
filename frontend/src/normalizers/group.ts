import type { Group, GroupMember, RawGroupDTO, RawGroupMemberDTO } from "@/types";
import { asNumber, asString, isRawGroup, isRawGroupMember } from "@/types/utils";

const normalizeMemberRole = (role: unknown): GroupMember["role"] => {
  if (role === 3 || role === "3" || role === "OWNER") return "OWNER";
  if (role === 2 || role === "2" || role === "ADMIN") return "ADMIN";
  return "MEMBER";
};

export const normalizeGroup = (raw: RawGroupDTO | Group | unknown): Group => {
  const record = isRawGroup(raw) ? raw : {};
  const groupName = asString(record.groupName ?? record.name);
  return {
    id: asString(record.id),
    name: asString(record.name) || undefined,
    groupName,
    description: asString(record.description ?? record.announcement) || undefined,
    announcement: asString(record.announcement) || undefined,
    type: record.type,
    avatar: asString(record.avatar) || undefined,
    ownerId: asString(record.ownerId),
    memberCount: asNumber(record.memberCount, 0),
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
  return {
    id: asString(record.id) || undefined,
    groupId: asString(record.groupId) || undefined,
    userId: asString(record.userId),
    username: asString(record.username) || undefined,
    nickname: asString(record.nickname) || undefined,
    avatar: asString(record.avatar) || undefined,
    role: normalizeMemberRole(record.role),
    joinTime: asString(record.joinTime),
  };
};
