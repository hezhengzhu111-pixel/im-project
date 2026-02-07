import type { OnlineStatus } from "./index";

// 用户DTO - 对应后端UserDTO
export interface UserDTO {
  id?: string;
  password?: string;
  username: string;
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  status?: number;
  createTime?: string;
  updateTime?: string;
}

// 用户认证响应 - 对应后端UserAuthResponseDTO
export interface UserAuthResponse {
  success: boolean;
  message: string;
  user?: UserDTO;
  token?: string;
  imToken?: string;
}

// 注册请求
export interface RegisterRequest {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  phone?: string;
}

// 登录请求
export interface LoginRequest {
  username: string;
  password?: string;
  token?: string;
}

// 更新用户信息请求
export interface UpdateUserRequest {
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
}

// 用户在线状态
export interface UserOnlineStatus {
  [userId: string]: boolean;
}

// 扩展的用户接口
export interface User extends UserDTO {
  birthday?: string;
  signature?: string;
}

// 修改密码请求
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// 用户简要信息（用于好友列表等）
export interface UserBrief {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
  onlineStatus: OnlineStatus;
  lastSeen?: string;
}

// 用户搜索结果
export interface UserSearchResult {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
  signature?: string;
  isFriend: boolean;
}

// 好友关系
export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  remark?: string;
  groupName?: string;
  createTime: string;
  friend: UserBrief;
}

// 好友申请
export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createTime: string;
  updateTime: string;
  fromUser: UserBrief;
}

// 添加好友请求
export interface AddFriendRequest {
  userId: string;
  message?: string;
}

// 处理好友申请请求
export interface HandleFriendRequestRequest {
  requestId: string;
  action: "ACCEPT" | "REJECT";
  remark?: string;
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
