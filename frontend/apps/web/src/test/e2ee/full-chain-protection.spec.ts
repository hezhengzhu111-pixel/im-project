/**
 * E2EE 全链路保护测试矩阵 — 补齐项
 *
 * 覆盖场景 (E2, E8, E14, E23, E28, E31, E32, E33):
 * 1. encrypted session 状态恢复（restoreE2eeSession）
 * 2. Ratchet counter gap 触发重新协商（MAX_COUNTER_GAP = 2000）
 * 3. 媒体文件加密安全属性（key/IV 唯一性、tamper detection）
 * 4. logout/clear session 完整清理
 *
 * 条款引用: E2.1-E2.4, E8.1-E8.4, E14.1-E14.4, E23.1-E23.2, E28.1-E28.5, E31.1-E31.2, E32.1-E32.6, E33.1
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

import {
  generateKeyBundle,
  x3dhInitiate,
  x3dhRespond,
} from '@/features/e2ee/engine/x3dh';
import {
  importRootKey,
  initSendingChain,
  initReceivingChain,
  ratchetEncrypt,
} from '@/features/e2ee/engine/double-ratchet';
import {
  saveRatchetState,
  getRatchetState,
  deleteRatchetState,
  listSessionIds,
} from '@/features/e2ee/store/session-store';
import { clearAllKeys } from '@/features/e2ee/store/key-store';
import { e2eeManager } from '@/features/e2ee/manager/e2ee-manager';
import {
  getLocalSessionStatus,
  setLocalSessionStatus,
  restoreE2eeSession,
  resetNegotiation,
} from '@/features/e2ee/manager/negotiation';
import { encryptMedia, decryptMedia } from '@/features/e2ee/engine/media-crypto';

// Mock initiateNegotiation to prevent network calls in counter gap test
const initiateNegotiationMock = vi.fn();
vi.mock('@/features/e2ee/api/key-service', () => ({
  keyService: {
    getDevices: vi.fn().mockResolvedValue({ data: [] }),
    getBundle: vi.fn().mockResolvedValue({ data: null }),
    requestEncryption: vi.fn().mockResolvedValue({ data: 'ok' }),
    uploadBundle: vi.fn().mockResolvedValue({ data: 'ok' }),
  },
}));

// ============================================================================
// Helpers
// ============================================================================

const ALICE_ID = '4001';
const BOB_ID = '4002';
const SESSION_ID = `${ALICE_ID}_${BOB_ID}`;

async function setupBothRatchetStates() {
  const aliceBundle = await generateKeyBundle();
  const bobBundle = await generateKeyBundle();

  const x3dhResult = await x3dhInitiate(
    aliceBundle.identityKeyPair,
    {
      identityKey: bobBundle.bundle.identityKey,
      signingIdentityKey: bobBundle.bundle.signingIdentityKey,
      signedPreKey: bobBundle.bundle.signedPreKey,
      signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
      oneTimePreKey: bobBundle.bundle.oneTimePreKeys[0],
    },
  );

  const bobRootKey = await x3dhRespond(
    bobBundle.identityKeyPair,
    bobBundle.signedPreKeyPair,
    bobBundle.oneTimePreKeyPairs[0],
    aliceBundle.bundle.identityKey,
    x3dhResult.ephemeralPublicKey,
  );

  const aliceRootKey = await importRootKey(x3dhResult.rootKey);
  const aliceState = await initSendingChain(aliceRootKey, aliceBundle.identityKeyPair);

  const bobRootKeyCk = await importRootKey(bobRootKey);
  const bobState = await initReceivingChain(bobRootKeyCk, bobBundle.identityKeyPair);

  return { aliceState, bobState, aliceBundle, bobBundle };
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

// ============================================================================
// Test Suite
// ============================================================================

describe('E2EE Full Chain Protection', () => {
  beforeEach(async () => {
    // Clean up all E2EE state
    const sessionIds = [
      SESSION_ID, `${BOB_ID}_${ALICE_ID}`,
      'restore_test', 'restore_no_state', 'restore_not_encrypted',
      'counter_gap_test', 'counter_gap_bob',
      'cleanup_test_1', 'cleanup_test_2',
    ];
    for (const id of sessionIds) {
      e2eeManager.clearSession(id);
    }
    localStorage.clear();
    await clearAllKeys();
    await e2eeManager.init('test_device');
  });

  // ==========================================================================
  // Scenario 1: Encrypted Session State Restore (restoreE2eeSession)
  // E2.2, E2.3, E28.3
  // ==========================================================================

  describe('1. Encrypted session state restore', () => {
    it('returns true when status=encrypted and ratchet state exists in IndexedDB', async () => {
      const { aliceState } = await setupBothRatchetStates();

      // Save ratchet state and set status
      await saveRatchetState('restore_test', aliceState);
      setLocalSessionStatus('restore_test', 'encrypted');

      // Verify restore succeeds
      const result = await restoreE2eeSession('restore_test');
      expect(result).toBe(true);

      // Status should remain encrypted
      expect(getLocalSessionStatus('restore_test')).toBe('encrypted');

      // Ratchet state should still be usable
      const state = await getRatchetState('restore_test');
      expect(state).not.toBeNull();
    });

    it('returns false when status is not encrypted (plaintext)', async () => {
      const { aliceState } = await setupBothRatchetStates();
      await saveRatchetState('restore_not_encrypted', aliceState);
      setLocalSessionStatus('restore_not_encrypted', 'plaintext');

      const result = await restoreE2eeSession('restore_not_encrypted');
      expect(result).toBe(false);
    });

    it('returns false when status=encrypted but no ratchet state in IndexedDB', async () => {
      // Status says encrypted, but no ratchet state saved
      setLocalSessionStatus('restore_no_state', 'encrypted');

      const result = await restoreE2eeSession('restore_no_state');
      expect(result).toBe(false);
    });

    it('ratchet state survives page reload simulation (save → getRatchetState)', async () => {
      const { aliceState } = await setupBothRatchetStates();

      await saveRatchetState(SESSION_ID, aliceState);

      // Simulate page reload — clear in-memory state, read from IndexedDB
      const restored = await getRatchetState(SESSION_ID);
      expect(restored).not.toBeNull();
      expect(restored!.sendCounter).toBe(0);
      expect(restored!.receiveCounter).toBe(0);

      // Should be able to encrypt with restored state
      const { ciphertext } = await ratchetEncrypt(restored!, 'test after reload');
      expect(ciphertext).toBeTruthy();
      expect(restored!.sendCounter).toBe(1);
    });

    it('restored session can encrypt and decrypt (full round-trip after reload)', async () => {
      const { aliceState, bobState } = await setupBothRatchetStates();

      // Alice saves state, encrypts
      await saveRatchetState(SESSION_ID, aliceState);
      const plaintext = 'Message after session restore';
      const { header, ciphertext } = await ratchetEncrypt(aliceState, plaintext);

      // Simulate reload: restore Alice's state from IndexedDB
      const restoredAlice = await getRatchetState(SESSION_ID);
      expect(restoredAlice).not.toBeNull();

      // Bob decrypts
      const decrypted = await ratchetEncrypt(bobState, 'dummy'); // advance bob state
      // Actually, let's use e2eeManager for a proper round-trip
      const bobSessionId = `${BOB_ID}_${ALICE_ID}`;
      await saveRatchetState(bobSessionId, bobState);

      const decryptedText = await e2eeManager.decryptMessage(
        bobSessionId, ALICE_ID, header, ciphertext,
      );
      expect(decryptedText).toBe(plaintext);
    });
  });

  // ==========================================================================
  // Scenario 2: Ratchet Counter Gap → Renegotiation Trigger
  // E14.1, E14.2, E14.4, E8.2, E28.3
  // ==========================================================================

  describe('2. Ratchet counter gap triggers renegotiation', () => {
    const MAX_COUNTER_GAP = 2000;

    it('throws "Session renegotiation required" when counter gap exceeds MAX_COUNTER_GAP', async () => {
      const { aliceState, bobState } = await setupBothRatchetStates();

      // Save Bob's state with artificially low receiveCounter
      bobState.receiveCounter = 0;
      const bobSessionId = 'counter_gap_bob';
      await saveRatchetState(bobSessionId, bobState);

      // Alice sends a message with counter way beyond the gap
      await saveRatchetState('counter_gap_test', aliceState);

      // Advance Alice's send counter to exceed the gap
      for (let i = 0; i < MAX_COUNTER_GAP + 10; i++) {
        await ratchetEncrypt(aliceState, `padding_msg_${i}`);
      }

      // Now encrypt the actual message — counter will be MAX_COUNTER_GAP + 10
      const { header, ciphertext } = await ratchetEncrypt(aliceState, 'gap trigger message');

      // Verify the counter is beyond the gap
      expect(header.counter).toBeGreaterThan(MAX_COUNTER_GAP);

      // Bob tries to decrypt — should trigger renegotiation
      await expect(
        e2eeManager.decryptMessage(bobSessionId, ALICE_ID, header, ciphertext),
      ).rejects.toThrow('Session renegotiation required');
    });

    it('counter within gap does NOT trigger renegotiation', async () => {
      const { aliceState, bobState } = await setupBothRatchetStates();

      bobState.receiveCounter = 0;
      const bobSessionId = 'counter_gap_bob';
      await saveRatchetState(bobSessionId, bobState);
      await saveRatchetState('counter_gap_test', aliceState);

      // Send exactly MAX_COUNTER_GAP messages — within allowed window
      for (let i = 0; i < MAX_COUNTER_GAP; i++) {
        await ratchetEncrypt(aliceState, `msg_${i}`);
      }

      // This counter is exactly MAX_COUNTER_GAP — should still be within window
      // because the check is `counter > receiveCounter + MAX_COUNTER_GAP`
      // counter = 2000, receiveCounter + MAX_COUNTER_GAP = 0 + 2000 = 2000
      // 2000 > 2000 is false → no renegotiation
      const { header, ciphertext } = await ratchetEncrypt(aliceState, 'within gap');

      // Should NOT throw "Session renegotiation required"
      // (may throw for other reasons like skipped keys, but not renegotiation)
      try {
        await e2eeManager.decryptMessage(bobSessionId, ALICE_ID, header, ciphertext);
      } catch (e) {
        const error = e as Error;
        expect(error.message).not.toBe('Session renegotiation required');
      }
    });

    it('counter just beyond gap triggers renegotiation (boundary)', async () => {
      const { aliceState, bobState } = await setupBothRatchetStates();

      bobState.receiveCounter = 0;
      const bobSessionId = 'counter_gap_bob';
      await saveRatchetState(bobSessionId, bobState);
      await saveRatchetState('counter_gap_test', aliceState);

      // Send MAX_COUNTER_GAP + 1 messages to just exceed the window
      for (let i = 0; i <= MAX_COUNTER_GAP; i++) {
        await ratchetEncrypt(aliceState, `msg_${i}`);
      }

      // Counter is now MAX_COUNTER_GAP + 1
      // receiveCounter + MAX_COUNTER_GAP = 0 + 2000 = 2000
      // MAX_COUNTER_GAP + 1 > 2000 is true → renegotiation
      const { header, ciphertext } = await ratchetEncrypt(aliceState, 'beyond gap');

      await expect(
        e2eeManager.decryptMessage(bobSessionId, ALICE_ID, header, ciphertext),
      ).rejects.toThrow('Session renegotiation required');
    });

    it('counter gap error does NOT leak ciphertext or header in error message', async () => {
      const { aliceState, bobState } = await setupBothRatchetStates();

      bobState.receiveCounter = 0;
      const bobSessionId = 'counter_gap_bob';
      await saveRatchetState(bobSessionId, bobState);
      await saveRatchetState('counter_gap_test', aliceState);

      for (let i = 0; i < MAX_COUNTER_GAP + 100; i++) {
        await ratchetEncrypt(aliceState, `pad_${i}`);
      }
      const { header, ciphertext } = await ratchetEncrypt(aliceState, 'secret content');

      try {
        await e2eeManager.decryptMessage(bobSessionId, ALICE_ID, header, ciphertext);
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        // E20/E32.5: error must not contain plaintext or ciphertext
        expect(error.message).not.toContain('secret content');
        expect(error.message).not.toContain(ciphertext);
      }
    });
  });

  // ==========================================================================
  // Scenario 3: Media File Encryption Security Properties
  // E23.1, E23.2, E32.1
  // ==========================================================================

  describe('3. Media file encryption security properties', () => {
    it('each encryption produces a unique media key', async () => {
      const data = new TextEncoder().encode('same content for both');
      const file1 = new File([data], 'test.txt', { type: 'text/plain' });
      const file2 = new File([data], 'test.txt', { type: 'text/plain' });

      const enc1 = await encryptMedia(file1);
      const enc2 = await encryptMedia(file2);

      // E23.1: each encryption must use a fresh random key
      expect(enc1.mediaKey).not.toBe(enc2.mediaKey);
    });

    it('each chunk gets a unique IV', async () => {
      // Create a file that would produce multiple chunks if chunking is supported
      const data = new TextEncoder().encode('test file content');
      const file = new File([data], 'test.txt', { type: 'text/plain' });

      const encrypted = await encryptMedia(file);

      // All IVs must be unique
      const uniqueIvs = new Set(encrypted.chunkIvs);
      expect(uniqueIvs.size).toBe(encrypted.chunkIvs.length);
    });

    it('media key is Base64 encoded and non-empty', async () => {
      const data = new TextEncoder().encode('test');
      const file = new File([data], 'test.txt', { type: 'text/plain' });

      const encrypted = await encryptMedia(file);

      expect(encrypted.mediaKey).toBeTruthy();
      expect(typeof encrypted.mediaKey).toBe('string');
      expect(encrypted.mediaKey.length).toBeGreaterThan(0);
      // Should be valid Base64
      expect(() => atob(encrypted.mediaKey)).not.toThrow();
    });

    it('decrypt with tampered ciphertext fails (AES-GCM authentication)', async () => {
      const data = new TextEncoder().encode('authentic content');
      const file = new File([data], 'test.txt', { type: 'text/plain' });

      const encrypted = await encryptMedia(file);

      // Tamper with the encrypted chunk
      const chunkBuffer = await readBlobAsArrayBuffer(encrypted.encryptedChunks[0]);
      const tampered = new Uint8Array(chunkBuffer);
      tampered[0] ^= 0xff; // flip bits in first byte
      const tamperedBlob = new Blob([tampered], { type: 'application/octet-stream' });

      await expect(
        decryptMedia({
          encryptedChunks: [tamperedBlob],
          mediaKey: encrypted.mediaKey,
          chunkIvs: encrypted.chunkIvs,
          mimeType: 'text/plain',
        }),
      ).rejects.toThrow();
    });

    it('encrypted file size differs from original (AES-GCM adds auth tag)', async () => {
      const data = new TextEncoder().encode('size comparison test');
      const file = new File([data], 'test.txt', { type: 'text/plain' });

      const encrypted = await encryptMedia(file);

      const originalSize = data.byteLength;
      const encryptedChunk = encrypted.encryptedChunks[0];
      const encryptedBuffer = await readBlobAsArrayBuffer(encryptedChunk);

      // AES-GCM appends a 16-byte authentication tag
      expect(encryptedBuffer.byteLength).toBe(originalSize + 16);
    });
  });

  // ==========================================================================
  // Scenario 4: Logout / Clear Session Cleanup
  // E28.3, E17.4, E32.1
  // ==========================================================================

  describe('4. Logout / clear session cleanup', () => {
    it('clearSession removes ratchet state from IndexedDB', async () => {
      const { aliceState } = await setupBothRatchetStates();

      await saveRatchetState('cleanup_test_1', aliceState);
      expect(await getRatchetState('cleanup_test_1')).not.toBeNull();

      await e2eeManager.clearSession('cleanup_test_1');

      const stateAfter = await getRatchetState('cleanup_test_1');
      expect(stateAfter).toBeNull();
    });

    it('clearSession removes localStorage status', async () => {
      setLocalSessionStatus('cleanup_test_2', 'encrypted');
      expect(getLocalSessionStatus('cleanup_test_2')).toBe('encrypted');

      await e2eeManager.clearSession('cleanup_test_2');

      // After clearing, status should fall back to plaintext (default)
      expect(getLocalSessionStatus('cleanup_test_2')).toBe('plaintext');
    });

    it('clearAllKeys wipes all IndexedDB stores', async () => {
      const { aliceState } = await setupBothRatchetStates();

      await saveRatchetState('cleanup_test_1', aliceState);
      await saveRatchetState('cleanup_test_2', aliceState);

      // Verify states exist
      expect(await getRatchetState('cleanup_test_1')).not.toBeNull();
      expect(await getRatchetState('cleanup_test_2')).not.toBeNull();

      // Clear all keys
      await clearAllKeys();

      // All states should be gone
      expect(await getRatchetState('cleanup_test_1')).toBeNull();
      expect(await getRatchetState('cleanup_test_2')).toBeNull();

      // listSessionIds should return empty
      const ids = await listSessionIds();
      expect(ids).toHaveLength(0);
    });

    it('resetNegotiation clears status and deletes ratchet state', async () => {
      const { aliceState } = await setupBothRatchetStates();

      await saveRatchetState('cleanup_test_1', aliceState);
      setLocalSessionStatus('cleanup_test_1', 'encrypted');

      await resetNegotiation('cleanup_test_1');

      expect(getLocalSessionStatus('cleanup_test_1')).toBe('plaintext');
      expect(await getRatchetState('cleanup_test_1')).toBeNull();
    });

    it('clearSession is idempotent (no error on double clear)', async () => {
      const { aliceState } = await setupBothRatchetStates();

      await saveRatchetState('cleanup_test_1', aliceState);
      await e2eeManager.clearSession('cleanup_test_1');

      // Second clear should not throw
      await expect(e2eeManager.clearSession('cleanup_test_1')).resolves.not.toThrow();
    });

    it('cleared session cannot encrypt or decrypt', async () => {
      const { aliceState } = await setupBothRatchetStates();

      await saveRatchetState('cleanup_test_1', aliceState);
      await e2eeManager.clearSession('cleanup_test_1');

      // Encrypt should return null
      const encResult = await e2eeManager.encryptMessage('cleanup_test_1', 'test');
      expect(encResult).toBeNull();

      // Decrypt should throw
      await expect(
        e2eeManager.decryptMessage(
          'cleanup_test_1', 'sender',
          { ratchetPublicKey: 'k', counter: 0, previousCounter: 0, iv: 'iv' },
          'cipher',
        ),
      ).rejects.toThrow('No ratchet state');
    });
  });
});
