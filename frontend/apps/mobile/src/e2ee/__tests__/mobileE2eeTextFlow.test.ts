import type { UploadBundleRequest } from '@im/shared-e2ee-core';

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
      return {
        code: 0,
        message: 'ok',
        data: deviceId ? [{ deviceId, userId: targetUserId, lastActiveAt: new Date().toISOString() }] : [],
      };
    }),
    getBundle: jest.fn(async (userId: string, deviceId?: string) => {
      const bundle = mockBundles.get(userId);
      if (!bundle || (deviceId && bundle.deviceId !== deviceId)) {
        return { code: 404, message: 'missing', data: null };
      }
      return { code: 0, message: 'ok', data: bundle };
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
import { e2eeKeyStore } from '@/e2ee/store/keyStore';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { clearAllPendingEncryptedMessages } from '@/e2ee/store/pendingDecryptStore';

const setUser = (userId: string) => {
  mockActiveUserId = userId;
};

describe('mobile E2EE text integration', () => {
  beforeEach(async () => {
    mockBundles.clear();
    mockDevices.clear();
    mockPendingByUser.clear();
    e2eeSessionStore.clearRuntime();
    clearAllPendingEncryptedMessages();
    setUser('alice');
    await e2eeKeyStore.clearAccount('alice');
    await e2eeKeyStore.clearAccount('bob');
  });

  it('establishes X3DH + Double Ratchet and exchanges encrypted text both directions', async () => {
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

    const aliceToBob = await e2eeManager.encryptMessage(sessionId, '111111');
    expect(aliceToBob.ciphertext).not.toContain('111111');
    setUser('bob');
    await expect(
      e2eeManager.decryptMessage(sessionId, 'alice', aliceToBob.header, aliceToBob.ciphertext),
    ).resolves.toBe('111111');

    const bobToAlice = await e2eeManager.encryptMessage(sessionId, '222222');
    expect(bobToAlice.ciphertext).not.toContain('222222');
    setUser('alice');
    await expect(
      e2eeManager.decryptMessage(sessionId, 'bob', bobToAlice.header, bobToAlice.ciphertext),
    ).resolves.toBe('222222');
  });
});
