import type { LocalE2eeKeyMaterial } from '@/e2ee/store/keyStore';

let mockAuthState: {
  currentUser: { id: string } | null;
  sessionGeneration: number;
} = {
  currentUser: { id: 'alice' },
  sessionGeneration: 1,
};

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => mockAuthState),
  },
}));

jest.mock('@/e2ee/manager/localDevice', () => ({
  ensureLocalE2eeDeviceRegistered: jest.fn(),
}));

import { ensureLocalE2eeDeviceRegistered } from '@/e2ee/manager/localDevice';
import {
  __resetE2eeReadinessForTests,
  ensureE2eeReadyForCurrentUser,
} from '@/e2ee/manager/readiness';

const mockEnsureLocalE2eeDeviceRegistered = jest.mocked(ensureLocalE2eeDeviceRegistered);

const readyMaterial = (): LocalE2eeKeyMaterial => ({
  version: 2,
  userId: 'alice',
  deviceId: 'device-alice',
  identityKeyPairBincode: 'identity-private',
  signedPreKeyPairBincode: 'signed-private',
  oneTimePreKeyPairs: [],
  publicBundle: {
    userId: 'alice',
    deviceId: 'device-alice',
    identityKey: 'identity-public',
    signingKey: 'signing-public',
    signedPreKey: { id: 1, key: 'signed-public' },
    signedPreKeySignature: 'signature',
    oneTimePreKeys: [],
  },
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('E2EE readiness gate', () => {
  beforeEach(() => {
    mockAuthState = {
      currentUser: { id: 'alice' },
      sessionGeneration: 1,
    };
    mockEnsureLocalE2eeDeviceRegistered.mockReset();
    __resetE2eeReadinessForTests();
  });

  it('reuses the same promise for the same user and session generation', async () => {
    const ready = deferred<LocalE2eeKeyMaterial>();
    mockEnsureLocalE2eeDeviceRegistered.mockReturnValueOnce(ready.promise);

    const first = ensureE2eeReadyForCurrentUser();
    const second = ensureE2eeReadyForCurrentUser();

    expect(second).toBe(first);
    expect(mockEnsureLocalE2eeDeviceRegistered).toHaveBeenCalledTimes(1);

    ready.resolve(readyMaterial());
    await expect(first).resolves.toBeUndefined();
  });

  it('does not reuse an old promise after session generation changes', () => {
    mockEnsureLocalE2eeDeviceRegistered.mockImplementation(() => new Promise(() => undefined));

    const first = ensureE2eeReadyForCurrentUser();
    mockAuthState = {
      currentUser: { id: 'alice' },
      sessionGeneration: 2,
    };
    const second = ensureE2eeReadyForCurrentUser();

    expect(second).not.toBe(first);
    expect(mockEnsureLocalE2eeDeviceRegistered).toHaveBeenCalledTimes(2);
  });

  it('does not reuse an old promise after user changes', () => {
    mockEnsureLocalE2eeDeviceRegistered.mockImplementation(() => new Promise(() => undefined));

    const first = ensureE2eeReadyForCurrentUser();
    mockAuthState = {
      currentUser: { id: 'bob' },
      sessionGeneration: 1,
    };
    const second = ensureE2eeReadyForCurrentUser();

    expect(second).not.toBe(first);
    expect(mockEnsureLocalE2eeDeviceRegistered).toHaveBeenCalledTimes(2);
  });

  it('fails explicitly when there is no current user', async () => {
    mockAuthState = {
      currentUser: null,
      sessionGeneration: 1,
    };

    await expect(ensureE2eeReadyForCurrentUser()).rejects.toThrow('Current user unavailable for E2EE readiness');
    expect(mockEnsureLocalE2eeDeviceRegistered).not.toHaveBeenCalled();
  });

  it('does not mark a failed readiness attempt as ready', async () => {
    mockEnsureLocalE2eeDeviceRegistered
      .mockRejectedValueOnce(new Error('first readiness failed'))
      .mockResolvedValueOnce(readyMaterial());

    await expect(ensureE2eeReadyForCurrentUser()).rejects.toThrow('first readiness failed');
    await expect(ensureE2eeReadyForCurrentUser()).resolves.toBeUndefined();

    expect(mockEnsureLocalE2eeDeviceRegistered).toHaveBeenCalledTimes(2);
  });
});
