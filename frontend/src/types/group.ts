/**
 * 群组相关类型定义
 */

import type { User } from './user';

/** 群组信息 */
export interface Group {
  id: string;
  name?: string;
  groupName?: string;
  description?: string;
  announcement?: string;
  type?: string | number;
  avatar?: string;
  ownerId: string;
  memberCount: number;
  maxMembers?: number;
  isPublic?: boolean;
  status?: string | number;
  unreadCount?: number;
  lastMessageTime?: string;
  lastActivityAt?: string;
  members?: Array<{ userId: string | number; role?: string | number }>;
  createTime: string;
}

/** 群组成员 */
export interface GroupMember {
  id?: string;
  groupId?: string;
  userId: string;
  userInfo?: User;
  username?: string;
  avatar?: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | string;
  nickname?: string;
  joinTime: string;
}

export interface CreateGroupRequest {
  name?: string;
  type?: number | string;
  announcement?: string;
  groupName?: string;
  description?: string;
  avatar?: string;
  memberIds?: string[];
}

export interface UpdateGroupRequest {
  groupId?: string;
  groupName?: string;
  description?: string;
  avatar?: string;
}
