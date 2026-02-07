/**
 * WebSocket配置管理
 * 统一管理WebSocket连接地址和相关配置
 */

// WebSocket配置接口
export interface WebSocketConfig {
  baseUrl: string;
  reconnectAttempts: number;
  reconnectInterval: number;
  heartbeatInterval: number;
  connectionTimeout: number;
}

// 默认配置
const DEFAULT_CONFIG: WebSocketConfig = {
  baseUrl: "",
  reconnectAttempts: 5,
  reconnectInterval: 1000,
  heartbeatInterval: 30000,
  connectionTimeout: 10000,
};

/**
 * 获取WebSocket配置
 * 优先使用环境变量，如果没有则使用默认配置
 */
export function getWebSocketConfig(): WebSocketConfig {
  const defaultBaseUrl = (() => {
    if (typeof window === "undefined") {
      return "ws://127.0.0.1:8080";
    }
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}`;
  })();
  const config: WebSocketConfig = {
    baseUrl:
      import.meta.env.VITE_WS_BASE_URL ||
      DEFAULT_CONFIG.baseUrl ||
      defaultBaseUrl,
    reconnectAttempts: DEFAULT_CONFIG.reconnectAttempts,
    reconnectInterval: DEFAULT_CONFIG.reconnectInterval,
    heartbeatInterval: DEFAULT_CONFIG.heartbeatInterval,
    connectionTimeout: DEFAULT_CONFIG.connectionTimeout,
  };

  console.log("WebSocket配置:", config);
  return config;
}

/**
 * 构建WebSocket连接URL
 * @param userId 用户ID
 * @returns 完整的WebSocket连接URL
 */
export function buildWebSocketUrl(userId: string): string {
  const config = getWebSocketConfig();
  const url = `${config.baseUrl}/websocket/${userId}`;
  console.log("构建WebSocket URL:", url);
  return url;
}

/**
 * 验证WebSocket URL格式
 * @param url WebSocket URL
 * @returns 是否为有效的WebSocket URL
 */
export function isValidWebSocketUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "ws:" || urlObj.protocol === "wss:";
  } catch {
    return false;
  }
}

/**
 * WebSocket连接状态枚举
 */
export enum WebSocketStatus {
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  RECONNECTING = "reconnecting",
  ERROR = "error",
}

/**
 * WebSocket事件类型
 */
export enum WebSocketEventType {
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  MESSAGE = "message",
  ERROR = "error",
  HEARTBEAT = "heartbeat",
}

export default {
  getWebSocketConfig,
  buildWebSocketUrl,
  isValidWebSocketUrl,
  WebSocketStatus,
  WebSocketEventType,
};
