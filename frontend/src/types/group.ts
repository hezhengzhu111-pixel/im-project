// 群组相关类型定义

// 群组实体
export interface Group {
  id: string;
  name?: string;
  groupName: string;
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
  status: GroupStatus;
}

// 群组状态
export type GroupStatus = "NORMAL" | "DISABLED" | "DELETED";

// 群组成员
export interface GroupMember {
  userId: string;
  username: string;
  nickname: string;
  avatar: string;
  role: string;
  joinTime: string;
}

// 群组角色
export type GroupRole = "OWNER" | "ADMIN" | "MEMBER";

// 创建群组请求
export interface CreateGroupRequest {
  name: string;
  type?: number;
  announcement?: string;
  memberIds?: string[];
}

// 更新群组请求
export interface UpdateGroupRequest {
  groupName?: string;
  description?: string;
  avatar?: string;
}
