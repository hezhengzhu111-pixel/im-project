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

jest.mock('@/e2ee/store/keyStore', () => ({
  e2eeKeyStore: {
    getOrCreateDeviceId: jest.fn(),
    getDeviceId: jest.fn(),
    getKeyMaterial: jest.fn(),
    saveKeyMaterial: jest.fn(),
  },
}));

jest.mock('@/e2ee/api/keyService', () => ({
  mobileE2eeKeyService: {
    uploadBundle: jest.fn(() => Promise.resolve({ code: 0, message: 'ok', data: null })),
    heartbeat: jest.fn(() => Promise.resolve({ code: 0, message: 'ok', data: null })),
  },
}));

jest.mock('@/e2ee/runtime/mobileRustE2eeRuntime', () => ({
  getMobileE2eeRuntime: jest.fn(() => ({
    generatePreKeyBundle: jest.fn(),
  })),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  __resetLocalE2eeDeviceRegistrationForTests,
  ensureLocalE2eeDeviceRegistered,
} from '@/e2ee/manager/localDevice';
import { e2eeKeyStore } from '@/e2ee/store/keyStore';
import { mobileE2eeKeyService } from '@/e2ee/api/keyService';

const mockGetOrCreateDeviceId = jest.mocked(e2eeKeyStore.getOrCreateDeviceId);
const mockGetKeyMaterial = jest.mocked(e2eeKeyStore.getKeyMaterial);
const mockUploadBundle = jest.mocked(mobileE2eeKeyService.uploadBundle);
const mockHeartbeat = jest.mocked(mobileE2eeKeyService.heartbeat);

const materialFor = (userId: string): LocalE2eeKeyMaterial => ({
  version: 2,
  userId,
  deviceId: `device-${userId}`,
  identityKeyPairBincode: `identity-private-${userId}`,
  signedPreKeyPairBincode: `signed-private-${userId}`,
  oneTimePreKeyPairs: [],
  publicBundle: {
    userId,
    deviceId: `device-${userId}`,
    identityKey: `identity-public-${userId}`,
    signingKey: `signing-public-${userId}`,
    signedPreKey: { id: 1, key: `signed-public-${userId}` },
    signedPreKeySignature: `signature-${userId}`,
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

describe('local E2EE device registration in-flight isolation', () => {
  beforeEach(() => {
    mockAuthState = {
      currentUser: { id: 'alice' },
      sessionGeneration: 1,
    };
    __resetLocalE2eeDeviceRegistrationForTests();
    mockGetOrCreateDeviceId.mockReset();
    mockGetKeyMaterial.mockReset();
    mockUploadBundle.mockClear();
    mockHeartbeat.mockClear();
    mockGetOrCreateDeviceId.mockImplementation(async (userId: string) => `device-${userId}`);
  });

  it('reuses the same promise for the same user and session generation', async () => {
    const ready = deferred<LocalE2eeKeyMaterial | null>();
    mockGetKeyMaterial.mockReturnValueOnce(ready.promise);

    const first = ensureLocalE2eeDeviceRegistered();
    const second = ensureLocalE2eeDeviceRegistered();

    expect(second).toBe(first);
    expect(mockGetOrCreateDeviceId).toHaveBeenCalledTimes(1);

    ready.resolve(materialFor('alice'));
    await expect(first).resolves.toMatchObject({ userId: 'alice', deviceId: 'device-alice' });
    expect(mockUploadBundle).toHaveBeenCalledTimes(1);
  });

  it('does not reuse in-flight registration after session generation changes', () => {
    mockGetKeyMaterial.mockImplementation(() => new Promise(() => undefined));

    const first = ensureLocalE2eeDeviceRegistered();
    mockAuthState = {
      currentUser: { id: 'alice' },
      sessionGeneration: 2,
    };
    const second = ensureLocalE2eeDeviceRegistered();

    expect(second).not.toBe(first);
    expect(mockGetOrCreateDeviceId).toHaveBeenCalledTimes(2);
  });

  it('does not reuse in-flight registration after user changes', () => {
    mockGetKeyMaterial.mockImplementation(() => new Promise(() => undefined));

    const first = ensureLocalE2eeDeviceRegistered();
    mockAuthState = {
      currentUser: { id: 'bob' },
      sessionGeneration: 1,
    };
    const second = ensureLocalE2eeDeviceRegistered();

    expect(second).not.toBe(first);
    expect(mockGetOrCreateDeviceId).toHaveBeenCalledTimes(2);
  });

  it('does not let an old promise finally clear a newer in-flight registration', async () => {
    const firstLoad = deferred<LocalE2eeKeyMaterial | null>();
    const secondLoad = deferred<LocalE2eeKeyMaterial | null>();
    mockGetKeyMaterial
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise);

    const first = ensureLocalE2eeDeviceRegistered();
    first.catch(() => undefined);
    mockAuthState = {
      currentUser: { id: 'bob' },
      sessionGeneration: 1,
    };
    const second = ensureLocalE2eeDeviceRegistered();

    firstLoad.reject(new Error('old registration failed'));
    await expect(first).rejects.toThrow('old registration failed');

    const third = ensureLocalE2eeDeviceRegistered();
    expect(third).toBe(second);
    expect(mockGetOrCreateDeviceId).toHaveBeenCalledTimes(2);

    secondLoad.resolve(materialFor('bob'));
    await expect(second).resolves.toMatchObject({ userId: 'bob', deviceId: 'device-bob' });
  });
});
