import {
  initReceivingChain,
  initSendingChain,
  sanitizeE2eeLogValue,
  validateP256PublicKeyBase64,
  x3dhInitiate,
  x3dhRespond,
  type E2eeDevice,
  type E2eeSessionStatus,
  type InitialE2eeHandshake,
  type PendingEncryptionRequest,
  type PreKeyBundle,
} from '@im/shared-e2ee-core';
import { mobileE2eeKeyService } from '@/e2ee/api/keyService';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import { logger } from '@/utils/logger';
import { emitE2eeStatusChange, emitPendingE2eeRequest } from '@/e2ee/statusEvents';
import { requireCurrentE2eeUserId } from './context';
import { ensureLocalE2eeDeviceRegistered } from './localDevice';

interface StoredPendingRequest extends PendingEncryptionRequest {
  action?: string;
}

const negotiationInFlight = new Map<string, Promise<boolean>>();

const newestDevice = (devices: E2eeDevice[]): E2eeDevice | undefined =>
  [...devices].sort((left, right) => {
    const leftTime = new Date(left.lastActiveAt || left.last_active_at || 0).getTime();
    const rightTime = new Date(right.lastActiveAt || right.last_active_at || 0).getTime();
    return rightTime - leftTime;
  })[0];

const isInitialHandshake = (value: unknown): value is InitialE2eeHandshake => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<InitialE2eeHandshake>;
  return (
    typeof record.senderIdentityKey === 'string' &&
    typeof record.ephemeralPublicKey === 'string' &&
    typeof record.deviceId === 'string'
  );
};

const parseInitialHandshake = (requestPayloadJson?: string): InitialE2eeHandshake => {
  if (!requestPayloadJson) {
    throw new Error('E2EE negotiation request payload missing');
  }
  const parsed = JSON.parse(requestPayloadJson) as unknown;
  if (!isInitialHandshake(parsed)) {
    throw new Error('E2EE negotiation request payload invalid');
  }
  validateP256PublicKeyBase64(parsed.senderIdentityKey, 'sender identity key');
  validateP256PublicKeyBase64(parsed.ephemeralPublicKey, 'sender ephemeral key');
  return parsed;
};

export const getLocalSessionStatus = (sessionId: string): E2eeSessionStatus =>
  e2eeSessionStore.getCachedStatus(sessionId);

export const loadLocalSessionStatus = async (sessionId: string): Promise<E2eeSessionStatus> =>
  e2eeSessionStore.loadStatus(requireCurrentE2eeUserId(), sessionId);

export const setLocalSessionStatus = async (
  sessionId: string,
  status: E2eeSessionStatus,
): Promise<void> => {
  await e2eeSessionStore.setStatus(requireCurrentE2eeUserId(), sessionId, status);
  emitE2eeStatusChange(sessionId, status);
};

export const getPendingInitialHandshake = async (sessionId: string): Promise<InitialE2eeHandshake | null> =>
  e2eeSessionStore.getInitialHandshake(requireCurrentE2eeUserId(), sessionId);

export const clearPendingInitialHandshake = async (sessionId: string): Promise<void> =>
  e2eeSessionStore.clearInitialHandshake(requireCurrentE2eeUserId(), sessionId);

const savePendingInitialHandshake = async (
  sessionId: string,
  handshake: InitialE2eeHandshake,
): Promise<void> => {
  await e2eeSessionStore.saveInitialHandshake(requireCurrentE2eeUserId(), sessionId, handshake);
};

const persistStatus = async (sessionId: string, status: E2eeSessionStatus): Promise<void> => {
  await setLocalSessionStatus(sessionId, status);
};

const initiateInternal = async (
  sessionId: string,
  remoteUserId: string,
  remoteDeviceId?: string,
): Promise<boolean> => {
  await persistStatus(sessionId, 'negotiating');
  try {
    const local = await ensureLocalE2eeDeviceRegistered();
    const devicesResp = await mobileE2eeKeyService.getDevices(remoteUserId);
    const selectedDevice = remoteDeviceId
      ? devicesResp.data?.find((device) => device.deviceId === remoteDeviceId)
      : newestDevice(devicesResp.data || []);
    if (!selectedDevice?.deviceId) {
      throw new Error('Remote user has no active E2EE device');
    }

    const bundleResp = await mobileE2eeKeyService.getBundle(remoteUserId, selectedDevice.deviceId);
    const remoteBundle = bundleResp.data;
    if (!remoteBundle?.identityKey || !remoteBundle.signingIdentityKey || !remoteBundle.signedPreKey || !remoteBundle.signedPreKeySignature) {
      throw new Error('Remote user has no E2EE key bundle');
    }
    const normalizedBundle: PreKeyBundle = {
      ...remoteBundle,
      deviceId: remoteBundle.deviceId || selectedDevice.deviceId,
    };
    const x3dh = x3dhInitiate(local.identityKeyPair, normalizedBundle);
    const ratchetState = initSendingChain(x3dh.rootKey, local.identityKeyPair);
    await e2eeSessionStore.saveRatchetState(local.userId, sessionId, ratchetState);

    const handshake: InitialE2eeHandshake = {
      senderIdentityKey: local.bundle.identityKey,
      ephemeralPublicKey: x3dh.ephemeralPublicKey,
      deviceId: normalizedBundle.deviceId || selectedDevice.deviceId,
    };
    await savePendingInitialHandshake(sessionId, handshake);
    await mobileE2eeKeyService.requestEncryption(
      sessionId,
      local.bundle.identityKey,
      local.bundle.signedPreKey,
      JSON.stringify(handshake),
    );
    await persistStatus(sessionId, 'negotiating');
    return true;
  } catch (error) {
    await clearPendingInitialHandshake(sessionId).catch(() => undefined);
    await e2eeSessionStore.deleteRatchetState(requireCurrentE2eeUserId(), sessionId).catch(() => undefined);
    await persistStatus(sessionId, 'failed').catch(() => undefined);
    logger.warn('e2ee', 'negotiation initiation failed', sanitizeE2eeLogValue(error));
    return false;
  }
};

export const initiateNegotiation = (
  sessionId: string,
  remoteUserId: string,
  remoteDeviceId?: string,
): Promise<boolean> => {
  const existing = negotiationInFlight.get(sessionId);
  if (existing) {
    return existing;
  }
  const next = initiateInternal(sessionId, remoteUserId, remoteDeviceId).finally(() => {
    negotiationInFlight.delete(sessionId);
  });
  negotiationInFlight.set(sessionId, next);
  return next;
};

export const respondToNegotiation = async (
  sessionId: string,
  remoteIdentityKeyBase64: string,
  ephemeralPublicKeyBase64: string,
  expectedDeviceId?: string,
): Promise<boolean> => {
  await persistStatus(sessionId, 'negotiating');
  try {
    const local = await ensureLocalE2eeDeviceRegistered();
    if (expectedDeviceId && local.deviceId !== expectedDeviceId) {
      throw new Error('E2EE negotiation request targets a different device');
    }
    validateP256PublicKeyBase64(remoteIdentityKeyBase64, 'sender identity key');
    validateP256PublicKeyBase64(ephemeralPublicKeyBase64, 'sender ephemeral key');

    const rootKey = x3dhRespond(
      local.identityKeyPair,
      local.signedPreKeyPair,
      null,
      remoteIdentityKeyBase64,
      ephemeralPublicKeyBase64,
    );
    const ratchetState = initReceivingChain(rootKey, local.identityKeyPair);
    await e2eeSessionStore.saveRatchetState(local.userId, sessionId, ratchetState);
    await mobileE2eeKeyService.acceptEncryption(sessionId, local.bundle.identityKey, local.bundle.signedPreKey);
    await e2eeSessionStore.clearPendingRequest(local.userId, sessionId);
    await persistStatus(sessionId, 'encrypted');
    return true;
  } catch (error) {
    await persistStatus(sessionId, 'failed').catch(() => undefined);
    logger.warn('e2ee', 'negotiation response failed', sanitizeE2eeLogValue(error));
    return false;
  }
};

export const acceptPendingNegotiation = async (sessionId: string): Promise<boolean> => {
  const userId = requireCurrentE2eeUserId();
  const pending = await e2eeSessionStore.getPendingRequest<StoredPendingRequest>(userId, sessionId);
  try {
    const handshake = parseInitialHandshake(pending?.requestPayloadJson);
    return await respondToNegotiation(
      sessionId,
      handshake.senderIdentityKey,
      handshake.ephemeralPublicKey,
      handshake.deviceId,
    );
  } catch (error) {
    await mobileE2eeKeyService.rejectEncryption(sessionId).catch(() => undefined);
    await e2eeSessionStore.clearPendingRequest(userId, sessionId).catch(() => undefined);
    await persistStatus(sessionId, 'failed').catch(() => undefined);
    logger.warn('e2ee', 'pending negotiation accept failed', sanitizeE2eeLogValue(error));
    return false;
  }
};

export const rejectPendingNegotiation = async (sessionId: string): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  await mobileE2eeKeyService.rejectEncryption(sessionId);
  await e2eeSessionStore.clearPendingRequest(userId, sessionId);
  await persistStatus(sessionId, 'plaintext');
};

export const recordPendingNegotiationRequest = async (
  request: StoredPendingRequest,
): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  if (!request.sessionId) {
    return;
  }
  await e2eeSessionStore.savePendingRequest(userId, request.sessionId, request);
  await persistStatus(request.sessionId, 'negotiating');
  emitPendingE2eeRequest(request.sessionId);
};

export const handleNegotiationAccepted = async (sessionId: string): Promise<void> => {
  const status = await loadLocalSessionStatus(sessionId);
  if (status === 'negotiating') {
    await clearPendingInitialHandshake(sessionId);
    await persistStatus(sessionId, 'encrypted');
  }
};

export const handleNegotiationRejected = async (sessionId: string): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  await clearPendingInitialHandshake(sessionId).catch(() => undefined);
  await e2eeSessionStore.clearPendingRequest(userId, sessionId).catch(() => undefined);
  await e2eeSessionStore.deleteRatchetState(userId, sessionId).catch(() => undefined);
  await persistStatus(sessionId, 'plaintext');
};

export const handleNegotiationDisabled = async (sessionId: string): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  await clearPendingInitialHandshake(sessionId).catch(() => undefined);
  await e2eeSessionStore.clearPendingRequest(userId, sessionId).catch(() => undefined);
  await e2eeSessionStore.deleteRatchetState(userId, sessionId).catch(() => undefined);
  await persistStatus(sessionId, 'plaintext');
};

export const resetNegotiation = async (
  sessionId: string,
  status: E2eeSessionStatus = 'plaintext',
): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  await clearPendingInitialHandshake(sessionId).catch(() => undefined);
  await e2eeSessionStore.clearPendingRequest(userId, sessionId).catch(() => undefined);
  await e2eeSessionStore.deleteRatchetState(userId, sessionId).catch(() => undefined);
  await persistStatus(sessionId, status);
};

export const normalizeNegotiationEvent = (raw: Record<string, unknown>): StoredPendingRequest | null => {
  const sessionId = typeof raw.sessionId === 'string'
    ? raw.sessionId
    : typeof raw.session_id === 'string'
      ? raw.session_id
      : '';
  if (!sessionId) {
    return null;
  }
  return {
    sessionId,
    requesterId: typeof raw.requesterId === 'string' ? raw.requesterId : typeof raw.requester_id === 'string' ? raw.requester_id : undefined,
    requesterName: typeof raw.requesterName === 'string' ? raw.requesterName : typeof raw.requester_name === 'string' ? raw.requester_name : undefined,
    targetUserId: typeof raw.targetUserId === 'string' ? raw.targetUserId : typeof raw.target_user_id === 'string' ? raw.target_user_id : undefined,
    requestPayloadJson: typeof raw.requestPayloadJson === 'string'
      ? raw.requestPayloadJson
      : typeof raw.request_payload_json === 'string'
        ? raw.request_payload_json
        : undefined,
    action: typeof raw.action === 'string' ? raw.action : undefined,
  };
};
