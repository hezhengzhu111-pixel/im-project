/**
 * Mobile E2EE capability flag — single source of truth for UI, store, and diagnostics.
 *
 * Track A (E4.1/E5): Mobile continues deferred. No encrypted send, no decrypt, no negotiation.
 * Track B (E6): Only after Codex explicit approval with crypto runtime + secure store + test matrix.
 * Track C (E7): Future receive-only, not enabled by Mimo.
 *
 * This module must never contradict assertPlaintextSendAllowed in e2eeDeferred.ts.
 * UI must never guess capabilities — always read from getMobileE2eeCapability().
 */

import { E2EE_SEND_DISABLED_TEXT, E2EE_UNSUPPORTED_TEXT } from './e2eeDeferred';

export type E2eeCapabilityMode = 'deferred' | 'receive-only' | 'full';

export interface MobileE2eeCapability {
  /** Whether E2EE is currently supported on this platform */
  supported: boolean;
  /** Current operational mode */
  mode: E2eeCapabilityMode;
  /** Whether encrypted message sending is allowed */
  canSendEncrypted: boolean;
  /** Whether encrypted message decryption is allowed */
  canDecryptEncrypted: boolean;
  /** Human-readable reason for the current capability state */
  reason: string;
}

/**
 * Track A capability: Mobile deferred — no crypto operations allowed.
 * E3.1/E3.2/E4.1/E4.2/E5.1–E5.4
 */
const TRACK_A_CAPABILITY: MobileE2eeCapability = {
  supported: false,
  mode: 'deferred',
  canSendEncrypted: false,
  canDecryptEncrypted: false,
  reason: E2EE_SEND_DISABLED_TEXT,
};

/**
 * Track B capability placeholder — only reachable after Codex explicit approval.
 * E6.1: Not adopted in stage 5. Requires crypto runtime, secure key store,
 * IndexedDB replacement, and test matrix before activation.
 *
 * DO NOT return this from getMobileE2eeCapability() without Codex approval.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TRACK_B_CAPABILITY: MobileE2eeCapability = {
  supported: true,
  mode: 'full',
  canSendEncrypted: true,
  canDecryptEncrypted: true,
  reason: 'Full E2EE is active on this device.',
};

/**
 * Track C capability placeholder — future receive-only mode.
 * E7.1/E7.2: Can display session status and mask messages, but cannot
 * decrypt, encrypt, generate keys, or advance ratchet.
 *
 * DO NOT return this from getMobileE2eeCapability() without Codex approval.
 * Mimo must not upgrade Track A deferred logging to Track C behavior (E7.3).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TRACK_C_CAPABILITY: MobileE2eeCapability = {
  supported: true,
  mode: 'receive-only',
  canSendEncrypted: false,
  canDecryptEncrypted: false,
  reason: 'This device can display encrypted session status but cannot send or decrypt encrypted messages.',
};

/**
 * Returns the current mobile E2EE capability.
 *
 * Stage 5 (E4.1): Always returns Track A deferred capability.
 * Track B/C require Codex explicit approval and are not reachable.
 *
 * E5.5/E32.3: Mobile must not encrypt, decrypt, negotiate, or register E2EE device.
 * E8.1: No silent plaintext downgrade — this function must never return
 * a state that would allow encrypted session to silently send plaintext.
 */
export const getMobileE2eeCapability = (): MobileE2eeCapability => TRACK_A_CAPABILITY;

/**
 * Decrypt display text for the current capability.
 * Returns the masked text when decryption is not available.
 * E22.4/E26.1: Mobile Track A must always mask encrypted messages.
 */
export const getDecryptDisplayText = (capability?: MobileE2eeCapability): string => {
  const cap = capability ?? getMobileE2eeCapability();
  return cap.canDecryptEncrypted ? '' : E2EE_UNSUPPORTED_TEXT;
};

/**
 * Send block text for the current capability.
 * Returns the block text when encrypted sending is not available.
 * E26.2/E27.1: Mobile Track A must block encrypted session sending.
 */
export const getSendBlockText = (capability?: MobileE2eeCapability): string => {
  const cap = capability ?? getMobileE2eeCapability();
  return cap.canSendEncrypted ? '' : E2EE_SEND_DISABLED_TEXT;
};

/**
 * Assert that encrypted sending is allowed under current capability.
 * Throws if not allowed. Consistent with assertPlaintextSendAllowed.
 * E27.1/E27.2: Must block before creating optimistic message.
 */
export const assertEncryptedSendAllowed = (capability?: MobileE2eeCapability): void => {
  const cap = capability ?? getMobileE2eeCapability();
  if (!cap.canSendEncrypted) {
    throw new Error(cap.reason);
  }
};
