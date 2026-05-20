import * as Keychain from 'react-native-keychain';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import {
  sanitizeE2eeLogValue,
  secureRandomBytes,
} from '@im/shared-e2ee-core';
import { logger } from '@/utils/logger';

interface EncryptedEnvelope {
  version: 2;
  payload: string;
}

const KEYCHAIN_PREFIX = 'im.mobile.e2ee';
const MMKV_ID = 'im-mobile-e2ee';
const memorySecure = new Map<string, string>();
const memoryKv = new Map<string, string>();
let nativeStorage: MMKV | null | undefined;

const storage = (): MMKV | null => {
  if (nativeStorage !== undefined) {
    return nativeStorage;
  }
  try {
    nativeStorage = createMMKV({ id: MMKV_ID });
  } catch (error) {
    logger.warn('e2ee', 'MMKV unavailable for encrypted E2EE store', sanitizeE2eeLogValue(error));
    nativeStorage = null;
  }
  return nativeStorage;
};

const keychainOptions = (service: string): Keychain.BaseOptions => ({ service });

const keychainSetOptions = (service: string): Keychain.SetOptions => ({
  ...keychainOptions(service),
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});

const serviceForDeviceId = (userId: string): string => `${KEYCHAIN_PREFIX}.${userId}.deviceId`;
const serviceForKeys = (userId: string, deviceId: string): string => `${KEYCHAIN_PREFIX}.${userId}.${deviceId}.keys`;
const namespacePrefix = (userId: string, deviceId: string): string => `${KEYCHAIN_PREFIX}.${userId}.${deviceId}`;
const indexKey = (userId: string, deviceId: string): string => `${namespacePrefix(userId, deviceId)}.index`;

const setSecure = async (service: string, value: string): Promise<void> => {
  const persisted = await Keychain.setGenericPassword(service, value, keychainSetOptions(service));
  if (!persisted) {
    throw new Error(`E2EE secure storage persist failed for service ${service}`);
  }
  memorySecure.set(service, value);
};

const getSecure = async (service: string): Promise<string> => {
  const result = await Keychain.getGenericPassword(keychainOptions(service));
  if (result && typeof result.password === 'string') {
    memorySecure.set(service, result.password);
    return result.password;
  }
  return memorySecure.get(service) || '';
};

const removeSecure = async (service: string): Promise<void> => {
  // Deletion is idempotent: some Keychain platforms return false when the
  // credential is already absent. Only thrown errors indicate a failed delete.
  await Keychain.resetGenericPassword(keychainOptions(service));
  memorySecure.delete(service);
};

const getKv = (key: string): string => storage()?.getString(key) ?? memoryKv.get(key) ?? '';
const setKv = (key: string, value: string): void => {
  memoryKv.set(key, value);
  storage()?.set(key, value);
};
const removeKv = (key: string): void => {
  memoryKv.delete(key);
  storage()?.remove(key);
};

const updateIndex = (userId: string, deviceId: string, key: string): void => {
  const idxKey = indexKey(userId, deviceId);
  const raw = getKv(idxKey);
  const entries = new Set<string>();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        parsed.filter((item): item is string => typeof item === 'string').forEach((item) => entries.add(item));
      }
    } catch {
      // corrupt index is rebuilt from the current key
    }
  }
  entries.add(key);
  setKv(idxKey, JSON.stringify([...entries]));
};

const readIndex = (userId: string, deviceId: string): string[] => {
  const raw = getKv(indexKey(userId, deviceId));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const generateDeviceId = (): string => {
  const bytes = secureRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `mobile-${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
};

export const e2eeSecureStorage = {
  async getOrCreateDeviceId(userId: string): Promise<string> {
    const service = serviceForDeviceId(userId);
    const existing = await getSecure(service);
    if (existing) {
      return existing;
    }
    const deviceId = generateDeviceId();
    await setSecure(service, deviceId);
    return deviceId;
  },

  async getDeviceId(userId: string): Promise<string> {
    return getSecure(serviceForDeviceId(userId));
  },

  async setKeyMaterial(userId: string, deviceId: string, serialized: string): Promise<void> {
    await setSecure(serviceForKeys(userId, deviceId), serialized);
  },

  async getKeyMaterial(userId: string, deviceId: string): Promise<string> {
    return getSecure(serviceForKeys(userId, deviceId));
  },

  async removeKeyMaterial(userId: string, deviceId: string): Promise<void> {
    await removeSecure(serviceForKeys(userId, deviceId));
  },

  async setEncryptedJson(userId: string, deviceId: string, key: string, value: unknown): Promise<void> {
    const envelope: EncryptedEnvelope = {
      version: 2,
      payload: JSON.stringify(value),
    };
    await setSecure(key, JSON.stringify(envelope));
    updateIndex(userId, deviceId, key);
  },

  async getEncryptedJson<T>(userId: string, deviceId: string, key: string): Promise<T | null> {
    const raw = await getSecure(key);
    if (!raw) {
      return null;
    }
    try {
      const envelope = JSON.parse(raw) as Partial<EncryptedEnvelope>;
      if (envelope.version !== 2 || typeof envelope.payload !== 'string') {
        return null;
      }
      return JSON.parse(envelope.payload) as T;
    } catch (error) {
      logger.warn('e2ee', 'encrypted E2EE store read failed', sanitizeE2eeLogValue(error));
      return null;
    }
  },

  async removeEncrypted(userId: string, deviceId: string, key: string): Promise<void> {
    await removeSecure(key);
    const idxKey = indexKey(userId, deviceId);
    const next = readIndex(userId, deviceId).filter((item) => item !== key);
    setKv(idxKey, JSON.stringify(next));
  },

  async clearAccount(userId: string): Promise<void> {
    const deviceId = await this.getDeviceId(userId);
    if (!deviceId) {
      const result = await Promise.allSettled([removeSecure(serviceForDeviceId(userId))]);
      result.forEach((item) => {
        if (item.status === 'rejected') {
          logger.warn('e2ee', 'E2EE secure storage clear failed', sanitizeE2eeLogValue({
            operation: 'remove-device-id',
            error: item.reason,
          }));
        }
      });
      return;
    }
    const indexedKeys = readIndex(userId, deviceId);
    const clearResults = await Promise.allSettled([
      ...indexedKeys.map((key) => removeSecure(key)),
      removeSecure(serviceForDeviceId(userId)),
      removeSecure(serviceForKeys(userId, deviceId)),
    ]);
    clearResults.forEach((item, index) => {
      if (item.status === 'rejected') {
        logger.warn('e2ee', 'E2EE secure storage clear failed', sanitizeE2eeLogValue({
          operation: index < indexedKeys.length ? 'remove-indexed-entry' : 'remove-account-entry',
          error: item.reason,
        }));
      }
    });
    removeKv(indexKey(userId, deviceId));
  },

  namespaceKey(userId: string, deviceId: string, kind: string, id: string): string {
    return `${namespacePrefix(userId, deviceId)}.${kind}.${encodeURIComponent(id)}`;
  },
};
