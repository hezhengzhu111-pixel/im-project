import * as Keychain from 'react-native-keychain';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import {
  aesGcmDecryptBytes,
  aesGcmEncryptBytes,
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  randomAes256Key,
  randomAesGcmIv,
  sanitizeE2eeLogValue,
  secureRandomBytes,
  utf8ToBytes,
} from '@im/shared-e2ee-core';
import { logger } from '@/utils/logger';

interface EncryptedEnvelope {
  version: 1;
  iv: string;
  ciphertext: string;
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
const serviceForKek = (userId: string, deviceId: string): string => `${KEYCHAIN_PREFIX}.${userId}.${deviceId}.kek`;
const namespacePrefix = (userId: string, deviceId: string): string => `${KEYCHAIN_PREFIX}.${userId}.${deviceId}`;
const indexKey = (userId: string, deviceId: string): string => `${namespacePrefix(userId, deviceId)}.index`;

const setSecure = async (service: string, value: string): Promise<void> => {
  memorySecure.set(service, value);
  await Keychain.setGenericPassword(service, value, keychainSetOptions(service));
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
  memorySecure.delete(service);
  await Keychain.resetGenericPassword(keychainOptions(service));
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

  async getOrCreateKek(userId: string, deviceId: string): Promise<string> {
    const service = serviceForKek(userId, deviceId);
    const existing = await getSecure(service);
    if (existing) {
      return existing;
    }
    const kek = randomAes256Key();
    await setSecure(service, kek);
    return kek;
  },

  async setEncryptedJson(userId: string, deviceId: string, key: string, value: unknown): Promise<void> {
    const kek = await this.getOrCreateKek(userId, deviceId);
    const iv = randomAesGcmIv();
    const ciphertext = aesGcmEncryptBytes(kek, utf8ToBytes(JSON.stringify(value)), iv, utf8ToBytes(key));
    const envelope: EncryptedEnvelope = {
      version: 1,
      iv: bytesToBase64(iv),
      ciphertext,
    };
    setKv(key, JSON.stringify(envelope));
    updateIndex(userId, deviceId, key);
  },

  async getEncryptedJson<T>(userId: string, deviceId: string, key: string): Promise<T | null> {
    const raw = getKv(key);
    if (!raw) {
      return null;
    }
    try {
      const envelope = JSON.parse(raw) as Partial<EncryptedEnvelope>;
      if (envelope.version !== 1 || !envelope.iv || !envelope.ciphertext) {
        return null;
      }
      const kek = await this.getOrCreateKek(userId, deviceId);
      const plaintext = aesGcmDecryptBytes(kek, envelope.ciphertext, base64ToBytes(envelope.iv), utf8ToBytes(key));
      return JSON.parse(bytesToUtf8(plaintext)) as T;
    } catch (error) {
      logger.warn('e2ee', 'encrypted E2EE store read failed', sanitizeE2eeLogValue(error));
      return null;
    }
  },

  removeEncrypted(userId: string, deviceId: string, key: string): void {
    removeKv(key);
    const idxKey = indexKey(userId, deviceId);
    const next = readIndex(userId, deviceId).filter((item) => item !== key);
    setKv(idxKey, JSON.stringify(next));
  },

  async clearAccount(userId: string): Promise<void> {
    const deviceId = await this.getDeviceId(userId);
    if (!deviceId) {
      await removeSecure(serviceForDeviceId(userId)).catch(() => undefined);
      return;
    }
    for (const key of readIndex(userId, deviceId)) {
      removeKv(key);
    }
    removeKv(indexKey(userId, deviceId));
    await Promise.all([
      removeSecure(serviceForDeviceId(userId)).catch(() => undefined),
      removeSecure(serviceForKeys(userId, deviceId)).catch(() => undefined),
      removeSecure(serviceForKek(userId, deviceId)).catch(() => undefined),
    ]);
  },

  namespaceKey(userId: string, deviceId: string, kind: string, id: string): string {
    return `${namespacePrefix(userId, deviceId)}.${kind}.${encodeURIComponent(id)}`;
  },
};
