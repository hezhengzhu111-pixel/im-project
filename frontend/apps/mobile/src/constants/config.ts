import { getRuntimeConfig, type RuntimeConfigSource } from './runtimeConfig';

declare global {
  var IM_MOBILE_RUNTIME_CONFIG: RuntimeConfigSource | undefined;
}

const runtimeConfig = getRuntimeConfig();

export const APP_CONFIG = {
  API_BASE_URL: runtimeConfig.API_BASE_URL,
  WS_BASE_URL: runtimeConfig.WS_BASE_URL,
  FILE_BASE_URL: runtimeConfig.FILE_BASE_URL,
};

export const MOBILE_APP_ENV = runtimeConfig.APP_ENV;
export const IS_RELEASE_RUNTIME = runtimeConfig.IS_RELEASE_BUILD;

export const STORAGE_KEYS = {
  accessToken: 'im.mobile.access-token',
  sessionMeta: 'im.mobile.session-meta',
  cookieMirror: 'im.mobile.cookie-mirror',
  userSnapshot: 'im.mobile.user-snapshot',
  settings: 'im.mobile.settings',
  pushSettings: 'im.mobile.push-settings',
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

export const RECONCILE_CONFIG = {
  /** pending.status='sending' 超过此时间视为卡死，恢复到 pending */
  staleSendingMs: 120_000,
  /** uploadTask.status='uploading' 超过此时间视为卡死，恢复到 failed 或 pending */
  staleUploadingMs: 120_000,
} as const;
