import * as Keychain from 'react-native-keychain';
import CookieManager, { type Cookie } from '@preeternal/react-native-cookie-manager';
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

const isCookieRecord = (value: unknown): value is Cookie => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const cookie = value as Partial<Cookie>;
  return typeof cookie.name === 'string' && typeof cookie.value === 'string';
};

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

  /**
   * 清理 secureStorage 中的登录凭据和 cookies。
   * 会清：accessToken、sessionMeta、cookieMirror、所有 cookies。
   * 不会清：FCM token、kvStorage、SQLite 数据。
   */
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

  async restoreCookiesFromMirror(): Promise<boolean> {
    const raw = await this.get(STORAGE_KEYS.cookieMirror);
    if (!raw || typeof CookieManager.set !== 'function') {
      return false;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const cookies = parsed && typeof parsed === 'object' ? Object.values(parsed) : [];
      const restored = cookies.filter(isCookieRecord);
      if (restored.length === 0) {
        return false;
      }
      await Promise.all(restored.map((cookie) => CookieManager.set(APP_CONFIG.API_BASE_URL, cookie, true)));
      if (typeof CookieManager.flush === 'function') {
        await CookieManager.flush();
      }
      return true;
    } catch (error) {
      logger.warn('secure-storage', 'Cookie mirror restore failed', error);
      await this.remove(STORAGE_KEYS.cookieMirror);
      return false;
    }
  },
};
