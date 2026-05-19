import {
  sanitizeE2eeLogValue,
  type E2eeDevice,
  type E2eeSessionStatus,
  type PendingEncryptionRequest,
} from '@im/shared-e2ee-core';
import { mobileE2eeKeyService } from '@/e2ee/api/keyService';
import { getMobileE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import {
  clearPendingEncryptedMessages,
  retryDecryptPendingMessages,
  retryDecryptVisibleEncryptedMessages,
} from '@/e2ee/store/pendingDecryptStore';
import { logger } from '@/utils/logger';
import { emitE2eeStatusChange, emitPendingE2eeRequest } from '@/e2ee/statusEvents';
import { requireCurrentE2eeUserId } from './context';
import { ensureLocalE2eeDeviceRegistered } from './localDevice';

export interface StoredPendingRequest extends PendingEncryptionRequest {
  action?: string;
}

const negotiationInFlight = new Map<string, Promise<boolean>>();

const newestDevice = (devices: E2eeDevice[]): E2eeDevice | undefined =>
  [...devices].sort((left, right) => {
    const leftTime = new Date(left.lastActiveAt || left.last_active_at || 0).getTime();
    const rightTime = new Date(right.lastActiveAt || right.last_active_at || 0).getTime();
    return rightTime - leftTime;
  })[0];

export const getLocalSessionStatus = (sessionId: string): E2eeSessionStatus =>
  e2eeSessionStore.getCachedStatus(sessionId);

export const loadLocalSessionStatus = async (sessionId: string): Promise<E2eeSessionStatus> =>
  e2eeSessionStore.loadStatus(requireCurrentE2eeUserId(), sessionId);

export const syncPendingNegotiations = async (currentSessionId?: string): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  await ensureLocalE2eeDeviceRegistered();
  const response = await mobileE2eeKeyService.getPendingNegotiations();
  const requests = response.data || [];
  for (const request of requests) {
    if (request.targetUserId && String(request.targetUserId) !== userId) {
      continue;
    }
    await recordPendingNegotiationRequest({ ...request, action: 'request' });
    if (currentSessionId && request.sessionId === currentSessionId) {
      emitPendingE2eeRequest(request.sessionId);
    }
  }
};

export const setLocalSessionStatus = async (
  sessionId: string,
  status: E2eeSessionStatus,
): Promise<void> => {
  await e2eeSessionStore.setStatus(requireCurrentE2eeUserId(), sessionId, status);
  emitE2eeStatusChange(sessionId, status);
};

export const getStoredPendingNegotiationRequest = async (
  sessionId: string,
): Promise<StoredPendingRequest | null> =>
  e2eeSessionStore.getPendingRequest<StoredPendingRequest>(requireCurrentE2eeUserId(), sessionId);

const persistStatus = async (sessionId: string, status: E2eeSessionStatus): Promise<void> => {
  await setLocalSessionStatus(sessionId, status);
};

const removeRuntimeSession = async (sessionId: string): Promise<void> => {
  try {
    await getMobileE2eeRuntime().removeSession(sessionId);
  } catch {
    // Clearing local negotiation metadata must not depend on native runtime availability.
  }
};

const uploadRequestMetadata = async (sessionId: string): Promise<void> => {
  await ensureLocalE2eeDeviceRegistered();
  await mobileE2eeKeyService.requestEncryption(sessionId);
};

const initiateInternal = async (
  sessionId: string,
  _remoteUserId: string,
  _remoteDeviceId?: string,
): Promise<boolean> => {
  await persistStatus(sessionId, 'negotiating');
  try {
    const userId = requireCurrentE2eeUserId();
    await e2eeSessionStore.deleteSessionState(userId, sessionId).catch(() => undefined);
    await removeRuntimeSession(sessionId);
    await uploadRequestMetadata(sessionId);
    await persistStatus(sessionId, 'negotiating');
    return true;
  } catch (error) {
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

export const acceptPendingNegotiation = async (sessionId: string): Promise<boolean> => {
  const userId = requireCurrentE2eeUserId();
  const pending = await e2eeSessionStore.getPendingRequest<StoredPendingRequest>(userId, sessionId);
  try {
    if (!pending || pending.sessionId !== sessionId) {
      throw new Error('E2EE negotiation request missing');
    }
    if (pending.targetUserId && String(pending.targetUserId) !== userId) {
      throw new Error('E2EE negotiation request targets a different user');
    }
    if (pending.requesterId) {
      const normalized = sessionId.startsWith('p_') ? sessionId.slice(2) : sessionId;
      const partners = normalized.split('_').filter(Boolean);
      if (!partners.includes(String(pending.requesterId)) || !partners.includes(userId)) {
        throw new Error('E2EE negotiation session does not match requester');
      }
    }

    // Rust v2: handshake is carried in the first message's e2eeEnvelope.handshake field,
    // NOT in the negotiation request. Always use status-only acceptance.
    const accepted = await acceptStatusOnlyNegotiation(sessionId);
    if (accepted) {
      await retryDecryptPendingMessages(sessionId).catch(() => 0);
      await retryDecryptVisibleEncryptedMessages(sessionId).catch(() => 0);
    }
    return accepted;
  } catch (error) {
    await mobileE2eeKeyService.rejectEncryption(sessionId).catch(() => undefined);
    await e2eeSessionStore.clearPendingRequest(userId, sessionId).catch(() => undefined);
    await persistStatus(sessionId, 'failed').catch(() => undefined);
    logger.warn('e2ee', 'pending negotiation accept failed', sanitizeE2eeLogValue(error));
    return false;
  }
};

const acceptStatusOnlyNegotiation = async (sessionId: string): Promise<boolean> => {
  const local = await ensureLocalE2eeDeviceRegistered();
  await mobileE2eeKeyService.acceptEncryption(sessionId, local.publicBundle.identityKey, local.publicBundle.signedPreKey.key);
  await e2eeSessionStore.clearPendingRequest(local.userId, sessionId);
  await persistStatus(sessionId, 'encrypted');
  return true;
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
  // Rust v2: negotiation request carries no handshake data; the initial
  // handshake arrives in the first message's e2eeEnvelope.handshake.
  await e2eeSessionStore.savePendingRequest(userId, request.sessionId, request);
  await persistStatus(request.sessionId, 'negotiating');
  emitPendingE2eeRequest(request.sessionId);
};

export const handleNegotiationAccepted = async (sessionId: string): Promise<void> => {
  const status = await loadLocalSessionStatus(sessionId);
  if (status === 'negotiating') {
    await persistStatus(sessionId, 'encrypted');
    await retryDecryptPendingMessages(sessionId).catch(() => 0);
    await retryDecryptVisibleEncryptedMessages(sessionId).catch(() => 0);
  }
};

export const handleNegotiationRejected = async (sessionId: string): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  await e2eeSessionStore.clearPendingRequest(userId, sessionId).catch(() => undefined);
  await e2eeSessionStore.deleteSessionState(userId, sessionId).catch(() => undefined);
  await removeRuntimeSession(sessionId);
  clearPendingEncryptedMessages(sessionId);
  await persistStatus(sessionId, 'plaintext');
};

export const handleNegotiationDisabled = async (sessionId: string): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  await e2eeSessionStore.clearPendingRequest(userId, sessionId).catch(() => undefined);
  await e2eeSessionStore.deleteSessionState(userId, sessionId).catch(() => undefined);
  await removeRuntimeSession(sessionId);
  clearPendingEncryptedMessages(sessionId);
  await persistStatus(sessionId, 'plaintext');
};

export const resetNegotiation = async (
  sessionId: string,
  status: E2eeSessionStatus = 'plaintext',
): Promise<void> => {
  const userId = requireCurrentE2eeUserId();
  await e2eeSessionStore.clearPendingRequest(userId, sessionId).catch(() => undefined);
  await e2eeSessionStore.deleteSessionState(userId, sessionId).catch(() => undefined);
  await removeRuntimeSession(sessionId);
  clearPendingEncryptedMessages(sessionId);
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

export const getNegotiationTargetDevice = async (remoteUserId: string, remoteDeviceId?: string): Promise<string> => {
  const devicesResp = await mobileE2eeKeyService.getDevices(remoteUserId);
  const device = remoteDeviceId
    ? (devicesResp.data || []).find((item) => item.deviceId === remoteDeviceId)
    : newestDevice(devicesResp.data || []);
  return device?.deviceId || '';
};
