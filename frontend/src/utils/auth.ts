// 认证相关工具函数

import { STORAGE_KEYS } from "@/constants";

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

  try {
    // 解析JWT token
    const payload = JSON.parse(atob(tokenToCheck.split(".")[1]));
    const currentTime = Math.floor(Date.now() / 1000);

    // 检查是否过期（提前5分钟判断为过期）
    return payload.exp < currentTime + 300;
  } catch (error) {
    console.error("Token解析失败:", error);
    return true;
  }
}

/**
 * 从Token中获取用户ID
 */
export function getUserIdFromToken(token?: string): string | null {
  const tokenToCheck = token || getToken();
  if (!tokenToCheck) return null;

  try {
    const payload = JSON.parse(atob(tokenToCheck.split(".")[1]));
    return payload.sub || payload.userId || payload.id || null;
  } catch (error) {
    console.error("Token解析失败:", error);
    return null;
  }
}

/**
 * 从Token中获取用户角色
 */
export function getUserRolesFromToken(token?: string): string[] {
  const tokenToCheck = token || getToken();
  if (!tokenToCheck) return [];

  try {
    const payload = JSON.parse(atob(tokenToCheck.split(".")[1]));
    return payload.roles || payload.authorities || [];
  } catch (error) {
    console.error("Token解析失败:", error);
    return [];
  }
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
 * 验证密码强度
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // 长度检查
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push("密码长度至少8位");
  }

  // 包含小写字母
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push("密码应包含小写字母");
  }

  // 包含大写字母
  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push("密码应包含大写字母");
  }

  // 包含数字
  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push("密码应包含数字");
  }

  // 包含特殊字符
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 1;
  } else {
    feedback.push("密码应包含特殊字符");
  }

  return {
    isValid: score >= 4,
    score,
    feedback,
  };
}

/**
 * 验证邮箱格式
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证手机号格式（中国大陆）
 */
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * 验证用户名格式
 */
export function validateUsername(username: string): boolean {
  // 用户名：3-20位，只能包含字母、数字、下划线
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

/**
 * 脱敏处理
 */
export const maskSensitiveInfo = {
  // 脱敏邮箱
  email(email: string): string {
    if (!email) return "";
    const [username, domain] = email.split("@");
    if (username.length <= 2) {
      return `${username[0]}***@${domain}`;
    }
    return `${username.slice(0, 2)}***${username.slice(-1)}@${domain}`;
  },

  // 脱敏手机号
  phone(phone: string): string {
    if (!phone) return "";
    return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  },

  // 脱敏身份证号
  idCard(idCard: string): string {
    if (!idCard) return "";
    return idCard.replace(/(\d{6})\d{8}(\d{4})/, "$1********$2");
  },
};

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
