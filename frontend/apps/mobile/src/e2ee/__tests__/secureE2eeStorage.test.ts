jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as Keychain from 'react-native-keychain';
import type { Base64String, RustLocalE2eeKeyMaterial } from '@im/shared-e2ee-core';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';
import { e2eeKeyStore } from '@/e2ee/store/keyStore';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { clearCurrentE2eeAccountState } from '@/e2ee/clearE2eeState';
import { logger } from '@/utils/logger';

const keychainSet = jest.mocked(Keychain.setGenericPassword);
const keychainReset = jest.mocked(Keychain.resetGenericPassword);

const keyMaterial = (): RustLocalE2eeKeyMaterial => ({
  version: 2,
  identityKeyPairBincode: 'identity-private',
  signedPreKeyPairBincode: 'signed-private',
  oneTimePreKeyPairs: [],
  publicBundle: {
    identityKey: 'identity-public',
    signingKey: 'signing-public',
    signedPreKey: { id: 1, key: 'signed-public' },
    signedPreKeySignature: 'signature',
    oneTimePreKeys: [],
  },
});

describe('secure E2EE storage persistence semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    e2eeSessionStore.clearRuntime();
  });

  it('does not update memory secure cache when Keychain set fails', async () => {
    const userId = 'set-fails-user';
    const deviceId = 'set-fails-device';
    keychainSet.mockResolvedValueOnce(false);

    await expect(e2eeSecureStorage.setKeyMaterial(userId, deviceId, 'secret-material'))
      .rejects.toThrow(`E2EE secure storage persist failed for service im.mobile.e2ee.${userId}.${deviceId}.keys`);

    await expect(e2eeSecureStorage.getKeyMaterial(userId, deviceId)).resolves.toBe('');
  });

  it('does not let saveKeyMaterial read back from memory fallback after Keychain set fails', async () => {
    const userId = 'save-fails-user';
    const deviceId = 'save-fails-device';
    keychainSet.mockResolvedValueOnce(false);

    await expect(e2eeKeyStore.saveKeyMaterial(userId, deviceId, keyMaterial()))
      .rejects.toThrow('E2EE secure storage persist failed');

    await expect(e2eeKeyStore.getKeyMaterial(userId, deviceId)).resolves.toBeNull();
  });

  it('rejects removeEncrypted when Keychain deletion fails', async () => {
    const userId = 'remove-fails-user';
    const deviceId = 'remove-fails-device';
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'session', 's1');
    await e2eeSecureStorage.setEncryptedJson(userId, deviceId, key, { state: 'ciphertext-state' });
    keychainReset.mockRejectedValueOnce(new Error('keychain delete failed'));

    await expect(e2eeSecureStorage.removeEncrypted(userId, deviceId, key))
      .rejects.toThrow('keychain delete failed');
  });

  it('treats Keychain false delete as already absent and clears memory cache', async () => {
    const userId = 'remove-absent-user';
    const deviceId = 'remove-absent-device';
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'session', 's1');
    await e2eeSecureStorage.setEncryptedJson(userId, deviceId, key, { state: 'cached-state' });
    await keychainReset({ service: key });
    keychainReset.mockResolvedValueOnce(false);

    await expect(e2eeSecureStorage.removeEncrypted(userId, deviceId, key)).resolves.toBeUndefined();
    await expect(e2eeSecureStorage.getEncryptedJson(userId, deviceId, key)).resolves.toBeNull();
  });

  it('logs sanitized warn when clearAccount has a partial delete failure', async () => {
    const userId = 'clear-partial-user';
    const deviceId = await e2eeSecureStorage.getOrCreateDeviceId(userId);
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'session', 's1');
    await e2eeSecureStorage.setEncryptedJson(userId, deviceId, key, { state: 'ciphertext-state' });
    keychainReset.mockRejectedValueOnce(new Error('indexed delete failed'));

    await e2eeSecureStorage.clearAccount(userId);

    expect(logger.warn).toHaveBeenCalledWith(
      'e2ee',
      'E2EE secure storage clear failed',
      expect.anything(),
    );
  });

  it('logs warn when clearCurrentE2eeAccountState cannot clear account storage', async () => {
    const clearSpy = jest.spyOn(e2eeKeyStore, 'clearAccount').mockRejectedValueOnce(new Error('clear failed'));

    await clearCurrentE2eeAccountState('clear-current-user');

    expect(logger.warn).toHaveBeenCalledWith(
      'e2ee',
      'E2EE account clear failed',
      expect.anything(),
    );
    clearSpy.mockRestore();
  });

  it('rejects invalid Base64 session state instead of saving it', async () => {
    const userId = 'invalid-state-user';
    await e2eeSecureStorage.getOrCreateDeviceId(userId);

    await expect(e2eeSessionStore.saveSessionState(userId, 's-invalid', 'not-base64!!' as Base64String))
      .rejects.toThrow('session state must be Base64-encoded binary data');

    await expect(e2eeSessionStore.getSessionState(userId, 's-invalid')).resolves.toBeNull();
  });

  it('updates cached status only after status persistence succeeds', async () => {
    const userId = 'status-success-user';
    await e2eeSecureStorage.getOrCreateDeviceId(userId);

    await e2eeSessionStore.setStatus(userId, 's-status-success', 'encrypted');

    expect(e2eeSessionStore.getCachedStatus('s-status-success')).toBe('encrypted');
  });

  it('keeps previous cached status when status persistence fails', async () => {
    const userId = 'status-fails-user';
    await e2eeSecureStorage.getOrCreateDeviceId(userId);
    const setEncryptedSpy = jest
      .spyOn(e2eeSecureStorage, 'setEncryptedJson')
      .mockRejectedValueOnce(new Error('status persist failed'));

    await expect(e2eeSessionStore.setStatus(userId, 's-status-fails', 'encrypted'))
      .rejects.toThrow('status persist failed');

    expect(e2eeSessionStore.getCachedStatus('s-status-fails')).toBe('plaintext');
    setEncryptedSpy.mockRestore();
  });

  it('uses runtime-only status cache when no device namespace exists', async () => {
    await e2eeSessionStore.setStatus('status-runtime-only-user', 's-status-runtime-only', 'negotiating');

    expect(e2eeSessionStore.getCachedStatus('s-status-runtime-only')).toBe('negotiating');
  });
});
