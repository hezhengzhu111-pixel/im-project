import {
  getMobileE2eeCapability,
  getDecryptDisplayText,
  getSendBlockText,
  assertEncryptedSendAllowed,
} from '../e2eeCapability';
import { E2EE_SEND_DISABLED_TEXT, E2EE_UNSUPPORTED_TEXT } from '../e2eeDeferred';

describe('e2eeCapability', () => {
  // Track A: E4.1/E4.2/E5 — Mobile deferred
  describe('getMobileE2eeCapability (Track A)', () => {
    it('returns supported=false', () => {
      expect(getMobileE2eeCapability().supported).toBe(false);
    });

    it('returns mode=deferred', () => {
      expect(getMobileE2eeCapability().mode).toBe('deferred');
    });

    it('returns canSendEncrypted=false', () => {
      expect(getMobileE2eeCapability().canSendEncrypted).toBe(false);
    });

    it('returns canDecryptEncrypted=false', () => {
      expect(getMobileE2eeCapability().canDecryptEncrypted).toBe(false);
    });

    it('returns a non-empty reason string', () => {
      const reason = getMobileE2eeCapability().reason;
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(0);
    });

    it('returns stable reference (same object each call)', () => {
      const a = getMobileE2eeCapability();
      const b = getMobileE2eeCapability();
      expect(a).toBe(b);
    });
  });

  // E22.4/E26.1: Decrypt display text
  describe('getDecryptDisplayText', () => {
    it('returns E2EE_UNSUPPORTED_TEXT when decryption is not available', () => {
      expect(getDecryptDisplayText()).toBe(E2EE_UNSUPPORTED_TEXT);
    });

    it('returns empty string when capability allows decryption', () => {
      expect(
        getDecryptDisplayText({
          supported: true,
          mode: 'full',
          canSendEncrypted: true,
          canDecryptEncrypted: true,
          reason: 'test',
        }),
      ).toBe('');
    });

    it('returns masked text for deferred capability', () => {
      const cap = getMobileE2eeCapability();
      expect(getDecryptDisplayText(cap)).toBe(E2EE_UNSUPPORTED_TEXT);
    });
  });

  // E26.2/E27.1: Send block text
  describe('getSendBlockText', () => {
    it('returns E2EE_SEND_DISABLED_TEXT when sending is not available', () => {
      expect(getSendBlockText()).toBe(E2EE_SEND_DISABLED_TEXT);
    });

    it('returns empty string when capability allows sending', () => {
      expect(
        getSendBlockText({
          supported: true,
          mode: 'full',
          canSendEncrypted: true,
          canDecryptEncrypted: true,
          reason: 'test',
        }),
      ).toBe('');
    });

    it('returns block text for deferred capability', () => {
      const cap = getMobileE2eeCapability();
      expect(getSendBlockText(cap)).toBe(E2EE_SEND_DISABLED_TEXT);
    });
  });

  // E27.1/E27.2: Assert encrypted send allowed
  describe('assertEncryptedSendAllowed', () => {
    it('throws when capability does not allow encrypted send', () => {
      expect(() => assertEncryptedSendAllowed()).toThrow();
    });

    it('throws with the capability reason message', () => {
      expect(() => assertEncryptedSendAllowed()).toThrow(E2EE_SEND_DISABLED_TEXT);
    });

    it('does not throw when capability allows encrypted send', () => {
      expect(() =>
        assertEncryptedSendAllowed({
          supported: true,
          mode: 'full',
          canSendEncrypted: true,
          canDecryptEncrypted: true,
          reason: 'test',
        }),
      ).not.toThrow();
    });

    it('throws for deferred capability', () => {
      const cap = getMobileE2eeCapability();
      expect(() => assertEncryptedSendAllowed(cap)).toThrow();
    });
  });

  // Consistency: capability flags must not contradict e2eeDeferred guards
  describe('consistency with e2eeDeferred', () => {
    it('capability reason matches E2EE_SEND_DISABLED_TEXT', () => {
      // E5.2: Send block text must match the deferred guard
      expect(getMobileE2eeCapability().reason).toBe(E2EE_SEND_DISABLED_TEXT);
    });

    it('canSendEncrypted=false aligns with assertPlaintextSendAllowed blocking', () => {
      // If canSendEncrypted is false, encrypted sessions must be blocked
      // assertPlaintextSendAllowed throws for encrypted sessions
      // This capability must be consistent: cannot allow what the guard blocks
      const cap = getMobileE2eeCapability();
      expect(cap.canSendEncrypted).toBe(false);
      expect(cap.canDecryptEncrypted).toBe(false);
      expect(cap.supported).toBe(false);
      expect(cap.mode).toBe('deferred');
    });
  });

  // E32.3: Mobile must not encrypt, decrypt, negotiate, or register device
  describe('E32.3 prohibitions', () => {
    it('Track A capability does not allow any crypto operation', () => {
      const cap = getMobileE2eeCapability();
      expect(cap.supported).toBe(false);
      expect(cap.canSendEncrypted).toBe(false);
      expect(cap.canDecryptEncrypted).toBe(false);
      expect(cap.mode).toBe('deferred');
    });
  });
});
