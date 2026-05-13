import { PUSH_ENDPOINTS } from '@im/shared-api-contract';
import { STORAGE_KEYS } from '@/constants/config';
import { http } from '@/services/api/httpClient';
import { deviceInfo } from '@/services/platform/deviceInfo';
import { kvStorage } from '@/services/storage/kvStorage';
import { logger } from '@/utils/logger';

export interface PushSettings {
  enabled: boolean;
  soundEnabled: boolean;
  showPreview: boolean;
  mutedConversationIds: string[];
  androidChannelPolicy?: {
    messages?: string;
    friendEvents?: string;
    system?: string;
  };
}

interface RegisterDeviceResponse {
  deviceId: string;
  registered: boolean;
  tokenVersion?: number;
}

interface UpdateDeviceTokenResponse {
  updated: boolean;
  tokenVersion?: number;
}

const DEFAULT_PUSH_SETTINGS: PushSettings = {
  enabled: true,
  soundEnabled: true,
  showPreview: true,
  mutedConversationIds: [],
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const response = 'response' in error ? (error as { response?: { status?: unknown } }).response : undefined;
  return typeof response?.status === 'number' ? response.status : undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const getRuntimeLocale = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
};

const getRuntimeTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const normalizeSettings = (raw: Partial<PushSettings> | null | undefined): PushSettings => ({
  enabled: raw?.enabled !== false,
  soundEnabled: raw?.soundEnabled !== false,
  showPreview: raw?.showPreview !== false,
  mutedConversationIds: Array.isArray(raw?.mutedConversationIds)
    ? raw.mutedConversationIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [],
  androidChannelPolicy: raw?.androidChannelPolicy,
});

const persistSettings = (settings: PushSettings) => {
  kvStorage.setJson(STORAGE_KEYS.pushSettings, settings);
  kvStorage.setBoolean('notification.enabled', settings.enabled);
  kvStorage.setBoolean('sound.enabled', settings.soundEnabled);
};

const warnPushFailure = (action: string, error: unknown) => {
  logger.warn('push-device', `${action} failed`, {
    status: getErrorStatus(error),
    error: getErrorMessage(error),
  });
};

const buildDevicePayload = async (fcmToken: string) => {
  const summary = await deviceInfo.getDeviceSummary();
  return {
    deviceId: summary.uniqueId || 'unknown-device',
    platform: summary.platform === 'ios' ? 'IOS' : 'ANDROID',
    fcmToken,
    appVersion: summary.appVersion || '0.0.1',
    deviceModel: summary.model || summary.brand || 'unknown',
    osVersion: summary.systemVersion || summary.version || 'unknown',
    locale: getRuntimeLocale(),
    timezone: getRuntimeTimezone(),
  };
};

export const pushDeviceService = {
  getCachedSettings(): PushSettings {
    return normalizeSettings(kvStorage.getJson<PushSettings | null>(STORAGE_KEYS.pushSettings, DEFAULT_PUSH_SETTINGS));
  },

  async registerDevice(fcmToken: string): Promise<RegisterDeviceResponse | null> {
    if (!fcmToken) {
      return null;
    }
    const payload = await buildDevicePayload(fcmToken);
    const response = await http.post<RegisterDeviceResponse>(PUSH_ENDPOINTS.REGISTER_DEVICE, payload);
    kvStorage.setString(STORAGE_KEYS.fcmToken, fcmToken);
    return response.data;
  },

  async unregisterDevice(reason = 'LOGOUT'): Promise<boolean> {
    const payload = await buildDevicePayload(kvStorage.getString(STORAGE_KEYS.fcmToken));
    const response = await http.post<boolean>(PUSH_ENDPOINTS.UNREGISTER_DEVICE, {
      deviceId: payload.deviceId,
      fcmToken: payload.fcmToken || undefined,
      reason,
    });
    return response.data === true;
  },

  async updateDeviceToken(newToken: string): Promise<UpdateDeviceTokenResponse | null> {
    if (!newToken) {
      return null;
    }
    const payload = await buildDevicePayload(newToken);
    const oldToken = kvStorage.getString(STORAGE_KEYS.fcmToken);
    kvStorage.setString(STORAGE_KEYS.fcmToken, newToken);
    const response = await http.put<UpdateDeviceTokenResponse>(PUSH_ENDPOINTS.UPDATE_DEVICE_TOKEN, {
      deviceId: payload.deviceId,
      ...(oldToken ? { oldToken } : {}),
      newToken,
    });
    return response.data;
  },

  async getSettings(): Promise<PushSettings> {
    const response = await http.get<PushSettings>(PUSH_ENDPOINTS.SETTINGS);
    const settings = normalizeSettings(response.data);
    persistSettings(settings);
    return settings;
  },

  async updateSettings(patch: Partial<PushSettings>): Promise<PushSettings> {
    const nextSettings = normalizeSettings({
      ...pushDeviceService.getCachedSettings(),
      ...patch,
    });
    await http.put<boolean>(PUSH_ENDPOINTS.SETTINGS, nextSettings);
    persistSettings(nextSettings);
    return nextSettings;
  },

  logOptionalFailure(action: string, error: unknown): void {
    warnPushFailure(action, error);
  },
};
