import {
  assertEncryptedSendAllowed,
  getDecryptDisplayText,
  getMobileE2eeCapability,
  getSendBlockText,
} from '../e2eeCapability';
import { E2EE_UNSUPPORTED_TEXT } from '../e2eeDeferred';
import { useAuthStore } from '@/stores/authStore';

describe('e2eeCapability', () => {
  beforeEach(() => {
    useAuthStore.setState({
      currentUser: null,
      accessToken: '',
      permissions: [],
      loading: false,
      authReady: true,
      sessionGeneration: 0,
    });
  });

  it('returns failed when no current user namespace is available', () => {
    const cap = getMobileE2eeCapability();
    expect(cap.supported).toBe(false);
    expect(cap.mode).toBe('failed');
    expect(cap.canSendEncrypted).toBe(false);
    expect(cap.canDecryptEncrypted).toBe(false);
  });

  it('returns full when user, secure random, Keychain, and MMKV are available', () => {
    useAuthStore.setState({
      currentUser: { id: 'user-1', username: 'alice', nickname: 'Alice', status: 'online' },
    });

    const cap = getMobileE2eeCapability();
    expect(cap.supported).toBe(true);
    expect(cap.mode).toBe('full');
    expect(cap.canSendEncrypted).toBe(true);
    expect(cap.canDecryptEncrypted).toBe(true);
  });

  it('returns masked display text only for failed capability', () => {
    expect(getDecryptDisplayText()).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(getDecryptDisplayText({
      supported: true,
      mode: 'full',
      canSendEncrypted: true,
      canDecryptEncrypted: true,
      reason: 'test',
    })).toBe('');
  });

  it('allows encrypted sends only in full mode', () => {
    expect(() => assertEncryptedSendAllowed()).toThrow();
    expect(getSendBlockText()).toContain('端到端加密');
    expect(() => assertEncryptedSendAllowed({
      supported: true,
      mode: 'full',
      canSendEncrypted: true,
      canDecryptEncrypted: true,
      reason: 'test',
    })).not.toThrow();
  });
});
