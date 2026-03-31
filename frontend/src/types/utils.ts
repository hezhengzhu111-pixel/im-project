import type { ApiResponse } from "./api";
import type { RawConversationDTO, ChatSession } from "./chat";
import type { RawGroupDTO, RawGroupMemberDTO, Group, GroupMember } from "./group";
import type { RawMessageDTO, Message } from "./message";
import type {
  FriendRequest,
  Friendship,
  RawUserDTO,
  User,
  UserSettings,
} from "./user";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return fallback;
}

/**
 * 判断对象是否为 Message 类型
 */
export function isRawMessage(obj: unknown): obj is RawMessageDTO {
  return isRecord(obj);
}

export function isMessage(obj: unknown): obj is Message {
  if (!isRecord(obj)) return false;
  const msg = obj as Record<string, unknown>;
  return (
    typeof msg.id === "string" &&
    typeof msg.senderId === "string" &&
    typeof msg.messageType === "string" &&
    typeof msg.content === "string" &&
    typeof msg.sendTime === "string"
  );
}

export function isRawUser(obj: unknown): obj is RawUserDTO {
  return isRecord(obj);
}

export function isUser(obj: unknown): obj is User {
  if (!isRecord(obj)) return false;
  const user = obj as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    typeof user.nickname === "string"
  );
}

export function isApiResponse<T = unknown>(obj: unknown): obj is ApiResponse<T> {
  if (!isRecord(obj)) return false;
  const resp = obj as Record<string, unknown>;
  return "code" in resp && "message" in resp && "data" in resp;
}

export function isFriendship(obj: unknown): obj is Friendship {
  if (!isRecord(obj)) return false;
  return (
    typeof obj.id === "string" &&
    typeof obj.friendId === "string" &&
    typeof obj.username === "string"
  );
}

export function isFriendRequest(obj: unknown): obj is FriendRequest {
  if (!isRecord(obj)) return false;
  return (
    typeof obj.id === "string" &&
    typeof obj.applicantId === "string" &&
    typeof obj.applicantUsername === "string" &&
    typeof obj.status === "string"
  );
}

export function isRawGroup(obj: unknown): obj is RawGroupDTO {
  return isRecord(obj);
}

export function isGroup(obj: unknown): obj is Group {
  if (!isRecord(obj)) return false;
  return typeof obj.id === "string" && typeof obj.ownerId === "string";
}

export function isRawGroupMember(obj: unknown): obj is RawGroupMemberDTO {
  return isRecord(obj);
}

export function isGroupMember(obj: unknown): obj is GroupMember {
  if (!isRecord(obj)) return false;
  return typeof obj.userId === "string" && typeof obj.role === "string";
}

export function isRawConversation(obj: unknown): obj is RawConversationDTO {
  return isRecord(obj);
}

export function isChatSession(obj: unknown): obj is ChatSession {
  if (!isRecord(obj)) return false;
  return (
    typeof obj.id === "string" &&
    typeof obj.targetId === "string" &&
    typeof obj.targetName === "string"
  );
}

export function isUserSettings(obj: unknown): obj is UserSettings {
  if (!isRecord(obj)) return false;
  return (
    isRecord(obj.general) &&
    isRecord(obj.privacy) &&
    isRecord(obj.message) &&
    isRecord(obj.notifications)
  );
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
