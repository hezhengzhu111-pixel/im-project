import * as Keychain from 'react-native-keychain';
import CookieManager from '@preeternal/react-native-cookie-manager';
import { APP_CONFIG, STORAGE_KEYS } from '@/constants/config';
import { logger } from '@/utils/logger';

type SecureKey =
  | typeof STORAGE_KEYS.accessToken
  | typeof STORAGE_KEYS.sessionMeta
  | typeof STORAGE_KEYS.cookieMirror;

const memorySecure = new Map<string, string>();

const baseOptionsFor = (key: SecureKey): Keychain.BaseOptions => ({
  service: key,
});

const setOptionsFor = (key: SecureKey): Keychain.SetOptions => ({
  ...baseOptionsFor(key),
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});

export const secureStorage = {
  async set(key: SecureKey, value: string): Promise<void> {
    memorySecure.set(key, value);
    try {
      await Keychain.setGenericPassword(key, value, setOptionsFor(key));
    } catch (error) {
      logger.warn('secure-storage', 'Keychain set failed; memory fallback active', error);
    }
  },

  async get(key: SecureKey): Promise<string> {
    try {
      const result = await Keychain.getGenericPassword(baseOptionsFor(key));
      if (result) {
        return result.password;
      }
    } catch (error) {
      logger.warn('secure-storage', 'Keychain get failed; memory fallback active', error);
    }
    return memorySecure.get(key) || '';
  },

  async remove(key: SecureKey): Promise<void> {
    memorySecure.delete(key);
    try {
      await Keychain.resetGenericPassword(baseOptionsFor(key));
    } catch (error) {
      logger.warn('secure-storage', 'Keychain remove failed', error);
    }
  },

  async clearSession(): Promise<void> {
    await Promise.all([
      this.remove(STORAGE_KEYS.accessToken),
      this.remove(STORAGE_KEYS.sessionMeta),
      this.remove(STORAGE_KEYS.cookieMirror),
      CookieManager.clearAll(true).catch((error: unknown) => {
        logger.warn('secure-storage', 'Cookie clear failed', error);
      }),
    ]);
  },

  async mirrorCookies(): Promise<void> {
    try {
      const cookies = await CookieManager.get(APP_CONFIG.API_BASE_URL, true);
      await this.set(STORAGE_KEYS.cookieMirror, JSON.stringify(cookies));
    } catch (error) {
      logger.warn('secure-storage', 'Cookie mirror failed', error);
    }
  },
};
