jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as Keychain from 'react-native-keychain';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { bytesToBase64, SESSION_STATE_ENVELOPE_VERSION } from '@im/shared-e2ee-core';

const keychainGet = jest.mocked(Keychain.getGenericPassword);
const keychainSet = jest.mocked(Keychain.setGenericPassword);

async function registerDevice(userId: string): Promise<string> {
  return e2eeSecureStorage.getOrCreateDeviceId(userId);
}

describe('E2EE session store v3 envelope', () => {
  const userId = 'alice-123';
  const remoteUserId = 'bob-456';
  const sessionId = 'p_100_200';
  const remoteDeviceId = 'mobile-ffff-eeee-dddd-cccc-bbbb';
  const mockState = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  beforeEach(() => {
    jest.clearAllMocks();
    e2eeSessionStore.clearRuntime();
    keychainGet.mockResolvedValue(false as unknown as false);
    keychainSet.mockResolvedValue({ service: 'mock', storage: 'keychain' } as unknown as Keychain.Result);
  });

  // ── saveSessionState writes v3 envelope ────────────────────────────

  it('saveSessionState writes a version 3 envelope', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    const deviceId = await e2eeSecureStorage.getDeviceId(userId);
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'session', sessionId);
    const stored = await e2eeSecureStorage.getEncryptedJson<Record<string, unknown>>(userId, deviceId, key);

    expect(stored).not.toBeNull();
    expect(stored!.version).toBe(SESSION_STATE_ENVELOPE_VERSION);
    expect(stored!.algorithm).toBe('rust-x25519-x3dh-dr-v1');
    expect(stored!.userId).toBe(userId);
    expect(stored!.localDeviceId).toBe(deviceId);
    expect(stored!.sessionId).toBe(sessionId);
    expect(stored!.remoteDeviceId).toBe(remoteDeviceId);
    expect(stored!.remoteUserIdHash).toHaveLength(16);
    expect(typeof stored!.state).toBe('string');
    expect((stored!.state as string).length).toBeGreaterThan(0);
    expect(stored!.createdAt).toBeGreaterThan(0);
    expect(stored!.updatedAt).toBe(stored!.createdAt);
  });

  it('saveSessionState does not write plaintext keys in envelope', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    const deviceId = await e2eeSecureStorage.getDeviceId(userId);
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'session', sessionId);
    const stored = await e2eeSecureStorage.getEncryptedJson<Record<string, unknown>>(userId, deviceId, key);

    // remoteUserIdHash must NOT contain the raw userId
    expect(stored!.remoteUserIdHash).not.toContain(remoteUserId);
    expect(stored!.remoteUserIdHash).not.toContain('bob');
  });

  // ── getSessionState validates context ───────────────────────────────

  it('getSessionState returns state bytes when context matches', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    const result = await e2eeSessionStore.getSessionState(userId, sessionId, remoteUserId, remoteDeviceId);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('getSessionState returns null when userId does not match', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    // The namespace key already scopes by userId, but we test the envelope
    // validation by checking that a different user can't read via the same
    // namespace (covered by secure storage scoping) AND that envelope
    // validation would fail if somehow accessed.
    // This is enforced by secure storage scoping — different user = different key path.
    const otherUser = 'eve-999';
    await registerDevice(otherUser);
    const result = await e2eeSessionStore.getSessionState(otherUser, sessionId, remoteUserId, remoteDeviceId);
    expect(result).toBeNull();
  });

  it('getSessionState returns null when remoteDeviceId does not match', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    const result = await e2eeSessionStore.getSessionState(userId, sessionId, remoteUserId, 'wrong-device-id');
    expect(result).toBeNull();
  });

  it('getSessionState returns null when remoteUserId does not match (hash check)', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    const result = await e2eeSessionStore.getSessionState(userId, sessionId, 'wrong-remote-user', remoteDeviceId);
    expect(result).toBeNull();
  });

  // ── v2 migration ────────────────────────────────────────────────────

  it('getSessionState migrates v2 state to v3 when context is available', async () => {
    await registerDevice(userId);
    const deviceId = await e2eeSecureStorage.getDeviceId(userId);

    // Write a v2-style record directly
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'session', sessionId);
    const v2State = bytesToBase64(mockState);
    await e2eeSecureStorage.setEncryptedJson(userId, deviceId, key, {
      version: 2,
      state: v2State,
    });

    // Reading with context should migrate to v3 and return the state
    const result = await e2eeSessionStore.getSessionState(userId, sessionId, remoteUserId, remoteDeviceId);
    expect(result).not.toBeNull();
    expect(result).toBe(v2State);

    // Verify it was migrated — re-read should now be v3
    const stored = await e2eeSecureStorage.getEncryptedJson<Record<string, unknown>>(userId, deviceId, key);
    expect(stored!.version).toBe(SESSION_STATE_ENVELOPE_VERSION);
  });

  it('getSessionState returns null for v2 state without context (cannot prove ownership)', async () => {
    await registerDevice(userId);
    const deviceId = await e2eeSecureStorage.getDeviceId(userId);

    // Write a v2-style record
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'session', sessionId);
    await e2eeSecureStorage.setEncryptedJson(userId, deviceId, key, {
      version: 2,
      state: bytesToBase64(mockState),
    });

    // Reading without remoteUserId context should return null (can't migrate)
    const result = await e2eeSessionStore.getSessionState(userId, sessionId, '', '');
    expect(result).toBeNull();
  });

  // ── validation failure does not delete valid state ──────────────────

  it('getSessionState context mismatch does not delete stored state', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    // Attempt restore with wrong remoteDeviceId
    const badResult = await e2eeSessionStore.getSessionState(userId, sessionId, remoteUserId, 'wrong-device-id');
    expect(badResult).toBeNull();

    // Valid state should still be recoverable with correct context
    const goodResult = await e2eeSessionStore.getSessionState(userId, sessionId, remoteUserId, remoteDeviceId);
    expect(goodResult).not.toBeNull();
  });

  // ── hasSessionState ─────────────────────────────────────────────────

  it('hasSessionState returns true for valid v3 state', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    const has = await e2eeSessionStore.hasSessionState(userId, sessionId);
    expect(has).toBe(true);
  });

  it('hasSessionState returns false when no state exists', async () => {
    await registerDevice(userId);
    const has = await e2eeSessionStore.hasSessionState(userId, 'nonexistent-session');
    expect(has).toBe(false);
  });

  // ── direction ───────────────────────────────────────────────────────

  it('saveSessionState stores direction when provided', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
      direction: 'outbound',
    });

    const deviceId = await e2eeSecureStorage.getDeviceId(userId);
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'session', sessionId);
    const stored = await e2eeSecureStorage.getEncryptedJson<Record<string, unknown>>(userId, deviceId, key);

    expect(stored!.direction).toBe('outbound');
  });

  // ── deleteSessionState cleans up both envelope and remote device ────

  it('deleteSessionState removes both session envelope and remote device record', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });
    await e2eeSessionStore.saveRemoteDeviceId(userId, sessionId, remoteDeviceId);

    await e2eeSessionStore.deleteSessionState(userId, sessionId);

    const hasSession = await e2eeSessionStore.hasSessionState(userId, sessionId);
    expect(hasSession).toBe(false);

    const storedDeviceId = await e2eeSessionStore.getRemoteDeviceId(userId, sessionId);
    expect(storedDeviceId).toBe('');
  });

  // ── saveSessionState defensive validation ──────────────────────────

  it('saveSessionState throws when remoteDeviceId is empty', async () => {
    await registerDevice(userId);
    await expect(
      e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
        remoteUserId,
        remoteDeviceId: '',
      }),
    ).rejects.toThrow('E2EE session state requires remoteDeviceId');
  });

  it('saveSessionState throws when remoteUserId is empty', async () => {
    await registerDevice(userId);
    await expect(
      e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
        remoteUserId: '',
        remoteDeviceId,
      }),
    ).rejects.toThrow('E2EE session state requires remoteUserId');
  });

  it('saveSessionState throws when userId is empty', async () => {
    await expect(
      e2eeSessionStore.saveSessionState('', sessionId, mockState, {
        remoteUserId,
        remoteDeviceId,
      }),
    ).rejects.toThrow('E2EE session state requires userId');
  });

  it('saveSessionState throws when sessionId is empty', async () => {
    await registerDevice(userId);
    await expect(
      e2eeSessionStore.saveSessionState(userId, '', mockState, {
        remoteUserId,
        remoteDeviceId,
      }),
    ).rejects.toThrow('E2EE session state requires sessionId');
  });

  // ── valid save still works ─────────────────────────────────────────

  it('saveSessionState saves and restores with valid meta', async () => {
    await registerDevice(userId);
    await e2eeSessionStore.saveSessionState(userId, sessionId, mockState, {
      remoteUserId,
      remoteDeviceId,
    });

    const result = await e2eeSessionStore.getSessionState(userId, sessionId, remoteUserId, remoteDeviceId);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });
});
