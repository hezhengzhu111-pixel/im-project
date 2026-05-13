import { createMMKV, type MMKV } from 'react-native-mmkv';
import { STORAGE_KEYS } from '@/constants/config';
import { logger } from '@/utils/logger';

type JsonValue = unknown;

const memory = new Map<string, string>();

let nativeStorage: MMKV | null = null;

const storage = (): MMKV | null => {
  if (nativeStorage) {
    return nativeStorage;
  }
  try {
    nativeStorage = createMMKV({ id: 'im-mobile-kv' });
  } catch (error) {
    logger.warn('kv-storage', 'MMKV unavailable; memory fallback active', error);
    nativeStorage = null;
  }
  return nativeStorage;
};

export const kvStorage = {
  setString(key: string, value: string): void {
    memory.set(key, value);
    storage()?.set(key, value);
  },

  getString(key: string, fallback = ''): string {
    const value = storage()?.getString(key);
    return value ?? memory.get(key) ?? fallback;
  },

  setBoolean(key: string, value: boolean): void {
    memory.set(key, String(value));
    storage()?.set(key, value);
  },

  getBoolean(key: string, fallback = false): boolean {
    const value = storage()?.getBoolean(key);
    if (typeof value === 'boolean') {
      return value;
    }
    const raw = memory.get(key);
    return raw == null ? fallback : raw === 'true';
  },

  setJson(key: string, value: JsonValue): void {
    this.setString(key, JSON.stringify(value));
  },

  getJson<T>(key: string, fallback: T): T {
    const raw = this.getString(key);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.remove(key);
      return fallback;
    }
  },

  remove(key: string): void {
    memory.delete(key);
    storage()?.remove(key);
  },

  clearVolatileCache(): void {
    [
      STORAGE_KEYS.currentSessionId,
      STORAGE_KEYS.drafts,
      STORAGE_KEYS.wsCache,
      STORAGE_KEYS.fcmToken,
      STORAGE_KEYS.lastSyncAt,
    ].forEach((key) => this.remove(key));
  },

  clearSessionScope(options?: { preserveFcmToken?: boolean }): void {
    const preserveFcmToken = options?.preserveFcmToken !== false;
    [
      STORAGE_KEYS.userSnapshot,
      STORAGE_KEYS.currentSessionId,
      STORAGE_KEYS.drafts,
      STORAGE_KEYS.wsCache,
      STORAGE_KEYS.lastSyncAt,
    ].forEach((key) => this.remove(key));
    if (!preserveFcmToken) {
      this.remove(STORAGE_KEYS.fcmToken);
    }
  },
};
