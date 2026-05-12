export interface RuntimeConfig {
  API_BASE_URL: string;
  WS_BASE_URL: string;
  FILE_BASE_URL: string;
}

declare global {
  var IM_MOBILE_RUNTIME_CONFIG: Partial<RuntimeConfig> | undefined;
}

const readProcessEnv = (key: keyof RuntimeConfig): string => {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  return typeof env?.[key] === 'string' ? env[key] || '' : '';
};

const runtime = globalThis.IM_MOBILE_RUNTIME_CONFIG || {};

export const APP_CONFIG: RuntimeConfig = {
  API_BASE_URL:
    runtime.API_BASE_URL ||
    readProcessEnv('API_BASE_URL') ||
    'http://10.0.2.2:8082/api',
  WS_BASE_URL:
    runtime.WS_BASE_URL ||
    readProcessEnv('WS_BASE_URL') ||
    'ws://10.0.2.2:8082',
  FILE_BASE_URL:
    runtime.FILE_BASE_URL ||
    readProcessEnv('FILE_BASE_URL') ||
    'http://10.0.2.2:8082',
};

export const STORAGE_KEYS = {
  accessToken: 'im.mobile.access-token',
  sessionMeta: 'im.mobile.session-meta',
  cookieMirror: 'im.mobile.cookie-mirror',
  userSnapshot: 'im.mobile.user-snapshot',
  settings: 'im.mobile.settings',
  currentSessionId: 'im.mobile.current-session-id',
  drafts: 'im.mobile.drafts',
  wsCache: 'im.mobile.ws-cache',
  fcmToken: 'im.mobile.fcm-token',
  lastSyncAt: 'im.mobile.last-sync-at',
} as const;

export const WS_CONFIG = {
  heartbeatIntervalMs: 25_000,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxAttempts: 8,
} as const;

export const RETRY_CONFIG = {
  maxRetryCount: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
} as const;
