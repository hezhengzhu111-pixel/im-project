import Clipboard from '@react-native-clipboard/clipboard';
import { APP_CONFIG, IS_RELEASE_RUNTIME, MOBILE_APP_ENV } from '@/constants/config';
import { debugTelemetry, type DebugErrorRecord } from '@/services/debug/debugTelemetry';
import type { MigrationStatus } from '@/services/storage/messageDatabase';
import { getWebsocketDiagnostics, useWebsocketStore } from '@/stores/websocketStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useMessageStore } from '@/stores/messageStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useUploadStore } from '@/stores/uploadStore';
import { kvStorage } from '@/services/storage/kvStorage';
import { messageDatabase } from '@/services/storage/messageDatabase';
import { messageRepository } from '@/services/storage/messageRepository';
import { notificationEventRepository } from '@/services/storage/notificationEventRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { logger, redactSensitiveValue } from '@/utils/logger';
import { getMobileE2eeCapability, type MobileE2eeCapability } from '@/e2ee/e2eeCapability';

export interface DebugDiagnosticsSnapshot {
  appEnv: string;
  apiBaseUrl: string;
  wsBaseUrl: string;
  currentUserId: string;
  websocketStatus: string;
  reconnectAttempts: number;
  storageMode: 'unknown' | 'sqlite' | 'memory';
  persistenceAvailable: boolean;
  schemaVersion: number | null;
  targetSchemaVersion: number;
  migrationStatus: MigrationStatus;
  lastMigrationError: string;
  sessionCount: number;
  messageCount: number;
  pendingCount: number;
  uploadTaskCount: number;
  notificationEventCount: number;
  fcmTokenAvailable: boolean;
  e2eeCapability: MobileE2eeCapability;
  lastApiError: DebugErrorRecord | null;
  lastWsError: DebugErrorRecord | null;
  recentErrors: Array<{
    level: 'warn' | 'error';
    scope: string;
    message: string;
    createdAt: number;
  }>;
}

export const shouldEnableDebugDiagnostics = (options?: {
  isDev?: boolean;
  isReleaseRuntime?: boolean;
}): boolean => {
  const isDev =
    options?.isDev ??
    (typeof __DEV__ !== 'undefined'
      ? __DEV__
      : false);
  const isReleaseRuntime = options?.isReleaseRuntime ?? IS_RELEASE_RUNTIME;
  return Boolean(isDev) && !isReleaseRuntime;
};

export const isDebugDiagnosticsEnabled = (): boolean => shouldEnableDebugDiagnostics();

const countTableRows = (tableName: string): number => {
  if (messageDatabase.isMemoryFallback()) {
    return messageDatabase.memoryList(tableName).length;
  }
  const rows = messageDatabase.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
  const first = rows[0];
  return first ? Number(first.cnt || 0) : 0;
};

const sanitizeDiagnosticsText = (value: string): string =>
  redactSensitiveValue(value).replace(
    /\b(access[_-]?token|refresh[_-]?token|token|cookie|password|api[_-]?key|authorization|secret)\b/gi,
    '[REDACTED]',
  );

const sanitizeError = (error: DebugErrorRecord | null): DebugErrorRecord | null => {
  if (!error) {
    return null;
  }
  return {
    ...error,
    message: sanitizeDiagnosticsText(error.message),
    url: error.url ? redactSensitiveValue(error.url) : undefined,
  };
};

const recentErrorLogs = (): DebugDiagnosticsSnapshot['recentErrors'] =>
  logger
    .list()
    .filter((entry) => entry.level === 'warn' || entry.level === 'error')
    .slice(0, 10)
    .map((entry) => ({
      level: entry.level === 'error' ? 'error' : 'warn',
      scope: entry.scope,
      message: sanitizeDiagnosticsText(entry.message),
      createdAt: entry.createdAt,
    }));

export const debugDiagnosticsService = {
  getSnapshot(): DebugDiagnosticsSnapshot {
    const storageHealth = messageDatabase.getStorageHealth();
    const authState = useAuthStore.getState();
    const websocketState = getWebsocketDiagnostics();
    const notificationState = useNotificationStore.getState();
    return {
      appEnv: MOBILE_APP_ENV,
      apiBaseUrl: APP_CONFIG.API_BASE_URL,
      wsBaseUrl: APP_CONFIG.WS_BASE_URL,
      currentUserId: authState.currentUser?.id || '',
      websocketStatus: websocketState.status,
      reconnectAttempts: websocketState.reconnectAttempts,
      storageMode: storageHealth.mode as 'unknown' | 'sqlite' | 'memory',
      persistenceAvailable: storageHealth.persistenceAvailable,
      schemaVersion: storageHealth.schemaVersion,
      targetSchemaVersion: storageHealth.targetSchemaVersion,
      migrationStatus: storageHealth.migrationStatus,
      lastMigrationError: storageHealth.lastMigrationError,
      sessionCount: countTableRows('mobile_sessions'),
      messageCount: countTableRows('mobile_messages'),
      pendingCount: pendingMessageRepository.countAll(),
      uploadTaskCount: uploadTaskRepository.listPending().length,
      notificationEventCount: countTableRows('mobile_notification_events'),
      fcmTokenAvailable: Boolean(notificationState.fcmToken || kvStorage.getString('im.mobile.fcm-token')),
      e2eeCapability: getMobileE2eeCapability(),
      lastApiError: sanitizeError(debugTelemetry.getLastApiError()),
      lastWsError: sanitizeError(debugTelemetry.getLastWsError()),
      recentErrors: recentErrorLogs(),
    };
  },

  exportLogs(limit?: number): string {
    return logger.exportText(limit);
  },

  copyLogs(limit?: number): void {
    Clipboard.setString(this.exportLogs(limit));
  },

  clearLocalCache(): void {
    messageRepository.clearAllCache();
    notificationEventRepository.clear();
    kvStorage.clearVolatileCache();
    useMessageStore.getState().clear();
    useUploadStore.setState({ tasks: [] });
    useNotificationStore.setState((state) => ({
      ...state,
      events: [],
    }));
    debugTelemetry.clear();
    logger.clear();
  },

  async reconnectWebsocket(): Promise<void> {
    useWebsocketStore.getState().disconnect();
    await useWebsocketStore.getState().connect();
  },

  async retryPending(): Promise<void> {
    await useChatStore.getState().retryPending();
  },
};
