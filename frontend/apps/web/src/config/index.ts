/**
 * 全局配置中心
 * 统一管理所有配置项
 */

// API配置
const trimEnv = (value?: string): string => (value || "").trim();

const stripTrailingSlashes = (value: string): string =>
  value.replace(/\/+$/, "");

const configuredGatewayAuthority = (): string => {
  const rawHost = trimEnv(import.meta.env.VITE_GATEWAY_HOST);
  if (!rawHost) {
    return "";
  }
  const host = rawHost
    .replace(/^(https?|wss?):\/\//i, "")
    .replace(/\/+$/, "");
  const port = trimEnv(import.meta.env.VITE_GATEWAY_PORT);
  if (!port || /:\d+$/.test(host)) {
    return host;
  }
  return `${host}:${port}`;
};

const isHttpsPage = (): boolean =>
  typeof window !== "undefined" && window.location.protocol === "https:";

const gatewayHttpBaseUrl = (): string => {
  const authority = configuredGatewayAuthority();
  if (!authority) {
    return "";
  }
  return `${isHttpsPage() ? "https" : "http"}://${authority}`;
};

const gatewayWsBaseUrl = (): string => {
  const authority = configuredGatewayAuthority();
  if (!authority) {
    return "";
  }
  return `${isHttpsPage() ? "wss" : "ws"}://${authority}`;
};

export const resolveApiBaseUrl = (): string => {
  const configured = stripTrailingSlashes(
    trimEnv(import.meta.env.VITE_API_BASE_URL),
  );
  if (configured && configured !== "/api") {
    return configured;
  }
  if (import.meta.env.DEV) {
    return configured || "/api";
  }
  const gatewayBaseUrl = gatewayHttpBaseUrl();
  if (gatewayBaseUrl) {
    return `${gatewayBaseUrl}/api`;
  }
  return configured || "/api";
};

export const resolveWebSocketBaseUrl = (): string => {
  const configured = stripTrailingSlashes(
    trimEnv(import.meta.env.VITE_WS_BASE_URL),
  );
  if (configured) {
    return configured;
  }
  if (import.meta.env.DEV) {
    return "";
  }
  const gatewayBaseUrl = gatewayWsBaseUrl();
  if (gatewayBaseUrl) {
    return gatewayBaseUrl;
  }
  if (typeof window === "undefined") {
    return "ws://127.0.0.1:8082";
  }
  return `${isHttpsPage() ? "wss" : "ws"}://${window.location.host}`;
};

export const API_CONFIG = {
  // 基础URL
  // 直接连接后端服务 8082
  BASE_URL: resolveApiBaseUrl(),
  // 超时时间
  TIMEOUT: 10000,
  // 重试次数
  RETRY_COUNT: 3,
  // 重试间隔
  RETRY_DELAY: 1000,
};

// WebSocket配置
export const WS_CONFIG = {
  // WebSocket基础URL
  BASE_URL: resolveWebSocketBaseUrl(),
  // 重连次数
  RECONNECT_ATTEMPTS: 5,
  // 重连间隔
  RECONNECT_INTERVAL: 1000,
  // 心跳间隔
  HEARTBEAT_INTERVAL: 30000,
  // 连接超时
  CONNECTION_TIMEOUT: 10000,
};

// 应用配置
export const APP_CONFIG = {
  // 应用名称
  NAME: "IM聊天应用",
  // 版本号
  VERSION: "2.0.0",
  // 默认头像
  DEFAULT_AVATAR: "/default-avatar.svg",
  // 默认群组头像
  DEFAULT_GROUP_AVATAR: "/default-group-avatar.svg",
  // 页面大小
  PAGE_SIZE: 20,
  // 最大文件大小 (10MB)
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  // 支持的文件类型
  SUPPORTED_FILE_TYPES: {
    IMAGE: ["jpg", "jpeg", "png", "gif", "webp"],
    VIDEO: ["mp4", "avi", "mov", "wmv"],
    AUDIO: ["mp3", "wav", "ogg", "aac"],
    DOCUMENT: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"],
  },
};

// 存储配置
export const STORAGE_CONFIG = {
  // WebSocket缓存键
  WS_CACHE_KEY: "im_ws_cache",
  // Access Token 持久化键
  ACCESS_TOKEN_KEY: "im_access_token",
  // 用户快照持久化键
  USER_SNAPSHOT_KEY: "im_user_snapshot",
  // 心跳时间戳键
  HEARTBEAT_KEY: "im_heartbeat",
  // 聊天记录缓存键
  CHAT_CACHE_KEY: "im_chat_cache",
  // 本地清空聊天记录游标键
  CHAT_CLEAR_MARKERS_KEY: "im_chat_clear_markers",
  // 设置存储键
  SETTINGS_KEY: "im_settings",
};

// 消息配置
export const MESSAGE_CONFIG = {
  // 消息类型
  TYPES: {
    TEXT: "TEXT",
    IMAGE: "IMAGE",
    FILE: "FILE",
    VOICE: "VOICE", // 修改为VOICE以匹配后端类型定义
    VIDEO: "VIDEO",
    SYSTEM: "SYSTEM",
  } as const,
  // 消息状态
  STATUS: {
    SENDING: "SENDING",
    SENT: "SENT",
    DELIVERED: "DELIVERED",
    READ: "READ",
    FAILED: "FAILED",
    OFFLINE: "OFFLINE",
    RECALLED: "RECALLED",
    DELETED: "DELETED",
  } as const,
  // 最大消息长度
  MAX_TEXT_LENGTH: 1000,
  // 消息缓存数量
  CACHE_SIZE: 100,
};

// UI配置
export const UI_CONFIG = {
  // 主题色
  PRIMARY_COLOR: "#409EFF",
  // 成功色
  SUCCESS_COLOR: "#67C23A",
  // 警告色
  WARNING_COLOR: "#E6A23C",
  // 错误色
  ERROR_COLOR: "#F56C6C",
  // 侧边栏宽度
  SIDEBAR_WIDTH: 280,
  // 聊天区域最小宽度
  CHAT_MIN_WIDTH: 400,
  // 消息气泡最大宽度
  MESSAGE_MAX_WIDTH: 400,
  // 动画持续时间
  ANIMATION_DURATION: 300,
};

// 导出所有配置
export default {
  API_CONFIG,
  WS_CONFIG,
  APP_CONFIG,
  STORAGE_CONFIG,
  MESSAGE_CONFIG,
  UI_CONFIG,
};
