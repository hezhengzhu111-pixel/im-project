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
