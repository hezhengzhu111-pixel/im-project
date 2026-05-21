import {
  RUST_E2EE_ALGORITHM,
  RUST_E2EE_ENVELOPE_VERSION,
  asBase64String,
  bytesToBase64,
  bytesToUtf8,
  isRustE2eeEnvelope,
  sanitizeE2eeLogValue,
  type RustE2eeEnvelope,
  type E2eeRuntime,
  type RustPublicPreKeyBundle,
} from '@im/shared-e2ee-core';
import { mobileE2eeKeyService } from '@/e2ee/api/keyService';
import { getMobileE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { e2eeKeyStore } from '@/e2ee/store/keyStore';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { logger } from '@/utils/logger';
import { requireCurrentE2eeUserId } from './context';
import { ensureLocalE2eeDeviceRegistered, getLocalRustKeyMaterial } from './localDevice';
import { loadLocalSessionStatus, setLocalSessionStatus } from './negotiation';

export interface EncryptToEnvelopeInput {
  sessionId: string;
  plaintext: string;
  recipientUserId: string;
  recipientDeviceId?: string;
}

const newestDevice = (devices: Array<{ deviceId?: string; lastActiveAt?: string; last_active_at?: string }>) =>
  [...devices].sort((left, right) => {
    const leftTime = new Date(left.lastActiveAt || left.last_active_at || 0).getTime();
    const rightTime = new Date(right.lastActiveAt || right.last_active_at || 0).getTime();
    return rightTime - leftTime;
  })[0];

const normalizeRemoteBundle = (
  raw: Record<string, unknown>,
  userId: string,
  deviceId: string,
): RustPublicPreKeyBundle => {
  const identityKey = typeof raw.identityKey === 'string' ? raw.identityKey : '';
  const signingKey =
    typeof raw.signingKey === 'string'
      ? raw.signingKey
      : typeof raw.signingIdentityKey === 'string'
        ? raw.signingIdentityKey
        : '';
  const signedPreKey = typeof raw.signedPreKey === 'string'
    ? { id: typeof raw.signedPreKeyId === 'number' ? raw.signedPreKeyId : 1, key: raw.signedPreKey }
    : raw.signedPreKey && typeof raw.signedPreKey === 'object'
      ? raw.signedPreKey as RustPublicPreKeyBundle['signedPreKey']
      : { id: 1, key: '' };
  const oneTimePreKey = typeof raw.oneTimePreKey === 'string' && raw.oneTimePreKey.length > 0
    ? { id: typeof raw.oneTimePreKeyId === 'number' ? raw.oneTimePreKeyId : 0, key: raw.oneTimePreKey }
    : raw.oneTimePreKey && typeof raw.oneTimePreKey === 'object'
      ? raw.oneTimePreKey as RustPublicPreKeyBundle['oneTimePreKey']
      : null;

  return {
    userId,
    deviceId: typeof raw.deviceId === 'string' && raw.deviceId ? raw.deviceId : deviceId,
    identityKey,
    signingKey,
    signedPreKey,
    signedPreKeySignature: typeof raw.signedPreKeySignature === 'string' ? raw.signedPreKeySignature : '',
    oneTimePreKey,
    oneTimePreKeys: Array.isArray(raw.oneTimePreKeys)
      ? raw.oneTimePreKeys as RustPublicPreKeyBundle['oneTimePreKeys']
      : undefined,
  };
};

const describeError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error || 'unknown error');
};

const hasExportedStateBytes = (state: Uint8Array | string): boolean =>
  typeof state === 'string' ? state.length > 0 : state.byteLength > 0;

const commitSessionState = async (
  runtime: E2eeRuntime,
  userId: string,
  sessionId: string,
): Promise<void> => {
  try {
    const state = await runtime.exportSession(sessionId);
    if (!hasExportedStateBytes(state)) {
      throw new Error('exported session state is empty');
    }
    await e2eeSessionStore.saveSessionState(userId, sessionId, state);
  } catch (error) {
    throw new Error(`E2EE session state storage persist failed for session ${sessionId}: ${describeError(error)}`);
  }
};

class MobileE2eeManager {
  private readonly queues = new Map<string, Promise<unknown>>();

  /**
   * Generate a scoped queue key for the session.
   *
   * The key includes userId, deviceId, and sessionId so two E2EE runtimes
   * belonging to different accounts or different devices of the same account
   * never share the same serialisation chain.
   *
   * If no user is logged in the call throws immediately — anonymous E2EE
   * operations are not supported because a device namespace is required
   * for key material and session state.
   */
  private async queueKey(sessionId: string): Promise<string> {
    const userId = requireCurrentE2eeUserId();
    const deviceId = await e2eeKeyStore.getOrCreateDeviceId(userId);
    if (!deviceId) {
      throw new Error('E2EE device namespace unavailable');
    }
    return `${encodeURIComponent(userId)}:${encodeURIComponent(deviceId)}:${encodeURIComponent(sessionId)}`;
  }

  private async enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const key = await this.queueKey(sessionId);
    const previous = this.queues.get(key) || Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(key, next.catch(() => undefined));
    return next.finally(() => {
      if (this.queues.get(key) === next) {
        this.queues.delete(key);
      }
    });
  }

  clearRuntime(): void {
    this.queues.clear();
  }

  async encryptToEnvelope(params: EncryptToEnvelopeInput): Promise<RustE2eeEnvelope> {
    return this.enqueue(params.sessionId, async () => {
      const userId = requireCurrentE2eeUserId();
      const status = await loadLocalSessionStatus(params.sessionId);
      if (status !== 'encrypted') {
        throw new Error('E2EE negotiation has not been accepted');
      }

      const local = await ensureLocalE2eeDeviceRegistered();
      const runtime = getMobileE2eeRuntime();
      const existingState = await e2eeSessionStore.getSessionState(userId, params.sessionId);
      let recipientDeviceId = params.recipientDeviceId || (await e2eeSessionStore.getRemoteDeviceId(userId, params.sessionId));
      let handshake: string | undefined;

      if (existingState) {
        await runtime.restoreSession(params.sessionId, existingState);
      } else {
        const remoteBundle = await this.fetchRemoteBundle(
          params.recipientUserId,
          recipientDeviceId || undefined,
          { conversationId: params.sessionId, requesterDeviceId: local.deviceId },
        );
        recipientDeviceId = remoteBundle.deviceId || recipientDeviceId;
        await runtime.removeSession(params.sessionId).catch(() => undefined);
        const handshakeBytes = await runtime.createOutboundSession({
          sessionId: params.sessionId,
          localKeys: local,
          remoteBundle,
        });
        handshake = bytesToBase64(handshakeBytes);
        await e2eeSessionStore.saveRemoteDeviceId(userId, params.sessionId, recipientDeviceId);
      }

      if (!recipientDeviceId) {
        throw new Error('Rust E2EE recipient device id unavailable');
      }

      const wire = await runtime.encrypt(params.sessionId, params.plaintext);
      await commitSessionState(runtime, userId, params.sessionId);
      await setLocalSessionStatus(params.sessionId, 'encrypted');

      return {
        version: RUST_E2EE_ENVELOPE_VERSION,
        algorithm: RUST_E2EE_ALGORITHM,
        senderDeviceId: local.deviceId,
        recipientDeviceId,
        sessionId: params.sessionId,
        handshake,
        wire: bytesToBase64(wire),
      };
    });
  }

  async decryptEnvelope(envelope: RustE2eeEnvelope, senderId: string): Promise<string> {
    return this.enqueue(envelope.sessionId, async () => {
      if (!isRustE2eeEnvelope(envelope)) {
        throw new Error('Unsupported E2EE envelope');
      }
      const userId = requireCurrentE2eeUserId();
      const runtime = getMobileE2eeRuntime();
      const state = await e2eeSessionStore.getSessionState(userId, envelope.sessionId);

      if (state) {
        await runtime.restoreSession(envelope.sessionId, state);
      } else if (envelope.handshake) {
        const localKeys = await getLocalRustKeyMaterial();
        const remoteIdentityKey = await this.resolveSenderIdentityKey(senderId, envelope.senderDeviceId);
        await runtime.removeSession(envelope.sessionId).catch(() => undefined);
        await runtime.createInboundSession({
          sessionId: envelope.sessionId,
          localKeys,
          remoteIdentityKey,
          handshake: asBase64String(envelope.handshake, 'e2ee envelope handshake'),
        });
        await e2eeSessionStore.saveRemoteDeviceId(userId, envelope.sessionId, envelope.senderDeviceId);
      } else {
        throw new Error('Rust E2EE session state unavailable and envelope has no handshake');
      }

      try {
        const plaintext = await runtime.decrypt(envelope.sessionId, envelope);
        await commitSessionState(runtime, userId, envelope.sessionId);
        await setLocalSessionStatus(envelope.sessionId, 'encrypted');
        return bytesToUtf8(plaintext);
      } catch (error) {
        logger.warn('e2ee', 'rust envelope decrypt failed', sanitizeE2eeLogValue({
          sessionId: envelope.sessionId,
          senderDeviceId: envelope.senderDeviceId,
          recipientDeviceId: envelope.recipientDeviceId,
          hasHandshake: Boolean(envelope.handshake),
          error,
        }));
        throw error;
      }
    });
  }

  async clearSession(sessionId: string): Promise<void> {
    const userId = requireCurrentE2eeUserId();
    await e2eeSessionStore.deleteSessionState(userId, sessionId);
    try {
      await getMobileE2eeRuntime().removeSession(sessionId);
    } catch {
      // Local state is already cleared; native runtime may be unavailable in tests.
    }
  }

  private async fetchRemoteBundle(
    userId: string,
    deviceId?: string,
    options?: { conversationId?: string; requesterDeviceId?: string },
  ): Promise<RustPublicPreKeyBundle> {
    const devicesResp = await mobileE2eeKeyService.getDevices(userId);
    const devices = devicesResp.data || [];
    const selected = deviceId ? devices.find((device) => device.deviceId === deviceId) : newestDevice(devices);
    const resolvedDeviceId = selected?.deviceId || deviceId;
    if (!resolvedDeviceId) {
      throw new Error('remote user has no active Rust E2EE device');
    }

    const bundleResp = await mobileE2eeKeyService.getBundle(userId, resolvedDeviceId, {
      conversationId: options?.conversationId,
      requesterDeviceId: options?.requesterDeviceId,
    });
    if (!bundleResp.data) {
      throw new Error('remote user has no Rust E2EE key bundle');
    }
    return normalizeRemoteBundle(bundleResp.data as unknown as Record<string, unknown>, userId, resolvedDeviceId);
  }

  private async resolveSenderIdentityKey(senderUserId: string, senderDeviceId: string): Promise<string> {
    const devicesResp = await mobileE2eeKeyService.getDevices(senderUserId);
    const device = (devicesResp.data || []).find((item) => item.deviceId === senderDeviceId);
    if (device?.identityKey) {
      return device.identityKey;
    }
    const bundleResp = await mobileE2eeKeyService.getBundle(senderUserId, senderDeviceId);
    if (bundleResp.data?.identityKey) {
      return bundleResp.data.identityKey;
    }
    throw new Error('sender Rust identity key not found');
  }
}

export const e2eeManager = new MobileE2eeManager();
