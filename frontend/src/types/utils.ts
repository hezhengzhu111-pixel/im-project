/**
 * 类型守卫和工具类型
 */

import type { Message } from './message';
import type { User } from './user';
import type { ApiResponse } from './api';

/**
 * 判断对象是否为 Message 类型
 */
export function isMessage(obj: unknown): obj is Message {
  if (!obj || typeof obj !== 'object') return false;
  const msg = obj as Record<string, unknown>;
  return (
    'id' in msg &&
    'senderId' in msg &&
    'messageType' in msg &&
    'content' in msg &&
    'sendTime' in msg
  );
}

/**
 * 判断对象是否为 User 类型
 */
export function isUser(obj: unknown): obj is User {
  if (!obj || typeof obj !== 'object') return false;
  const user = obj as Record<string, unknown>;
  return 'id' in user && 'username' in user && 'nickname' in user;
}

/**
 * 判断对象是否为 ApiResponse 类型
 */
export function isApiResponse<T = unknown>(obj: unknown): obj is ApiResponse<T> {
  if (!obj || typeof obj !== 'object') return false;
  const resp = obj as Record<string, unknown>;
  return 'code' in resp && 'message' in resp && 'data' in resp;
}

/**
 * 将指定属性变为可选
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * 将指定属性变为必选
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * 深度可选
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * 非空类型
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * 获取函数参数类型
 */
export type Parameters<T extends (...args: unknown[]) => unknown> = T extends (
  ...args: infer P
) => unknown
  ? P
  : never;

/**
 * 获取函数返回类型
 */
export type ReturnType<T extends (...args: unknown[]) => unknown> = T extends (
  ...args: unknown[]
) => infer R
  ? R
  : never;
