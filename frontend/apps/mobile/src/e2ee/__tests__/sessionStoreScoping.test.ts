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

const keychainGet = jest.mocked(Keychain.getGenericPassword);
const keychainSet = jest.mocked(Keychain.setGenericPassword);

async function registerDevice(userId: string): Promise<string> {
  const deviceId = await e2eeSecureStorage.getOrCreateDeviceId(userId);
  return deviceId;
}

describe('E2EE session store cross-account scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    e2eeSessionStore.clearRuntime();
    // Reset Keychain mock to default (no credentials stored).
    keychainGet.mockResolvedValue(false as unknown as false);
    keychainSet.mockResolvedValue({ service: 'mock', storage: 'keychain' } as unknown as Keychain.Result);
  });

  // ── getCachedStatus safety ───────────────────────────────────────

  it('getCachedStatus returns plaintext when no currentScope is set', () => {
    expect(e2eeSessionStore.getCachedStatus('any-session')).toBe('plaintext');
  });

  it('getCachedStatus returns scoped value after setStatus establishes scope', async () => {
    const userId = 'user-gcs';
    await registerDevice(userId);
    await e2eeSessionStore.setStatus(userId, 's-gcs', 'encrypted');
    expect(e2eeSessionStore.getCachedStatus('s-gcs')).toBe('encrypted');
  });

  it('getCachedStatus returns plaintext after clearRuntime resets scope', async () => {
    const userId = 'user-gcs-reset';
    await registerDevice(userId);
    await e2eeSessionStore.setStatus(userId, 's-gcs-reset', 'encrypted');
    e2eeSessionStore.clearRuntime();
    expect(e2eeSessionStore.getCachedStatus('s-gcs-reset')).toBe('plaintext');
  });

  // ── getCachedStatusFor ───────────────────────────────────────────

  it('getCachedStatusFor returns plaintext when user has no device namespace', async () => {
    const status = await e2eeSessionStore.getCachedStatusFor('no-device-user', 's-any');
    expect(status).toBe('plaintext');
  });

  it('getCachedStatusFor returns scoped memory value for user with device', async () => {
    const userId = 'user-cached-for';
    await registerDevice(userId);
    await e2eeSessionStore.setStatus(userId, 's-cached-for', 'encrypted');
    const status = await e2eeSessionStore.getCachedStatusFor(userId, 's-cached-for');
    expect(status).toBe('encrypted');
  });

  it('getCachedStatusFor does not leak status across users', async () => {
    const userA = 'cross-user-A';
    const userB = 'cross-user-B';
    await registerDevice(userA);
    await registerDevice(userB);
    await e2eeSessionStore.setStatus(userA, 's-shared', 'encrypted');
    const statusB = await e2eeSessionStore.getCachedStatusFor(userB, 's-shared');
    expect(statusB).toBe('plaintext');
  });

  // ── loadStatus cross-account isolation ───────────────────────────

  it('loadStatus returns plaintext when user has no device namespace', async () => {
    const status = await e2eeSessionStore.loadStatus('no-ns-user', 's-ns');
    expect(status).toBe('plaintext');
  });

  it('loadStatus does not read another user cached status for same sessionId', async () => {
    const userA = 'load-iso-A';
    const userB = 'load-iso-B';
    await registerDevice(userA);
    await registerDevice(userB);
    await e2eeSessionStore.setStatus(userA, 's-shared-load', 'encrypted');
    const statusB = await e2eeSessionStore.loadStatus(userB, 's-shared-load');
    expect(statusB).toBe('plaintext');
  });

  it('loadStatus for user A does not pollute subsequent getCachedStatus for user B', async () => {
    const userA = 'load-pollute-A';
    const userB = 'load-pollute-B';
    await registerDevice(userA);
    await registerDevice(userB);
    await e2eeSessionStore.setStatus(userA, 's-pollute', 'encrypted');
    // User B loads — currentScope moves to B
    await e2eeSessionStore.loadStatus(userB, 's-pollute');
    // getCachedStatus should now use B's scope, not A's
    const cached = e2eeSessionStore.getCachedStatus('s-pollute');
    expect(cached).toBe('plaintext');
  });

  // ── setStatus without namespace does not write global memory ─────

  it('setStatus without namespace does not write to unscoped memory', async () => {
    const userA = 'no-ns-write-A';
    await registerDevice(userA);
    await e2eeSessionStore.setStatus(userA, 's-no-ns', 'encrypted');
    expect(e2eeSessionStore.getCachedStatus('s-no-ns')).toBe('encrypted');

    // Clear runtime to reset scope
    e2eeSessionStore.clearRuntime();

    // Now set status for a user with NO device namespace.
    // In the old code this would write to unscoped memory and be visible
    // via getCachedStatus. After the fix it must NOT.
    await e2eeSessionStore.setStatus('no-device-user', 's-no-ns', 'negotiating');

    // getCachedStatus has no scope → plaintext
    expect(e2eeSessionStore.getCachedStatus('s-no-ns')).toBe('plaintext');

    // getCachedStatusFor with a real user should also return plaintext
    // since the unscoped write never happened
    const statusForA = await e2eeSessionStore.getCachedStatusFor(userA, 's-no-ns');
    expect(statusForA).toBe('plaintext');
  });

  // ── Cross-device isolation ───────────────────────────────────────

  it('same user different deviceId does not share memory cache', async () => {
    const userId = 'cross-device-user';

    // Register device-1
    const device1 = await e2eeSecureStorage.getOrCreateDeviceId(userId);
    await e2eeSessionStore.setStatus(userId, 's-cross-device', 'encrypted');

    // Simulate device change: clear runtime, re-register with new deviceId
    e2eeSessionStore.clearRuntime();

    // Override the stored deviceId to simulate a different device.
    // We do this by clearing the account and re-registering.
    await e2eeSecureStorage.clearAccount(userId);
    const device2 = await e2eeSecureStorage.getOrCreateDeviceId(userId);
    // device2 should be different from device1 (new random UUID)
    expect(device2).not.toBe(device1);

    // Loading status from the new device should not see old device's cache
    const status = await e2eeSessionStore.loadStatus(userId, 's-cross-device');
    expect(status).toBe('plaintext');
  });

  // ── pendingRequest cross-account isolation ───────────────────────

  it('getPendingRequest returns null when user has no device namespace', async () => {
    const req = await e2eeSessionStore.getPendingRequest('no-device-pr', 's-pr');
    expect(req).toBeNull();
  });

  it('savePendingRequest without namespace does not write to unscoped memory', async () => {
    const userA = 'pr-nons-A';
    await registerDevice(userA);

    // Try saving a pending request for a user without device namespace
    await e2eeSessionStore.savePendingRequest('no-device-pr-user', 's-pr-nons', { action: 'test' });

    // User A should NOT see this request
    const reqA = await e2eeSessionStore.getPendingRequest(userA, 's-pr-nons');
    expect(reqA).toBeNull();
  });

  it('pending request saved by user A is not visible to user B for same sessionId', async () => {
    const userA = 'pr-iso-A';
    const userB = 'pr-iso-B';
    await registerDevice(userA);
    await registerDevice(userB);

    await e2eeSessionStore.savePendingRequest(userA, 's-pr-shared', { action: 'from-A' });

    const reqB = await e2eeSessionStore.getPendingRequest(userB, 's-pr-shared');
    expect(reqB).toBeNull();

    // User A should still see their own request
    const reqA = await e2eeSessionStore.getPendingRequest<{ action: string }>(userA, 's-pr-shared');
    expect(reqA).toEqual({ action: 'from-A' });
  });

  it('clearPendingRequest for user A does not affect user B pending request', async () => {
    const userA = 'pr-clear-A';
    const userB = 'pr-clear-B';
    await registerDevice(userA);
    await registerDevice(userB);

    await e2eeSessionStore.savePendingRequest(userA, 's-pr-clear', { action: 'from-A' });
    await e2eeSessionStore.savePendingRequest(userB, 's-pr-clear', { action: 'from-B' });

    // Clear user A's pending request
    await e2eeSessionStore.clearPendingRequest(userA, 's-pr-clear');

    // User A's request should be gone
    const reqA = await e2eeSessionStore.getPendingRequest(userA, 's-pr-clear');
    expect(reqA).toBeNull();

    // User B's request should still be intact
    const reqB = await e2eeSessionStore.getPendingRequest<{ action: string }>(userB, 's-pr-clear');
    expect(reqB).toEqual({ action: 'from-B' });
  });

  it('clearPendingRequest without namespace does not clear unscoped memory for other users', async () => {
    const userA = 'pr-clearns-A';
    await registerDevice(userA);
    await e2eeSessionStore.savePendingRequest(userA, 's-pr-clearns', { action: 'from-A' });

    // Call clearPendingRequest for a user without device namespace
    await e2eeSessionStore.clearPendingRequest('no-device-user', 's-pr-clearns');

    // User A's request should still be intact
    const reqA = await e2eeSessionStore.getPendingRequest<{ action: string }>(userA, 's-pr-clearns');
    expect(reqA).toEqual({ action: 'from-A' });
  });

  // ── clearRuntime ─────────────────────────────────────────────────

  it('clearRuntime clears all memory maps and currentScope', async () => {
    const userA = 'clear-rt-A';
    await registerDevice(userA);
    await e2eeSessionStore.setStatus(userA, 's-clear-rt', 'encrypted');
    await e2eeSessionStore.savePendingRequest(userA, 's-clear-rt', { action: 'test' });

    // Verify memory is populated before clear
    expect(e2eeSessionStore.getCachedStatus('s-clear-rt')).toBe('encrypted');
    const reqBefore = await e2eeSessionStore.getPendingRequest<{ action: string }>(userA, 's-clear-rt');
    expect(reqBefore).toEqual({ action: 'test' });

    e2eeSessionStore.clearRuntime();

    // Memory cache should be empty after clear
    expect(e2eeSessionStore.getCachedStatus('s-clear-rt')).toBe('plaintext');
    // getPendingRequest falls back to secure storage (which is NOT cleared by
    // clearRuntime), so we verify memory was cleared by checking currentScope reset
    expect(e2eeSessionStore.getCachedStatus('any-session')).toBe('plaintext');
  });

  it('clearRuntime does not delete secure storage', async () => {
    const userId = 'clear-rt-ss';
    await registerDevice(userId);
    await e2eeSessionStore.setStatus(userId, 's-clear-rt-ss', 'encrypted');

    // Verify it's persisted via the secure storage layer (which includes
    // the memorySecure fallback, unlike calling Keychain directly).
    const deviceId = await e2eeSecureStorage.getDeviceId(userId);
    const key = e2eeSecureStorage.namespaceKey(userId, deviceId, 'status', 's-clear-rt-ss');
    const beforeClear = await e2eeSecureStorage.getEncryptedJson<{ status: string }>(userId, deviceId, key);
    expect(beforeClear).toEqual({ status: 'encrypted' });

    e2eeSessionStore.clearRuntime();

    // Secure storage should still have the data
    const afterClear = await e2eeSecureStorage.getEncryptedJson<{ status: string }>(userId, deviceId, key);
    expect(afterClear).toEqual({ status: 'encrypted' });
  });

  // ── statusMemory uses scoped keys ────────────────────────────────

  it('same sessionId for different users maps to different memory entries', async () => {
    const userA = 'mem-scope-A';
    const userB = 'mem-scope-B';
    await registerDevice(userA);
    await registerDevice(userB);

    await e2eeSessionStore.setStatus(userA, 's-mem', 'encrypted');

    // Switch to user B
    const statusB = await e2eeSessionStore.loadStatus(userB, 's-mem');
    expect(statusB).toBe('plaintext');

    // User A's cached status should still be retrievable
    const statusA = await e2eeSessionStore.getCachedStatusFor(userA, 's-mem');
    expect(statusA).toBe('encrypted');
  });
});
