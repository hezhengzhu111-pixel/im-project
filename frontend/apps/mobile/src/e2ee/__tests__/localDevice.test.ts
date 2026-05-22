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

const mockPublishedOtkState = new Map<string, { publishedIds: number[]; publishedAt: number }>();

jest.mock('@/e2ee/store/keyStore', () => ({
  e2eeKeyStore: {
    getOrCreateDeviceId: jest.fn(),
    getDeviceId: jest.fn(),
    getKeyMaterial: jest.fn(),
    saveKeyMaterial: jest.fn(),
    clearAccount: jest.fn(),
  },
}));

jest.mock('@/e2ee/storage/secureE2eeStorage', () => ({
  e2eeSecureStorage: {
    getPublishedOtkState: jest.fn(
      async (userId: string, deviceId: string) =>
        mockPublishedOtkState.get(`${userId}:${deviceId}`) ?? null,
    ),
    setPublishedOtkState: jest.fn(
      async (userId: string, deviceId: string, state: { publishedIds: number[]; publishedAt: number }) => {
        mockPublishedOtkState.set(`${userId}:${deviceId}`, state);
      },
    ),
    clearPublishedOtkState: jest.fn(
      async (userId: string, deviceId: string) => {
        mockPublishedOtkState.delete(`${userId}:${deviceId}`);
      },
    ),
    namespaceKey: jest.fn(
      (userId: string, deviceId: string, kind: string, id: string) =>
        `ns:${userId}:${deviceId}:${kind}:${id}`,
    ),
    setEncryptedJson: jest.fn(),
    getEncryptedJson: jest.fn(),
    removeEncrypted: jest.fn(),
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
  heartbeatLocalE2eeDevice,
  replenishOneTimePreKeys,
} from '@/e2ee/manager/localDevice';
import { e2eeKeyStore } from '@/e2ee/store/keyStore';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';
import { mobileE2eeKeyService } from '@/e2ee/api/keyService';
import { getMobileE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { logger } from '@/utils/logger';

const mockGetOrCreateDeviceId = jest.mocked(e2eeKeyStore.getOrCreateDeviceId);
const mockGetKeyMaterial = jest.mocked(e2eeKeyStore.getKeyMaterial);
const mockSaveKeyMaterial = jest.mocked(e2eeKeyStore.saveKeyMaterial);
const mockUploadBundle = jest.mocked(mobileE2eeKeyService.uploadBundle);
const mockHeartbeat = jest.mocked(mobileE2eeKeyService.heartbeat);
const mockGeneratePreKeyBundle = jest.mocked(getMobileE2eeRuntime().generatePreKeyBundle);

const materialFor = (userId: string, withOtks = true): LocalE2eeKeyMaterial => ({
  version: 2,
  userId,
  deviceId: `device-${userId}`,
  identityKeyPairBincode: `identity-private-${userId}`,
  signedPreKeyPairBincode: `signed-private-${userId}`,
  oneTimePreKeyPairs: withOtks
    ? [
        { id: 1, keyPairBincode: `otk-private-${userId}-1`, publicKey: `otk-public-${userId}-1` },
        { id: 2, keyPairBincode: `otk-private-${userId}-2`, publicKey: `otk-public-${userId}-2` },
      ]
    : [],
  publicBundle: {
    userId,
    deviceId: `device-${userId}`,
    identityKey: `identity-public-${userId}`,
    signingKey: `signing-public-${userId}`,
    signedPreKey: { id: 1, key: `signed-public-${userId}` },
    signedPreKeySignature: `signature-${userId}`,
    oneTimePreKeys: withOtks
      ? [
          { id: 1, key: `otk-public-${userId}-1` },
          { id: 2, key: `otk-public-${userId}-2` },
        ]
      : [],
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
    mockSaveKeyMaterial.mockReset();
    mockUploadBundle.mockClear();
    mockHeartbeat.mockClear();
    mockGeneratePreKeyBundle.mockReset();
    mockPublishedOtkState.clear();
    jest.mocked(logger.warn).mockClear();
    jest.mocked(logger.info).mockClear();

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
    // Material already exists, so no bundle upload — only heartbeat.
    expect(mockUploadBundle).not.toHaveBeenCalled();
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

describe('OTK upload lifecycle', () => {
  beforeEach(() => {
    mockAuthState = {
      currentUser: { id: 'alice' },
      sessionGeneration: 1,
    };
    __resetLocalE2eeDeviceRegistrationForTests();
    mockGetOrCreateDeviceId.mockReset();
    mockGetKeyMaterial.mockReset();
    mockSaveKeyMaterial.mockReset();
    mockUploadBundle.mockClear();
    mockHeartbeat.mockClear();
    mockGeneratePreKeyBundle.mockReset();
    mockPublishedOtkState.clear();
    jest.mocked(logger.warn).mockClear();
    jest.mocked(logger.info).mockClear();

    mockGetOrCreateDeviceId.mockImplementation(async (userId: string) => `device-${userId}`);
  });

  // --- 5.1: 首次注册会上传 one-time prekeys ---
  it('uploads one-time prekeys on first registration', async () => {
    mockGetKeyMaterial.mockResolvedValue(null); // no existing material

    const generated = materialFor('alice');
    mockGeneratePreKeyBundle.mockResolvedValue(generated);
    mockSaveKeyMaterial.mockImplementation(async (_userId, _deviceId, mat) => mat as LocalE2eeKeyMaterial);

    await ensureLocalE2eeDeviceRegistered();

    expect(mockUploadBundle).toHaveBeenCalledTimes(1);

    const uploadCall = mockUploadBundle.mock.calls[0][0];
    expect(uploadCall.oneTimePreKeys).toHaveLength(2);
    expect(uploadCall.oneTimePreKeys[0].id).toBe(1);
    expect(uploadCall.oneTimePreKeys[1].id).toBe(2);

    // Verify published state was recorded.
    const state = mockPublishedOtkState.get('alice:device-alice');
    expect(state).toBeDefined();
    expect(state!.publishedIds).toEqual([1, 2]);

    // Heartbeat should still fire.
    expect(mockHeartbeat).toHaveBeenCalledTimes(1);
  });

  // --- 5.2: 第二次 ensureLocalE2eeDeviceRegistered 不会重复上传同一批 OTK ---
  it('does not re-upload OTKs on subsequent ensure calls', async () => {
    // First call: no material, generates fresh.
    mockGetKeyMaterial.mockResolvedValueOnce(null);
    const generated = materialFor('alice');
    mockGeneratePreKeyBundle.mockResolvedValue(generated);
    mockSaveKeyMaterial.mockImplementation(async (_userId, _deviceId, mat) => mat as LocalE2eeKeyMaterial);

    await ensureLocalE2eeDeviceRegistered();
    expect(mockUploadBundle).toHaveBeenCalledTimes(1);
    expect(mockUploadBundle.mock.calls[0][0].oneTimePreKeys).toHaveLength(2);

    // Reset flight tracker between calls.
    __resetLocalE2eeDeviceRegistrationForTests();

    // Second call: material exists, published OTK state exists.
    mockGetKeyMaterial.mockResolvedValue(materialFor('alice'));

    await ensureLocalE2eeDeviceRegistered();

    // uploadBundle should NOT be called again — only the first call uploads.
    expect(mockUploadBundle).toHaveBeenCalledTimes(1);
    expect(mockHeartbeat).toHaveBeenCalledTimes(2);
  });

  // --- 5.3: heartbeat 不会触发 OTK 重传 ---
  it('heartbeat does not trigger OTK upload', async () => {
    mockGetKeyMaterial.mockResolvedValue(materialFor('alice'));

    // Seed published OTK state as if device was already registered.
    mockPublishedOtkState.set('alice:device-alice', {
      publishedIds: [1, 2],
      publishedAt: Date.now(),
    });

    await heartbeatLocalE2eeDevice();

    expect(mockUploadBundle).not.toHaveBeenCalled();
    expect(mockHeartbeat).toHaveBeenCalledTimes(1);
    expect(mockHeartbeat).toHaveBeenCalledWith('device-alice');
  });

  // --- 5.4: userId/deviceId 隔离 ---
  it('isolates OTK published state by userId and deviceId', async () => {
    // Register Alice's device.
    mockGetKeyMaterial.mockResolvedValueOnce(null);
    mockGetOrCreateDeviceId.mockResolvedValueOnce('device-alice');
    const aliceMaterial = materialFor('alice');
    mockGeneratePreKeyBundle.mockResolvedValueOnce(aliceMaterial);
    mockSaveKeyMaterial.mockImplementation(async (_userId, _deviceId, mat) => mat as LocalE2eeKeyMaterial);

    await ensureLocalE2eeDeviceRegistered();
    expect(mockUploadBundle).toHaveBeenCalledTimes(1);

    // Alice's OTK state should exist.
    expect(mockPublishedOtkState.get('alice:device-alice')).toBeDefined();
    // Bob's OTK state should NOT exist.
    expect(mockPublishedOtkState.get('bob:device-bob')).toBeUndefined();

    __resetLocalE2eeDeviceRegistrationForTests();

    // Register Bob's device — must have its own separate OTK state.
    mockAuthState = { currentUser: { id: 'bob' }, sessionGeneration: 1 };
    mockGetKeyMaterial.mockResolvedValueOnce(null);
    mockGetOrCreateDeviceId.mockResolvedValueOnce('device-bob');
    const bobMaterial = materialFor('bob');
    mockGeneratePreKeyBundle.mockResolvedValueOnce(bobMaterial);

    await ensureLocalE2eeDeviceRegistered();
    expect(mockUploadBundle).toHaveBeenCalledTimes(2);

    // Both Alice and Bob should have independent published states.
    const aliceState = mockPublishedOtkState.get('alice:device-alice');
    const bobState = mockPublishedOtkState.get('bob:device-bob');
    expect(aliceState).toBeDefined();
    expect(bobState).toBeDefined();
    expect(aliceState!.publishedIds).not.toEqual(bobState!.publishedIds);

    // Bob's upload should contain his own OTKs, not Alice's.
    const bobUploadCall = mockUploadBundle.mock.calls[1][0];
    expect(bobUploadCall.deviceId).toBe('device-bob');
  });

  // --- 5.5: clearAccount 会清理 OTK 发布状态 ---
  it('clearPublishedOtkState removes published OTK state for the device', async () => {
    mockPublishedOtkState.set('alice:device-alice', {
      publishedIds: [1, 2, 3],
      publishedAt: Date.now(),
    });

    await e2eeSecureStorage.clearPublishedOtkState('alice', 'device-alice');
    expect(mockPublishedOtkState.get('alice:device-alice')).toBeUndefined();
  });

  // --- 5.6: 本地状态损坏时不会盲目重复上传旧 OTK ---
  it('does not re-upload OTKs when published state is missing (corruption/upgrade)', async () => {
    // Simulate: material exists but published OTK state is missing.
    mockGetKeyMaterial.mockResolvedValue(materialFor('alice'));
    // No published OTK state set — simulates corruption.

    await ensureLocalE2eeDeviceRegistered();

    // Must NOT call uploadBundle (would re-upload potentially-consumed OTKs).
    expect(mockUploadBundle).not.toHaveBeenCalled();
    // Should log a warning.
    expect(logger.warn).toHaveBeenCalledWith(
      'e2ee',
      expect.stringContaining('OTK published state missing'),
      expect.any(Object),
    );
    // Heartbeat should still work.
    expect(mockHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('still heartbeats even when OTK state is missing', async () => {
    mockGetKeyMaterial.mockResolvedValue(materialFor('alice'));
    // No published OTK state.

    await ensureLocalE2eeDeviceRegistered();

    expect(mockHeartbeat).toHaveBeenCalledWith('device-alice');
  });
});

describe('replenishOneTimePreKeys', () => {
  beforeEach(() => {
    mockAuthState = {
      currentUser: { id: 'alice' },
      sessionGeneration: 1,
    };
    __resetLocalE2eeDeviceRegistrationForTests();
    mockGetOrCreateDeviceId.mockReset();
    mockGetKeyMaterial.mockReset();
    mockSaveKeyMaterial.mockReset();
    mockUploadBundle.mockClear();
    mockHeartbeat.mockClear();
    mockGeneratePreKeyBundle.mockReset();
    mockPublishedOtkState.clear();
    jest.mocked(logger.warn).mockClear();
    jest.mocked(logger.info).mockClear();

    mockGetOrCreateDeviceId.mockImplementation(async (userId: string) => `device-${userId}`);
  });

  it('throws when no existing key material exists', async () => {
    mockGetKeyMaterial.mockResolvedValue(null);

    await expect(replenishOneTimePreKeys()).rejects.toThrow(
      'Cannot replenish OTKs without existing key material',
    );
  });

  it('generates new OTKs with non-conflicting IDs and uploads only new ones', async () => {
    const existing = materialFor('alice');
    mockGetKeyMaterial.mockResolvedValue(existing);

    // Existing published OTK IDs: [1, 2].
    mockPublishedOtkState.set('alice:device-alice', {
      publishedIds: [1, 2],
      publishedAt: Date.now(),
    });

    // The replenishment generates OTKs starting from max(1,2) + 1 = 3.
    const newOtks: LocalE2eeKeyMaterial = {
      version: 2,
      userId: 'alice',
      deviceId: 'device-alice',
      identityKeyPairBincode: 'new-identity-private',
      signedPreKeyPairBincode: 'new-signed-private',
      oneTimePreKeyPairs: [
        { id: 3, keyPairBincode: 'new-otk-private-3', publicKey: 'new-otk-public-3' },
        { id: 4, keyPairBincode: 'new-otk-private-4', publicKey: 'new-otk-public-4' },
      ],
      publicBundle: {
        userId: 'alice',
        deviceId: 'device-alice',
        identityKey: 'new-identity-public',
        signingKey: 'new-signing-public',
        signedPreKey: { id: 1, key: 'new-signed-public' },
        signedPreKeySignature: 'new-signature',
        oneTimePreKeys: [
          { id: 3, key: 'new-otk-public-3' },
          { id: 4, key: 'new-otk-public-4' },
        ],
      },
    };
    mockGeneratePreKeyBundle.mockResolvedValue(newOtks);
    mockSaveKeyMaterial.mockImplementation(async (_u, _d, mat) => mat as LocalE2eeKeyMaterial);

    await replenishOneTimePreKeys(2);

    // Should upload only the new OTKs (3 and 4).
    expect(mockUploadBundle).toHaveBeenCalledTimes(1);
    const uploadCall = mockUploadBundle.mock.calls[0][0];
    expect(uploadCall.oneTimePreKeys).toHaveLength(2);
    expect(uploadCall.oneTimePreKeys[0].id).toBe(3);
    expect(uploadCall.oneTimePreKeys[1].id).toBe(4);

    // Published state should now include both old and new IDs.
    const state = mockPublishedOtkState.get('alice:device-alice');
    expect(state).toBeDefined();
    expect(state!.publishedIds).toEqual([1, 2, 3, 4]);

    // The merged material should preserve the original identity key.
    const saveCall = mockSaveKeyMaterial.mock.calls[0] as unknown as [
      string,
      string,
      LocalE2eeKeyMaterial,
    ];
    const savedMaterial = saveCall[2];
    expect(savedMaterial.identityKeyPairBincode).toBe(existing.identityKeyPairBincode);
    expect(savedMaterial.oneTimePreKeyPairs).toHaveLength(4);
  });

  it('does not upload anything when generated bundle has no OTKs', async () => {
    const existing = materialFor('alice');
    mockGetKeyMaterial.mockResolvedValue(existing);
    mockPublishedOtkState.set('alice:device-alice', {
      publishedIds: [1, 2],
      publishedAt: Date.now(),
    });

    const emptyOtks = { ...materialFor('alice', false), publicBundle: { ...materialFor('alice', false).publicBundle, oneTimePreKeys: [] } };
    mockGeneratePreKeyBundle.mockResolvedValue(emptyOtks);

    await replenishOneTimePreKeys(0);

    expect(mockUploadBundle).not.toHaveBeenCalled();
  });
});
