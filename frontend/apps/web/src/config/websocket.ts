import { WS_CONFIG } from "@/config";

export interface WebSocketConfig {
  baseUrl: string;
  reconnectAttempts: number;
  reconnectInterval: number;
  heartbeatInterval: number;
  connectionTimeout: number;
}

const DEFAULT_CONFIG: WebSocketConfig = {
  baseUrl: WS_CONFIG.BASE_URL,
  reconnectAttempts: WS_CONFIG.RECONNECT_ATTEMPTS,
  reconnectInterval: WS_CONFIG.RECONNECT_INTERVAL,
  heartbeatInterval: WS_CONFIG.HEARTBEAT_INTERVAL,
  connectionTimeout: WS_CONFIG.CONNECTION_TIMEOUT,
};

export function getWebSocketConfig(): WebSocketConfig {
  return {
    baseUrl: WS_CONFIG.BASE_URL || DEFAULT_CONFIG.baseUrl,
    reconnectAttempts: DEFAULT_CONFIG.reconnectAttempts,
    reconnectInterval: DEFAULT_CONFIG.reconnectInterval,
    heartbeatInterval: DEFAULT_CONFIG.heartbeatInterval,
    connectionTimeout: DEFAULT_CONFIG.connectionTimeout,
  };
}

export function buildWebSocketUrl(userId: string): string {
  const config = getWebSocketConfig();
  return `${config.baseUrl}/websocket/${userId}`;
}

export function isValidWebSocketUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "ws:" || urlObj.protocol === "wss:";
  } catch {
    return false;
  }
}

export enum WebSocketStatus {
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  RECONNECTING = "reconnecting",
  ERROR = "error",
}

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
