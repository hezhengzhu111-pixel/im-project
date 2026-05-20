import type { E2eeRuntime, RustLocalE2eeKeyMaterial } from '@im/shared-e2ee-core';

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
  },
}));

jest.mock('@/e2ee/api/keyService', () => ({
  mobileE2eeKeyService: {
    getDevices: jest.fn(),
    getBundle: jest.fn(),
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
import { ensureLocalE2eeDeviceRegistered, getLocalRustKeyMaterial } from '@/e2ee/manager/localDevice';
import { loadLocalSessionStatus, setLocalSessionStatus } from '@/e2ee/manager/negotiation';
import { getMobileE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';

const localMaterial: RustLocalE2eeKeyMaterial & { userId: string; deviceId: string } = {
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

describe('mobile E2EE session state commit boundary', () => {
  let runtime: jest.Mocked<E2eeRuntime>;

  beforeEach(() => {
    jest.clearAllMocks();
    runtime = createRuntime();
    jest.mocked(getMobileE2eeRuntime).mockReturnValue(runtime);
    jest.mocked(ensureLocalE2eeDeviceRegistered).mockResolvedValue(localMaterial);
    jest.mocked(getLocalRustKeyMaterial).mockResolvedValue(localMaterial);
    jest.mocked(loadLocalSessionStatus).mockResolvedValue('encrypted');
    jest.mocked(e2eeSessionStore.getSessionState).mockResolvedValue('c3RhdGU=');
    jest.mocked(e2eeSessionStore.getRemoteDeviceId).mockResolvedValue('device-bob');
    jest.mocked(e2eeSessionStore.saveRemoteDeviceId).mockResolvedValue(undefined);
    jest.mocked(e2eeSessionStore.saveSessionState).mockResolvedValue(undefined);
    runtime.restoreSession.mockResolvedValue(undefined);
    runtime.encrypt.mockResolvedValue(new Uint8Array([1, 2, 3]));
    runtime.decrypt.mockResolvedValue(new Uint8Array([112, 108, 97, 105, 110]));
    runtime.exportSession.mockResolvedValue(new Uint8Array([4, 5, 6]));
  });

  it('rejects encryptToEnvelope without returning an envelope when session state save fails', async () => {
    jest.mocked(e2eeSessionStore.saveSessionState).mockRejectedValueOnce(new Error('keychain write failed'));

    await expect(e2eeManager.encryptToEnvelope({
      sessionId: 's-save-fails',
      plaintext: 'hello',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    })).rejects.toThrow('E2EE session state storage persist failed');

    expect(setLocalSessionStatus).not.toHaveBeenCalledWith('s-save-fails', 'encrypted');
  });

  it('does not save empty state when exportSession fails', async () => {
    runtime.exportSession.mockRejectedValueOnce(new Error('native export failed'));

    await expect(e2eeManager.encryptToEnvelope({
      sessionId: 's-export-fails',
      plaintext: 'hello',
      recipientUserId: 'bob',
      recipientDeviceId: 'device-bob',
    })).rejects.toThrow('E2EE session state storage persist failed');

    expect(e2eeSessionStore.saveSessionState).not.toHaveBeenCalled();
  });

  it('rejects decryptEnvelope after plaintext decrypt when session state save fails', async () => {
    jest.mocked(e2eeSessionStore.saveSessionState).mockRejectedValueOnce(new Error('keychain write failed'));

    await expect(e2eeManager.decryptEnvelope({
      version: 2,
      algorithm: 'rust-x25519-x3dh-dr-v1',
      senderDeviceId: 'device-bob',
      recipientDeviceId: 'device-alice',
      sessionId: 's-decrypt-save-fails',
      wire: 'AQID',
    }, 'bob')).rejects.toThrow('E2EE session state storage persist failed');

    expect(runtime.decrypt).toHaveBeenCalled();
    expect(setLocalSessionStatus).not.toHaveBeenCalledWith('s-decrypt-save-fails', 'encrypted');
  });
});
