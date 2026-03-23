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
  unreadCount?: number;
  lastMessageTime?: string;
  lastActivityAt?: string;
  members?: Array<{ userId: string | number; role?: string | number }>;
  createTime: string;
}

/** 群组成员 */
export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  userInfo: User;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  nickname?: string;
  joinTime: string;
}
