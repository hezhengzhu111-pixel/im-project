import {
  asBase64String,
  bytesToBase64,
  decodeSessionStateEnvelope,
  encodeSessionStateEnvelope,
  extractSessionStateBytes,
  serializeSessionStateEnvelope,
  validateSessionStateEnvelopeContext,
  type Base64String,
  type E2eeSessionStatus,
  type InitialE2eeHandshake,
  type SessionStateEnvelope,
} from '@im/shared-e2ee-core';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';
import { e2eeKeyStore } from './keyStore';

export type RustSessionState = Base64String;

// Memory caches keyed by scoped key (userId:deviceId:sessionId) to prevent
// cross-account and cross-device state contamination.
const statusMemory = new Map<string, E2eeSessionStatus>();
const pendingRequestMemory = new Map<string, unknown>();
const STATUS_KIND = 'status';
const SESSION_KIND = 'session';
const HANDSHAKE_KIND = 'handshake';
const PENDING_REQUEST_KIND = 'pending-request';
const REMOTE_DEVICE_KIND = 'remote-device';

// Track the current active scope so getCachedStatus(sessionId) can resolve
// a scoped memory key without an explicit userId parameter.
let currentScope: { userId: string; deviceId: string } | null = null;

const validStatus = (value: unknown): value is E2eeSessionStatus =>
  value === 'plaintext' || value === 'negotiating' || value === 'encrypted' || value === 'failed';

const namespace = async (userId: string): Promise<{ userId: string; deviceId: string } | null> => {
  const deviceId = await e2eeKeyStore.getDeviceId(userId);
  return deviceId ? { userId, deviceId } : null;
};

const keyFor = (userId: string, deviceId: string, kind: string, sessionId: string): string =>
  e2eeSecureStorage.namespaceKey(userId, deviceId, kind, sessionId);

const scopedMemoryKey = (userId: string, deviceId: string, sessionId: string): string =>
  `${encodeURIComponent(userId)}:${encodeURIComponent(deviceId)}:${encodeURIComponent(sessionId)}`;

const encodeSessionState = (state: Uint8Array | Base64String): RustSessionState =>
  typeof state === 'string' ? asBase64String(state, 'session state') : bytesToBase64(state);

export interface SaveSessionStateMeta {
  remoteUserId: string;
  remoteDeviceId: string;
  direction?: SessionStateEnvelope['direction'];
  localIdentityKey?: string;
  remoteIdentityKey?: string;
}

export const e2eeSessionStore = {
  /**
   * Synchronous cached-status lookup for the currently-active scope.
   * Returns 'plaintext' when no scope has been established (e.g. after
   * logout / before the first E2EE operation of the session).
   */
  getCachedStatus(sessionId: string): E2eeSessionStatus {
    if (currentScope) {
      const key = scopedMemoryKey(currentScope.userId, currentScope.deviceId, sessionId);
      return statusMemory.get(key) || 'plaintext';
    }
    return 'plaintext';
  },

  /**
   * Async cached-status lookup scoped to a specific user.
   * Memory-only — does not touch persistent storage.
   */
  async getCachedStatusFor(userId: string, sessionId: string): Promise<E2eeSessionStatus> {
    const ns = await namespace(userId);
    if (!ns) {
      return 'plaintext';
    }
    const key = scopedMemoryKey(ns.userId, ns.deviceId, sessionId);
    return statusMemory.get(key) || 'plaintext';
  },

  async loadStatus(userId: string, sessionId: string): Promise<E2eeSessionStatus> {
    const ns = await namespace(userId);
    if (!ns) {
      return 'plaintext';
    }
    currentScope = { userId: ns.userId, deviceId: ns.deviceId };
    const stored = await e2eeSecureStorage.getEncryptedJson<{ status?: E2eeSessionStatus }>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, STATUS_KIND, sessionId),
    );
    const scopedKey = scopedMemoryKey(ns.userId, ns.deviceId, sessionId);
    const status = validStatus(stored?.status) ? stored.status : statusMemory.get(scopedKey) || 'plaintext';
    statusMemory.set(scopedKey, status);
    return status;
  },

  async setStatus(userId: string, sessionId: string, status: E2eeSessionStatus): Promise<void> {
    const ns = await namespace(userId);
    if (ns) {
      await e2eeSecureStorage.setEncryptedJson(
        ns.userId,
        ns.deviceId,
        keyFor(ns.userId, ns.deviceId, STATUS_KIND, sessionId),
        { status },
      );
      currentScope = { userId: ns.userId, deviceId: ns.deviceId };
      const scopedKey = scopedMemoryKey(ns.userId, ns.deviceId, sessionId);
      statusMemory.set(scopedKey, status);
      return;
    }
    // Without a device namespace there is no scoped key to write to.
    // Do not fall back to an unscoped global key.
  },

  /**
   * Save session state as a version 3 envelope.
   *
   * The envelope binds the raw bincode state to the current userId,
   * localDeviceId, sessionId, remoteUserId (hashed), and remoteDeviceId.
   * On restore, all fields must match or the state is rejected.
   */
  async saveSessionState(
    userId: string,
    sessionId: string,
    state: Uint8Array | Base64String,
    meta: SaveSessionStateMeta,
  ): Promise<void> {
    if (!userId || userId.length === 0) {
      throw new Error('E2EE session state requires userId');
    }
    if (!sessionId || sessionId.length === 0) {
      throw new Error('E2EE session state requires sessionId');
    }
    if (!meta.remoteUserId || meta.remoteUserId.length === 0) {
      throw new Error('E2EE session state requires remoteUserId');
    }
    if (!meta.remoteDeviceId || meta.remoteDeviceId.length === 0) {
      throw new Error('E2EE session state requires remoteDeviceId');
    }
    const ns = await namespace(userId);
    if (!ns) {
      throw new Error('E2EE namespace unavailable');
    }
    const envelope = await encodeSessionStateEnvelope(state, {
      userId: ns.userId,
      localDeviceId: ns.deviceId,
      sessionId,
      remoteUserId: meta.remoteUserId,
      remoteDeviceId: meta.remoteDeviceId,
    }, {
      direction: meta.direction,
      localIdentityKey: meta.localIdentityKey,
      remoteIdentityKey: meta.remoteIdentityKey,
    });
    await e2eeSecureStorage.setEncryptedJson(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, SESSION_KIND, sessionId),
      JSON.parse(serializeSessionStateEnvelope(envelope)),
    );
    // Keep the remote-device-id record for quick pre-session lookups.
    if (meta.remoteDeviceId) {
      await e2eeSecureStorage.setEncryptedJson(
        ns.userId,
        ns.deviceId,
        keyFor(ns.userId, ns.deviceId, REMOTE_DEVICE_KIND, sessionId),
        { deviceId: meta.remoteDeviceId },
      );
    }
  },

  /**
   * Retrieve session state, validating the version 3 envelope context.
   *
   * @param expectedRemoteUserId — validated against the hashed remoteUserId in the envelope.
   * @param expectedRemoteDeviceId — validated against remoteDeviceId in the envelope.
   *
   * Returns `null` when:
   * - No stored state exists
   * - The envelope is version 2 and cannot be migrated (missing context)
   * - The version 3 envelope fails context validation
   * - The state bytes are empty or invalid
   */
  async getSessionState(
    userId: string,
    sessionId: string,
    expectedRemoteUserId: string,
    expectedRemoteDeviceId: string,
  ): Promise<RustSessionState | null> {
    const ns = await namespace(userId);
    if (!ns) {
      return null;
    }
    const stored = await e2eeSecureStorage.getEncryptedJson<Record<string, unknown>>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, SESSION_KIND, sessionId),
    );
    if (!stored || typeof stored !== 'object') {
      return null;
    }

    // ── Version 3: validate full context ──────────────────────────
    if (stored.version === 3) {
      const envelope = decodeSessionStateEnvelope(stored);
      if (!envelope) {
        return null;
      }
      try {
        await validateSessionStateEnvelopeContext(envelope, {
          userId: ns.userId,
          localDeviceId: ns.deviceId,
          sessionId,
          remoteUserId: expectedRemoteUserId,
          remoteDeviceId: expectedRemoteDeviceId,
        });
      } catch {
        // Context mismatch — do NOT restore, trigger re-negotiation.
        return null;
      }
      try {
        const stateBytes = extractSessionStateBytes(envelope);
        if (stateBytes.length === 0) {
          return null;
        }
        return bytesToBase64(stateBytes);
      } catch {
        return null;
      }
    }

    // ── Version 2: attempt one-shot migration ─────────────────────
    if (stored.version === 2 && typeof stored.state === 'string' && stored.state.length > 0) {
      // V2 data lacks remoteUserId and may lack remoteDeviceId.
      // If both expected values are available, migrate immediately.
      if (expectedRemoteUserId && expectedRemoteDeviceId) {
        try {
          // Preserve the raw state and re-save as v3
          const rawState = asBase64String(stored.state, 'stored v2 session state');
          await this.saveSessionState(userId, sessionId, rawState, {
            remoteUserId: expectedRemoteUserId,
            remoteDeviceId: expectedRemoteDeviceId,
          });
          return rawState;
        } catch {
          // Migration failed — discard and re-negotiate.
          return null;
        }
      }
      // Cannot prove context correctness — discard and re-negotiate.
      return null;
    }

    return null;
  },

  async hasSessionState(userId: string, sessionId: string): Promise<boolean> {
    const ns = await namespace(userId);
    if (!ns) {
      return false;
    }
    const stored = await e2eeSecureStorage.getEncryptedJson<{ version?: number; state?: string }>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, SESSION_KIND, sessionId),
    );
    return stored?.version != null && (stored.version === 3 || (stored.version === 2 && typeof stored.state === 'string' && stored.state.length > 0));
  },

  async deleteSessionState(userId: string, sessionId: string): Promise<void> {
    const ns = await namespace(userId);
    if (ns) {
      await Promise.all([
        e2eeSecureStorage.removeEncrypted(ns.userId, ns.deviceId, keyFor(ns.userId, ns.deviceId, SESSION_KIND, sessionId)),
        e2eeSecureStorage.removeEncrypted(ns.userId, ns.deviceId, keyFor(ns.userId, ns.deviceId, REMOTE_DEVICE_KIND, sessionId)),
      ]);
    }
  },

  /**
   * Persist remote device id for quick pre-session lookups.
   *
   * The authoritative remote device id is stored inside the version 3 envelope.
   * This separate record is a cache for use before a session exists (e.g. to
   * decide which device to target for the first encrypt).
   */
  async saveRemoteDeviceId(userId: string, sessionId: string, deviceId: string): Promise<void> {
    const ns = await namespace(userId);
    if (!ns || !deviceId) {
      return;
    }
    await e2eeSecureStorage.setEncryptedJson(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, REMOTE_DEVICE_KIND, sessionId),
      { deviceId },
    );
  },

  async getRemoteDeviceId(userId: string, sessionId: string): Promise<string> {
    const ns = await namespace(userId);
    if (!ns) {
      return '';
    }
    const stored = await e2eeSecureStorage.getEncryptedJson<{ deviceId?: string }>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, REMOTE_DEVICE_KIND, sessionId),
    );
    return typeof stored?.deviceId === 'string' ? stored.deviceId : '';
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
      await e2eeSecureStorage.removeEncrypted(ns.userId, ns.deviceId, keyFor(ns.userId, ns.deviceId, HANDSHAKE_KIND, sessionId));
    }
  },

  async savePendingRequest(userId: string, sessionId: string, request: unknown): Promise<void> {
    const ns = await namespace(userId);
    if (!ns) {
      return;
    }
    const scopedKey = scopedMemoryKey(ns.userId, ns.deviceId, sessionId);
    pendingRequestMemory.set(scopedKey, request);
    await e2eeSecureStorage.setEncryptedJson(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, PENDING_REQUEST_KIND, sessionId),
      request,
    );
  },

  async getPendingRequest<T>(userId: string, sessionId: string): Promise<T | null> {
    const ns = await namespace(userId);
    if (!ns) {
      return null;
    }
    const scopedKey = scopedMemoryKey(ns.userId, ns.deviceId, sessionId);
    if (pendingRequestMemory.has(scopedKey)) {
      return pendingRequestMemory.get(scopedKey) as T;
    }
    return e2eeSecureStorage.getEncryptedJson<T>(
      ns.userId,
      ns.deviceId,
      keyFor(ns.userId, ns.deviceId, PENDING_REQUEST_KIND, sessionId),
    );
  },

  async clearPendingRequest(userId: string, sessionId: string): Promise<void> {
    const ns = await namespace(userId);
    if (ns) {
      const scopedKey = scopedMemoryKey(ns.userId, ns.deviceId, sessionId);
      pendingRequestMemory.delete(scopedKey);
      await e2eeSecureStorage.removeEncrypted(ns.userId, ns.deviceId, keyFor(ns.userId, ns.deviceId, PENDING_REQUEST_KIND, sessionId));
    }
  },

  clearRuntime(): void {
    statusMemory.clear();
    pendingRequestMemory.clear();
    currentScope = null;
  },
};
