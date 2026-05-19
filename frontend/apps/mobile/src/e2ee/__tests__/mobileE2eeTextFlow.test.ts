import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
  type E2eeRuntime,
  type RustE2eeEnvelope,
  type RustLocalE2eeKeyMaterial,
  type UploadBundleRequest,
} from '@im/shared-e2ee-core';

let mockActiveUserId = 'alice';
const mockBundles = new Map<string, UploadBundleRequest>();
const mockDevices = new Map<string, string>();
const mockPendingByUser = new Map<string, Array<Record<string, unknown>>>();

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: mockActiveUserId
        ? {
            id: mockActiveUserId,
            username: mockActiveUserId,
            nickname: mockActiveUserId,
          }
        : null,
    })),
  },
}));

jest.mock('@/e2ee/api/keyService', () => ({
  mobileE2eeKeyService: {
    uploadBundle: jest.fn(async (data: UploadBundleRequest) => {
      mockBundles.set(mockActiveUserId, data);
      mockDevices.set(mockActiveUserId, data.deviceId);
      return { code: 0, message: 'ok', data: data.deviceId };
    }),
    heartbeat: jest.fn(async (deviceId: string) => ({ code: 0, message: 'ok', data: deviceId })),
    getDevices: jest.fn(async (userId?: string) => {
      const targetUserId = userId || mockActiveUserId;
      const deviceId = mockDevices.get(targetUserId);
      const bundle = mockBundles.get(targetUserId);
      return {
        code: 0,
        message: 'ok',
        data: deviceId ? [{ deviceId, userId: targetUserId, identityKey: bundle?.identityKey, lastActiveAt: new Date().toISOString() }] : [],
      };
    }),
    getBundle: jest.fn(async (userId: string, deviceId?: string) => {
      const bundle = mockBundles.get(userId);
      if (!bundle || (deviceId && bundle.deviceId !== deviceId)) {
        return { code: 404, message: 'missing', data: null };
      }
      return {
        code: 0,
        message: 'ok',
        data: {
          ...bundle,
          signingKey: bundle.signingIdentityKey,
          oneTimePreKey: bundle.oneTimePreKeys[0]?.key,
          oneTimePreKeyId: bundle.oneTimePreKeys[0]?.id,
        },
      };
    }),
    requestEncryption: jest.fn(async (sessionId: string, _identityKey?: string, _signedPreKey?: string, requestPayloadJson?: string) => {
      const participants = sessionId.replace(/^p_/, '').split('_').filter(Boolean);
      const targetUserId = participants.find((item) => item !== mockActiveUserId) || '';
      const pending = {
        sessionId,
        requesterId: mockActiveUserId,
        targetUserId,
        requestPayloadJson,
      };
      mockPendingByUser.set(targetUserId, [...(mockPendingByUser.get(targetUserId) || []), pending]);
      return { code: 0, message: 'ok', data: sessionId };
    }),
    getPendingNegotiations: jest.fn(async () => ({
      code: 0,
      message: 'ok',
      data: mockPendingByUser.get(mockActiveUserId) || [],
    })),
    acceptEncryption: jest.fn(async (sessionId: string) => ({ code: 0, message: 'ok', data: sessionId })),
    rejectEncryption: jest.fn(async (sessionId: string) => ({ code: 0, message: 'ok', data: sessionId })),
    disableEncryption: jest.fn(async (sessionId: string) => ({ code: 0, message: 'ok', data: sessionId })),
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
import {
  acceptPendingNegotiation,
  getStoredPendingNegotiationRequest,
  handleNegotiationAccepted,
  initiateNegotiation,
  syncPendingNegotiations,
} from '@/e2ee/manager/negotiation';
import { ensureLocalE2eeDeviceRegistered } from '@/e2ee/manager/localDevice';
import { setMobileE2eeRuntimeForTesting } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { e2eeKeyStore } from '@/e2ee/store/keyStore';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { clearAllPendingEncryptedMessages } from '@/e2ee/store/pendingDecryptStore';

const keyMaterial = (owner: string): RustLocalE2eeKeyMaterial => ({
  version: 2,
  identityKeyPairBincode: bytesToBase64(utf8ToBytes(`identity-private-${owner}`)),
  signedPreKeyPairBincode: bytesToBase64(utf8ToBytes(`signed-private-${owner}`)),
  oneTimePreKeyPairs: [{ id: 1, keyPairBincode: bytesToBase64(utf8ToBytes(`otk-private-${owner}`)), publicKey: bytesToBase64(utf8ToBytes(`otk-public-${owner}`)) }],
  publicBundle: {
    identityKey: bytesToBase64(utf8ToBytes(`identity-public-${owner}`)),
    signingKey: bytesToBase64(utf8ToBytes(`signing-public-${owner}`)),
    signedPreKey: { id: 1, key: bytesToBase64(utf8ToBytes(`signed-public-${owner}`)) },
    signedPreKeySignature: bytesToBase64(utf8ToBytes(`signature-${owner}`)),
    oneTimePreKeys: [{ id: 1, key: bytesToBase64(utf8ToBytes(`otk-public-${owner}`)) }],
  },
});

const fakeRuntime = (): E2eeRuntime => {
  const sessions = new Set<string>();
  return {
    async createIdentity() {
      return keyMaterial(mockActiveUserId);
    },
    async generatePreKeyBundle() {
      return keyMaterial(mockActiveUserId);
    },
    async createOutboundSession(input) {
      sessions.add(input.sessionId);
      return new Uint8Array(40);
    },
    async createInboundSession(input) {
      sessions.add(input.sessionId);
    },
    async encrypt(sessionId, plaintext) {
      sessions.add(sessionId);
      const text = typeof plaintext === 'string' ? plaintext : bytesToUtf8(plaintext);
      return utf8ToBytes(`wire:${text}`);
    },
    async decrypt(_sessionId, encryptedWire) {
      const wire = typeof encryptedWire === 'string'
        ? bytesToUtf8(base64ToBytes(encryptedWire))
        : encryptedWire instanceof Uint8Array
          ? bytesToUtf8(encryptedWire)
          : bytesToUtf8(base64ToBytes((encryptedWire as RustE2eeEnvelope).wire));
      return utf8ToBytes(wire.replace(/^wire:/, ''));
    },
    async exportSession(sessionId) {
      return utf8ToBytes(`state:${sessionId}:${sessions.has(sessionId) ? 'ready' : 'empty'}`);
    },
    async restoreSession(sessionId) {
      sessions.add(sessionId);
    },
    async removeSession(sessionId) {
      sessions.delete(sessionId);
    },
  };
};

const setUser = (userId: string) => {
  mockActiveUserId = userId;
};

describe('mobile Rust E2EE v2 text integration', () => {
  beforeEach(async () => {
    mockBundles.clear();
    mockDevices.clear();
    mockPendingByUser.clear();
    e2eeSessionStore.clearRuntime();
    clearAllPendingEncryptedMessages();
    setMobileE2eeRuntimeForTesting(fakeRuntime());
    setUser('alice');
    await e2eeKeyStore.clearAccount('alice');
    await e2eeKeyStore.clearAccount('bob');
  });

  afterEach(() => {
    setMobileE2eeRuntimeForTesting(null);
  });

  it('uses Rust v2 envelopes for encrypted text in both directions', async () => {
    const sessionId = 'alice_bob';

    setUser('bob');
    await ensureLocalE2eeDeviceRegistered();
    setUser('alice');
    await ensureLocalE2eeDeviceRegistered();

    expect(await initiateNegotiation(sessionId, 'bob')).toBe(true);

    setUser('bob');
    await syncPendingNegotiations(sessionId);
    await expect(getStoredPendingNegotiationRequest(sessionId)).resolves.toMatchObject({
      sessionId,
      requesterId: 'alice',
      targetUserId: 'bob',
    });
    expect(await acceptPendingNegotiation(sessionId)).toBe(true);

    setUser('alice');
    await handleNegotiationAccepted(sessionId);

    const aliceToBob = await e2eeManager.encryptToEnvelope({
      sessionId,
      plaintext: '111111',
      recipientUserId: 'bob',
    });
    expect(aliceToBob.version).toBe(2);
    expect(aliceToBob.algorithm).toBe('rust-x25519-x3dh-dr-v1');
    expect(aliceToBob.wire).not.toContain('111111');

    setUser('bob');
    await expect(e2eeManager.decryptEnvelope(aliceToBob, 'alice')).resolves.toBe('111111');

    const bobToAlice = await e2eeManager.encryptToEnvelope({
      sessionId,
      plaintext: '222222',
      recipientUserId: 'alice',
    });
    expect(bobToAlice.version).toBe(2);
    expect(bobToAlice.algorithm).toBe('rust-x25519-x3dh-dr-v1');

    setUser('alice');
    await expect(e2eeManager.decryptEnvelope(bobToAlice, 'bob')).resolves.toBe('222222');
  });
});
