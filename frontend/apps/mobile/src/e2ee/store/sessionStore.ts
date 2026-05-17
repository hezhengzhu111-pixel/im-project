import type { E2eeSessionStatus, InitialE2eeHandshake, RatchetState } from '@im/shared-e2ee-core';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';
import { e2eeKeyStore } from './keyStore';

const statusMemory = new Map<string, E2eeSessionStatus>();
const pendingRequestMemory = new Map<string, unknown>();
const STATUS_KIND = 'status';
const RATCHET_KIND = 'ratchet';
const HANDSHAKE_KIND = 'handshake';
const PENDING_REQUEST_KIND = 'pending-request';

const validStatus = (value: unknown): value is E2eeSessionStatus =>
  value === 'plaintext' || value === 'negotiating' || value === 'encrypted' || value === 'failed';

const namespace = async (userId: string): Promise<{ userId: string; deviceId: string } | null> => {
  const deviceId = await e2eeKeyStore.getDeviceId(userId);
  return deviceId ? { userId, deviceId } : null;
};

const keyFor = (userId: string, deviceId: string, kind: string, sessionId: string): string =>
  e2eeSecureStorage.namespaceKey(userId, deviceId, kind, sessionId);

export const e2eeSessionStore = {
  getCachedStatus(sessionId: string): E2eeSessionStatus {
    return statusMemory.get(sessionId) || 'plaintext';
  },

  async loadStatus(userId: string, sessionId: string): Promise<E2eeSessionStatus> {
    const ns = await namespace(userId);
    if (!ns) {
      return statusMemory.get(sessionId) || 'plaintext';
    }
    const stored = await e2eeSecureStorage.getEncryptedJson<{ status?: E2eeSessionStatus }>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, STATUS_KIND, sessionId),
    );
    const status = validStatus(stored?.status) ? stored.status : statusMemory.get(sessionId) || 'plaintext';
    statusMemory.set(sessionId, status);
    return status;
  },

  async setStatus(userId: string, sessionId: string, status: E2eeSessionStatus): Promise<void> {
    statusMemory.set(sessionId, status);
    const ns = await namespace(userId);
    if (ns) {
      await e2eeSecureStorage.setEncryptedJson(
        ns.userId,
        ns.deviceId,
        keyFor(ns.userId, ns.deviceId, STATUS_KIND, sessionId),
        { status },
      );
    }
  },

  async saveRatchetState(userId: string, sessionId: string, state: RatchetState): Promise<void> {
    const ns = await namespace(userId);
    if (!ns) {
      throw new Error('E2EE namespace unavailable');
    }
    await e2eeSecureStorage.setEncryptedJson(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, RATCHET_KIND, sessionId),
      state,
    );
  },

  async getRatchetState(userId: string, sessionId: string): Promise<RatchetState | null> {
    const ns = await namespace(userId);
    if (!ns) {
      return null;
    }
    return e2eeSecureStorage.getEncryptedJson<RatchetState>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, RATCHET_KIND, sessionId),
    );
  },

  async deleteRatchetState(userId: string, sessionId: string): Promise<void> {
    const ns = await namespace(userId);
    if (ns) {
      e2eeSecureStorage.removeEncrypted(ns.userId, ns.deviceId, keyFor(ns.userId, ns.deviceId, RATCHET_KIND, sessionId));
    }
  },

  async saveInitialHandshake(userId: string, sessionId: string, handshake: InitialE2eeHandshake): Promise<void> {
    const ns = await namespace(userId);
    if (!ns) {
      throw new Error('E2EE namespace unavailable');
    }
    await e2eeSecureStorage.setEncryptedJson(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, HANDSHAKE_KIND, sessionId),
      handshake,
    );
  },

  async getInitialHandshake(userId: string, sessionId: string): Promise<InitialE2eeHandshake | null> {
    const ns = await namespace(userId);
    if (!ns) {
      return null;
    }
    return e2eeSecureStorage.getEncryptedJson<InitialE2eeHandshake>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, HANDSHAKE_KIND, sessionId),
    );
  },

  async clearInitialHandshake(userId: string, sessionId: string): Promise<void> {
    const ns = await namespace(userId);
    if (ns) {
      e2eeSecureStorage.removeEncrypted(ns.userId, ns.deviceId, keyFor(ns.userId, ns.deviceId, HANDSHAKE_KIND, sessionId));
    }
  },

  async savePendingRequest(userId: string, sessionId: string, request: unknown): Promise<void> {
    pendingRequestMemory.set(sessionId, request);
    const ns = await namespace(userId);
    if (!ns) {
      return;
    }
    await e2eeSecureStorage.setEncryptedJson(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, PENDING_REQUEST_KIND, sessionId),
      request,
    );
  },

  async getPendingRequest<T>(userId: string, sessionId: string): Promise<T | null> {
    if (pendingRequestMemory.has(sessionId)) {
      return pendingRequestMemory.get(sessionId) as T;
    }
    const ns = await namespace(userId);
    if (!ns) {
      return null;
    }
    return e2eeSecureStorage.getEncryptedJson<T>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, PENDING_REQUEST_KIND, sessionId),
    );
  },

  async clearPendingRequest(userId: string, sessionId: string): Promise<void> {
    pendingRequestMemory.delete(sessionId);
    const ns = await namespace(userId);
    if (ns) {
      e2eeSecureStorage.removeEncrypted(ns.userId, ns.deviceId, keyFor(ns.userId, ns.deviceId, PENDING_REQUEST_KIND, sessionId));
    }
  },

  clearRuntime(): void {
    statusMemory.clear();
    pendingRequestMemory.clear();
  },
};
