export interface WebSocketConfig {
  baseUrl: string;
  reconnectAttempts: number;
  reconnectInterval: number;
  heartbeatInterval: number;
  connectionTimeout: number;
}

const DEFAULT_CONFIG: WebSocketConfig = {
  baseUrl: "",
  reconnectAttempts: 5,
  reconnectInterval: 1000,
  heartbeatInterval: 30000,
  connectionTimeout: 10000,
};

export function getWebSocketConfig(): WebSocketConfig {
  const defaultBaseUrl = (() => {
    if (typeof window === "undefined") {
      return "ws://127.0.0.1:8080";
    }
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}`;
  })();

  return {
    baseUrl:
      import.meta.env.VITE_WS_BASE_URL ||
      DEFAULT_CONFIG.baseUrl ||
      defaultBaseUrl,
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
