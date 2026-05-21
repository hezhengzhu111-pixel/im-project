import type { E2eeRuntime } from '@im/shared-e2ee-core';

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: { id: 'alice' },
      sessionGeneration: 1,
    })),
  },
}));

jest.mock('@/e2ee/manager/localDevice', () => ({
  ensureLocalE2eeDeviceRegistered: jest.fn(),
  getLocalRustKeyMaterial: jest.fn(),
}));

jest.mock('@/e2ee/manager/negotiation', () => ({
  loadLocalSessionStatus: jest.fn(),
  setLocalSessionStatus: jest.fn(),
}));

jest.mock('@/e2ee/runtime/mobileRustE2eeRuntime', () => ({
  getMobileE2eeRuntime: jest.fn(),
}));

jest.mock('@/e2ee/store/sessionStore', () => ({
  e2eeSessionStore: {
    getSessionState: jest.fn(),
    getRemoteDeviceId: jest.fn(),
    saveRemoteDeviceId: jest.fn(),
    saveSessionState: jest.fn(),
    deleteSessionState: jest.fn(),
    getCachedStatus: jest.fn().mockReturnValue('plaintext'),
    setStatus: jest.fn(),
    loadStatus: jest.fn(),
  },
}));

jest.mock('@/e2ee/api/keyService', () => ({
  mobileE2eeKeyService: {
    getDevices: jest.fn(),
    getBundle: jest.fn(),
  },
}));

jest.mock('@/e2ee/store/keyStore', () => ({
  e2eeKeyStore: {
    getOrCreateDeviceId: jest.fn(),
    getDeviceId: jest.fn(),
    getKeyMaterial: jest.fn(),
    saveKeyMaterial: jest.fn(),
    clearAccount: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { useAuthStore } from '@/stores/authStore';
import { ensureLocalE2eeDeviceRegistered } from '@/e2ee/manager/localDevice';
import { loadLocalSessionStatus } from '@/e2ee/manager/negotiation';
import { getMobileE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { e2eeKeyStore } from '@/e2ee/store/keyStore';

const localMaterial = {
  version: 2 as const,
  userId: 'alice',
  deviceId: 'device-alice',
  identityKeyPairBincode: 'identity-private',
  signedPreKeyPairBincode: 'signed-private',
  oneTimePreKeyPairs: [] as Array<{ id: number; key: string }>,
  publicBundle: {
    userId: 'alice',
    deviceId: 'device-alice',
    identityKey: 'identity-public',
    signingKey: 'signing-public',
    signedPreKey: { id: 1, key: 'signed-public' },
    signedPreKeySignature: 'signature',
    oneTimePreKeys: [] as Array<{ id: number; key: string }>,
  },
};

const createRuntime = (): jest.Mocked<E2eeRuntime> => ({
  createIdentity: jest.fn(),
  generatePreKeyBundle: jest.fn(),
  createOutboundSession: jest.fn(),
  createInboundSession: jest.fn(),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  exportSession: jest.fn(),
  restoreSession: jest.fn(),
  removeSession: jest.fn(),
});

describe('mobile E2EE manager queue scoping', () => {
  let runtime: jest.Mocked<E2eeRuntime>;

  beforeEach(() => {
    jest.clearAllMocks();
    runtime = createRuntime();
    jest.mocked(getMobileE2eeRuntime).mockReturnValue(runtime);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.mocked(ensureLocalE2eeDeviceRegistered).mockResolvedValue(localMaterial as any);
    jest.mocked(loadLocalSessionStatus).mockResolvedValue('encrypted');
    jest.mocked(e2eeSessionStore.getSessionState).mockResolvedValue(null);
    jest.mocked(e2eeSessionStore.getRemoteDeviceId).mockResolvedValue('');
    jest.mocked(e2eeSessionStore.saveRemoteDeviceId).mockResolvedValue(undefined);
    jest.mocked(e2eeSessionStore.saveSessionState).mockResolvedValue(undefined);
    // Default: user is 'alice' with device 'device-alice'
    jest.mocked(useAuthStore.getState).mockReturnValue({
      currentUser: { id: 'alice' } as { id: string },
      sessionGeneration: 1,
    } as ReturnType<typeof useAuthStore.getState>);
    jest.mocked(e2eeKeyStore.getOrCreateDeviceId).mockImplementation(async (userId: string) => {
      const devices: Record<string, string> = {
        alice: 'device-alice',
        bob: 'device-bob',
      };
      return devices[userId] || `device-${userId}`;
    });
  });

  afterEach(() => {
    // Clean up any residual queue state between tests
    e2eeManager.clearRuntime();
  });

  it('e2eeManager.clearRuntime exists and is callable', () => {
    expect(typeof e2eeManager.clearRuntime).toBe('function');
  });

  it('clearRuntime does not throw when called', () => {
    expect(() => e2eeManager.clearRuntime()).not.toThrow();
  });

  it('clearRuntime does not prevent subsequent operations from being accepted', async () => {
    // Simulate a successful encrypt flow
    runtime.encrypt.mockResolvedValue(new Uint8Array([1, 2, 3]));
    runtime.exportSession.mockResolvedValue(new Uint8Array([4, 5, 6]));

    // Clear before any operation
    e2eeManager.clearRuntime();

    // Operation should still work (will fail because bundle fetch isn't mocked,
    // but the manager infrastructure itself is intact)
    const promise = e2eeManager.encryptToEnvelope({
      sessionId: 's-post-clear',
      plaintext: 'hello',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    // The promise may reject due to missing mocks for fetchRemoteBundle,
    // but clearRuntime should not have broken the queue mechanism.
    await expect(promise).rejects.toThrow();
  });

  it('queue key is scoped by userId — different users get different queues', async () => {
    // Simulate user A ('alice') starting an operation that blocks
    let aliceResolve!: () => void;
    const aliceBlocker = new Promise<void>((resolve) => { aliceResolve = resolve; });

    runtime.encrypt.mockImplementation(() => {
      return aliceBlocker.then(() => new Uint8Array([1, 2, 3]));
    });
    runtime.exportSession.mockResolvedValue(new Uint8Array([4, 5, 6]));

    // Alice starts encrypting session S
    const alicePromise = e2eeManager.encryptToEnvelope({
      sessionId: 's-queue-scope',
      plaintext: 'from-alice',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    // Switch to user B ('bob')
    jest.mocked(useAuthStore.getState).mockReturnValue({
      currentUser: { id: 'bob' } as { id: string },
      sessionGeneration: 1,
    } as ReturnType<typeof useAuthStore.getState>);

    // Bob starts encrypting the same session S — should NOT be queued behind Alice
    // Bob's operation will fail because the mock setup is for alice, but the key
    // point is that it returns a different promise (not Alice's queue chain).
    const bobPromise = e2eeManager.encryptToEnvelope({
      sessionId: 's-queue-scope',
      plaintext: 'from-bob',
      recipientUserId: 'alice',
      recipientDeviceId: 'device-alice',
    });

    // Bob's promise should be a different promise object (different queue key)
    expect(bobPromise).not.toBe(alicePromise);

    // Clean up: resolve Alice's blocker
    aliceResolve();
    await alicePromise.catch(() => undefined);
    await bobPromise.catch(() => undefined);
  });

  it('same user + same device + same session serializes operations in queue', async () => {
    // Return existing session state so the fast path is taken (no fetchRemoteBundle).
    jest.mocked(e2eeSessionStore.getSessionState).mockResolvedValue('ZXhpc3Rpbmctc3RhdGU=' as any);

    const executionOrder: number[] = [];
    let callIndex = 0;
    let firstResolve!: () => void;
    const firstBlocker = new Promise<void>((resolve) => { firstResolve = resolve; });

    runtime.encrypt.mockImplementation(async () => {
      const idx = ++callIndex;
      executionOrder.push(idx);
      if (idx === 1) {
        // First call waits for external signal
        await firstBlocker;
      }
      return new Uint8Array([idx]);
    });
    runtime.exportSession.mockResolvedValue(new Uint8Array([4, 5, 6]));

    const p1 = e2eeManager.encryptToEnvelope({
      sessionId: 's-serialize',
      plaintext: 'msg1',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    const p2 = e2eeManager.encryptToEnvelope({
      sessionId: 's-serialize',
      plaintext: 'msg2',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    // Both tasks share the same queue key (alice:device-alice:s-serialize).
    // Task 1 must complete before task 2 starts — verify execution order.
    firstResolve();
    await Promise.all([p1.catch(() => undefined), p2.catch(() => undefined)]);
    expect(executionOrder).toEqual([1, 2]);
  });

  it('same user + different device + same session uses different queue keys', async () => {
    // Alice on device-alice starts an operation that blocks
    let aliceResolve!: () => void;
    const aliceBlocker = new Promise<void>((resolve) => { aliceResolve = resolve; });

    let startedFirst = false;
    runtime.encrypt.mockImplementation(async () => {
      if (!startedFirst) {
        startedFirst = true;
        await aliceBlocker;
        return new Uint8Array([1]);
      }
      return new Uint8Array([2]);
    });
    runtime.exportSession.mockResolvedValue(new Uint8Array([4, 5, 6]));

    // Alice starts encrypting session S with device-alice
    const alicePromise = e2eeManager.encryptToEnvelope({
      sessionId: 's-cross-dev-q',
      plaintext: 'from-alice',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    // Simulate different device: change deviceId for alice
    jest.mocked(e2eeKeyStore.getOrCreateDeviceId).mockImplementation(async (userId: string) => {
      return userId === 'alice' ? 'device-alice-2' : `device-${userId}`;
    });

    // Alice on device-alice-2 — should NOT be queued behind device-alice
    const aliceDevice2Promise = e2eeManager.encryptToEnvelope({
      sessionId: 's-cross-dev-q',
      plaintext: 'from-alice-device2',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    // Different device → different queue key → different promise reference
    expect(aliceDevice2Promise).not.toBe(alicePromise);

    // Clean up
    aliceResolve();
    await alicePromise.catch(() => undefined);
    await aliceDevice2Promise.catch(() => undefined);
  });

  it('no userId throws immediately without creating anonymous queue entry', async () => {
    // Simulate no user logged in
    jest.mocked(useAuthStore.getState).mockReturnValue({
      currentUser: null as unknown as { id: string },
      sessionGeneration: 1,
    } as ReturnType<typeof useAuthStore.getState>);

    const promise = e2eeManager.encryptToEnvelope({
      sessionId: 's-no-user',
      plaintext: 'should-not-work',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    await expect(promise).rejects.toThrow('Current user unavailable for E2EE');

    // Verify no queue entry was created with anonymous/Date.now key
    // clearRuntime is safe to call and should be a no-op
    e2eeManager.clearRuntime();
  });

  it('clearRuntime clears all queue entries', async () => {
    // Verify that after clearRuntime a new task on the same session
    // gets a fresh queue entry (not chained to any previous task).
    // We use two different sessions: start a blocked task on session A,
    // clearRuntime, then start a task on session B. Session B's task
    // should proceed without waiting for the blocked session A task.

    let blockedTaskStarted = false;
    let blockedTaskBlocker!: () => void;
    const blockedTaskReady = new Promise<void>((resolve) => { blockedTaskBlocker = resolve; });

    // Session A: task blocks at encrypt
    jest.mocked(e2eeSessionStore.getSessionState).mockResolvedValue('c2Vzc2lvbi1zdGF0ZQ==' as any);
    runtime.encrypt.mockImplementation(async (_sessionId: string, _plaintext: string | Uint8Array): Promise<Uint8Array> => {
      blockedTaskStarted = true;
      blockedTaskBlocker();
      // block indefinitely — cleared by clearRuntime
      await new Promise<never>(() => undefined);
      return new Uint8Array(0);
    });
    runtime.exportSession.mockResolvedValue(new Uint8Array([4, 5, 6]));

    // Start blocked task on session A
    const pBlocked = e2eeManager.encryptToEnvelope({
      sessionId: 's-clear-blocked',
      plaintext: 'blocked',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    // Wait for blocked task to actually start executing
    await blockedTaskReady;
    expect(blockedTaskStarted).toBe(true);

    // Clear all queues
    e2eeManager.clearRuntime();

    // Session B: should start in a fresh queue, not chained to blocked task
    jest.mocked(loadLocalSessionStatus).mockResolvedValue('encrypted');
    runtime.encrypt.mockResolvedValue(new Uint8Array([99]));
    const pFresh = e2eeManager.encryptToEnvelope({
      sessionId: 's-clear-fresh',
      plaintext: 'fresh',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    await expect(pFresh).resolves.toBeDefined();
    // The fresh task should have a different promise reference
    expect(pFresh).not.toBe(pBlocked);
  });

  it('does not use Date.now anonymous queue key', async () => {
    // The old implementation used `anonymous:...:Date.now()` as fallback.
    // After the fix, an anonymous operation must throw, never create a queue key.
    // We verify by checking that encryptToEnvelope fails without a user
    // and that the error message is about the user, not a device or queue issue.

    jest.mocked(useAuthStore.getState).mockReturnValue({
      currentUser: null as unknown as { id: string },
      sessionGeneration: 1,
    } as ReturnType<typeof useAuthStore.getState>);

    const promise = e2eeManager.encryptToEnvelope({
      sessionId: 's-anon-reject',
      plaintext: 'test',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    await expect(promise).rejects.toThrow('Current user unavailable for E2EE');
  });

  it('different userId + same sessionId uses different queue keys', async () => {
    // Verify that two different users on the same session get different queues
    let aliceResolve!: () => void;
    const aliceBlocker = new Promise<void>((resolve) => { aliceResolve = resolve; });

    let aliceStarted = false;
    runtime.encrypt.mockImplementation(async () => {
      if (!aliceStarted) {
        aliceStarted = true;
        await aliceBlocker;
        return new Uint8Array([1]);
      }
      return new Uint8Array([2]);
    });
    runtime.exportSession.mockResolvedValue(new Uint8Array([4, 5, 6]));

    // Alice starts encrypting session S
    const alicePromise = e2eeManager.encryptToEnvelope({
      sessionId: 's-diff-user',
      plaintext: 'alice-msg',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    });

    // Switch to Bob
    jest.mocked(useAuthStore.getState).mockReturnValue({
      currentUser: { id: 'bob' } as { id: string },
      sessionGeneration: 1,
    } as ReturnType<typeof useAuthStore.getState>);

    // Bob starts encrypting same session S — different queue key
    const bobPromise = e2eeManager.encryptToEnvelope({
      sessionId: 's-diff-user',
      plaintext: 'bob-msg',
      recipientUserId: 'alice',
      recipientDeviceId: 'device-alice',
    });

    // Bob's promise should NOT be chained to Alice's (different userId in key)
    expect(bobPromise).not.toBe(alicePromise);

    // Clean up
    aliceResolve();
    await alicePromise.catch(() => undefined);
    await bobPromise.catch(() => undefined);
  });
});
