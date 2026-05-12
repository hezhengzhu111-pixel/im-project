// 认证相关工具函数

import {STORAGE_KEYS} from "@/constants";
import {
  isTokenExpired as isTokenExpiredCore,
  getUserIdFromToken as getUserIdFromTokenCore,
  getUserRolesFromToken as getUserRolesFromTokenCore,
} from "@im/shared-auth-core";
import {
  validateEmail as validateEmailCore,
  validatePhone as validatePhoneCore,
  validateUsername as validateUsernameCore,
  validatePasswordStrength as validatePasswordStrengthCore,
  maskSensitiveInfo as maskSensitiveInfoCore,
} from "@im/shared-utils";

// Token存储键名
const TOKEN_KEY = STORAGE_KEYS.TOKEN;
const REFRESH_TOKEN_KEY = STORAGE_KEYS.REFRESH_TOKEN;
const USER_INFO_KEY = STORAGE_KEYS.USER_INFO;

/**
 * 获取访问令牌
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 设置访问令牌
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * 移除访问令牌
 */
export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 获取刷新令牌
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * 设置刷新令牌
 */
export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

/**
 * 移除刷新令牌
 */
export function removeRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * 获取用户信息
 */
export function getUserInfo(): any | null {
  const userInfo = localStorage.getItem(USER_INFO_KEY);
  return userInfo ? JSON.parse(userInfo) : null;
}

/**
 * 设置用户信息
 */
export function setUserInfo(userInfo: any): void {
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
}

/**
 * 移除用户信息
 */
export function removeUserInfo(): void {
  localStorage.removeItem(USER_INFO_KEY);
}

/**
 * 清除所有认证信息
 */
export function clearAuth(): void {
  removeToken();
  removeRefreshToken();
  removeUserInfo();
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(): boolean {
  return !!getToken();
}

/**
 * 检查Token是否过期
 */
export function isTokenExpired(token?: string): boolean {
  const tokenToCheck = token || getToken();
  if (!tokenToCheck) return true;
  return isTokenExpiredCore(tokenToCheck);
}

/**
 * 从Token中获取用户ID
 */
export function getUserIdFromToken(token?: string): string | null {
  const tokenToCheck = token || getToken();
  if (!tokenToCheck) return null;
  return getUserIdFromTokenCore(tokenToCheck);
}

/**
 * 从Token中获取用户角色
 */
export function getUserRolesFromToken(token?: string): string[] {
  const tokenToCheck = token || getToken();
  if (!tokenToCheck) return [];
  return getUserRolesFromTokenCore(tokenToCheck);
}

/**
 * 检查用户是否有指定权限
 */
export function hasPermission(permission: string, token?: string): boolean {
  const roles = getUserRolesFromToken(token);
  return roles.includes(permission) || roles.includes("ADMIN");
}

/**
 * 检查用户是否有任一权限
 */
export function hasAnyPermission(
  permissions: string[],
  token?: string,
): boolean {
  return permissions.some((permission) => hasPermission(permission, token));
}

/**
 * 检查用户是否有所有权限
 */
export function hasAllPermissions(
  permissions: string[],
  token?: string,
): boolean {
  return permissions.every((permission) => hasPermission(permission, token));
}

/**
 * 格式化Token用于HTTP请求头
 */
export function formatTokenForHeader(token?: string): string {
  const tokenToFormat = token || getToken();
  return tokenToFormat ? `Bearer ${tokenToFormat}` : "";
}

/**
 * 生成随机状态字符串（用于OAuth等）
 */
export function generateState(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/**
 * 验证密码强度（委托给 @im/shared-utils）
 */
export const validatePasswordStrength = validatePasswordStrengthCore;

/**
 * 验证邮箱格式（委托给 @im/shared-utils）
 */
export const validateEmail = validateEmailCore;

/**
 * 验证手机号格式（中国大陆，委托给 @im/shared-utils）
 */
export const validatePhone = validatePhoneCore;

/**
 * 验证用户名格式（委托给 @im/shared-utils）
 */
export const validateUsername = validateUsernameCore;

/**
 * 脱敏处理（委托给 @im/shared-utils）
 */
export const maskSensitiveInfo = maskSensitiveInfoCore;

/**
 * 安全相关常量
 */
export const AUTH_CONSTANTS = {
  // Token过期时间（毫秒）
  TOKEN_EXPIRE_TIME: 24 * 60 * 60 * 1000, // 24小时

  // 刷新Token过期时间（毫秒）
  REFRESH_TOKEN_EXPIRE_TIME: 7 * 24 * 60 * 60 * 1000, // 7天

  // 密码最小长度
  PASSWORD_MIN_LENGTH: 8,

  // 密码最大长度
  PASSWORD_MAX_LENGTH: 128,

  // 用户名最小长度
  USERNAME_MIN_LENGTH: 3,

  // 用户名最大长度
  USERNAME_MAX_LENGTH: 20,

  // 登录失败最大尝试次数
  MAX_LOGIN_ATTEMPTS: 5,

  // 账户锁定时间（毫秒）
  ACCOUNT_LOCK_TIME: 30 * 60 * 1000, // 30分钟
} as const;
