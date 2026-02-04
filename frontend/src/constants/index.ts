// 应用常量定义

// 消息类型常量
export const MESSAGE_TYPES = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  FILE: "FILE",
  VOICE: "VOICE", // 修改为VOICE以匹配后端类型定义
  VIDEO: "VIDEO",
  SYSTEM: "SYSTEM",
} as const;

// 消息状态常量
export const MESSAGE_STATUS = {
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  READ: "READ",
  RECALLED: "RECALLED",
  DELETED: "DELETED",
} as const;

// 会话类型常量
export const CONVERSATION_TYPES = {
  PRIVATE: "PRIVATE",
  GROUP: "GROUP",
} as const;

// 用户状态常量
export const USER_STATUS = {
  ONLINE: "online",
  OFFLINE: "offline",
  AWAY: "away",
  BUSY: "busy",
} as const;

// 文件类型常量
export const FILE_TYPES = {
  IMAGE: ["jpg", "jpeg", "png", "gif", "webp", "svg"],
  VIDEO: ["mp4", "avi", "mov", "wmv", "flv", "webm"],
  AUDIO: ["mp3", "wav", "ogg", "aac", "flac"],
  DOCUMENT: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"],
} as const;

// 文件大小限制（字节）
export const FILE_SIZE_LIMITS = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  VIDEO: 100 * 1024 * 1024, // 100MB
  AUDIO: 20 * 1024 * 1024, // 20MB
  DOCUMENT: 50 * 1024 * 1024, // 50MB
} as const;

// 群组类型常量
export const GROUP_TYPES = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
} as const;

// 群组角色常量
export const GROUP_ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;

// 分页默认配置
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_SIZE: 20,
  MESSAGE_SIZE: 50,
  MAX_SIZE: 100,
} as const;

// WebSocket事件类型
export const WS_EVENTS = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  MESSAGE: "message",
  TYPING: "typing",
  USER_ONLINE: "user_online",
  USER_OFFLINE: "user_offline",
  HEARTBEAT: "heartbeat",
} as const;

// 本地存储键名
export const STORAGE_KEYS = {
  TOKEN: "access_token",
  REFRESH_TOKEN: "refresh_token",
  USER_INFO: "user_info",
  CHAT_SETTINGS: "chat_settings",
  THEME: "theme",
} as const;

// API响应状态码
export const API_CODES = {
  SUCCESS: 200,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;

// 时间格式
export const DATE_FORMATS = {
  FULL: "YYYY-MM-DD HH:mm:ss",
  DATE: "YYYY-MM-DD",
  TIME: "HH:mm:ss",
  DATETIME: "MM-DD HH:mm",
  CHAT_TIME: "HH:mm",
} as const;
