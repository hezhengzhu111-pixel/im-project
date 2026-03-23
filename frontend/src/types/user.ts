/**
 * 用户相关类型定义
 */

/** 用户状态 */
export type UserStatus = 'ONLINE' | 'OFFLINE' | 'BUSY' | 'AWAY' | 'online' | 'offline' | 'busy' | 'away';

/** 用户信息 */
export interface User {
  id: string;
  userId?: string;
  username: string;
  nickname: string;
  avatar?: string;
  email?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  signature?: string;
  location?: string;
  lastSeen?: string;
  status: UserStatus;
  lastLoginTime?: string;
  createTime?: string;
}

/** 用户信息别名，向后兼容 */
export type UserInfo = User;

/** 登录请求 */
export interface LoginRequest {
  username: string;
  password: string;
}

/** 登录表单 */
export interface LoginForm extends LoginRequest {
  rememberMe?: boolean;
}

/** 注册请求 */
export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
  email?: string;
  phone?: string;
}

/** 注册表单 */
export interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreement: boolean;
  nickname?: string;
  phone?: string;
}

export interface UserDTO {
  id?: string;
  username: string;
  password?: string;
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  status?: number | string;
  createTime?: string;
  updateTime?: string;
  lastLoginTime?: string;
}

export interface UserAuthResponse {
  success: boolean;
  message: string;
  user: UserDTO;
  token: string;
  refreshToken?: string;
  expiresInMs?: number;
  refreshExpiresInMs?: number;
  imToken?: string;
}

export type UserSearchResult = UserDTO[];

export interface TokenPairDTO {
  accessToken: string;
  refreshToken: string;
  expiresInMs: number;
  refreshExpiresInMs: number;
}

export interface TokenParseResultDTO {
  valid: boolean;
  expired: boolean;
  error?: string;
  userId?: number;
  username?: string;
  issuedAtEpochMs?: number;
  expiresAtEpochMs?: number;
  jti?: string;
  tokenType?: string;
}

export type UpdateUserRequest = Partial<UserDTO>;
export type Friend = Friendship;

export interface Friendship {
  id: string;
  userId?: string;
  friendId: string;
  username: string;
  nickname?: string;
  avatar?: string;
  remark?: string;
  isOnline?: boolean;
  lastActiveTime?: string;
  createdAt?: string;
  status?: number;
  createTime?: string;
  signature?: string;
  lastSeen?: string;
}

export interface FriendRequest {
  id: string;
  applicantId: string;
  applicantUsername: string;
  applicantNickname?: string;
  applicantAvatar?: string;
  targetUserId?: string;
  targetUsername?: string;
  targetNickname?: string;
  reason?: string;
  status: string | number;
  createTime: string;
  updateTime?: string;

  // 兼容老代码
  avatar?: string;
  fromUser?: any;
  nickname?: string;
  username?: string;
  message?: string;
  senderId?: string;
  receiverId?: string;
}

export interface AddFriendRequest {
  userId: string;
  message?: string;
}

export interface HandleFriendRequestRequest {
  requestId: string;
  action: string;
}

