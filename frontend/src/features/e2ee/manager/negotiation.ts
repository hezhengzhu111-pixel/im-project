/**
 * E2EE 会话协商模块
 *
 * 管理 E2EE 会话的密钥协商流程:
 * - 本地会话状态追踪 (plaintext/pending/encrypted) via localStorage
 * - 发起协商 (Alice): 获取远端 Bundle → X3DH → 初始化发送链 → 保存状态
 * - 响应协商 (Bob): X3DH 响应 → 初始化接收链 → 保存状态
 * - 应用重启后从 IndexedDB 恢复会话
 */

import { keyService } from '../api/key-service';
import { x3dhInitiate, x3dhRespond } from '../engine/x3dh';
import { importRootKey, initSendingChain, initReceivingChain } from '../engine/double-ratchet';
import { saveRatchetState, getRatchetState, deleteRatchetState } from '../store/session-store';
import { getIdentityKeyPair, getLocalPublicBundle, getSignedPreKey } from '../store/key-store';
import type { PreKeyBundle, E2eeSessionStatus } from '../types';
import { emitE2eeStatusChange } from '../status-events';
import { ensureLocalE2eeDeviceRegistered } from './local-device';

const SESSION_STATUS_PREFIX = 'e2ee:status:';
const INITIAL_HANDSHAKE_PREFIX = 'e2ee:initial-handshake:';

export interface InitialE2eeHandshake {
  senderIdentityKey: string;
  ephemeralPublicKey: string;
  deviceId: string;
}

export function getLocalSessionStatus(sessionId: string): E2eeSessionStatus {
  const raw = localStorage.getItem(SESSION_STATUS_PREFIX + sessionId);
  if (raw === 'encrypted' || raw === 'negotiating' || raw === 'failed') return raw;
  // backward compat: treat legacy 'pending' as 'negotiating'
  if (raw === 'pending') return 'negotiating';
  return 'plaintext';
}

export function setLocalSessionStatus(sessionId: string, status: E2eeSessionStatus): void {
  localStorage.setItem(SESSION_STATUS_PREFIX + sessionId, status);
  emitE2eeStatusChange(sessionId, status);
}

export function getPendingInitialHandshake(sessionId: string): InitialE2eeHandshake | null {
  const raw = localStorage.getItem(INITIAL_HANDSHAKE_PREFIX + sessionId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<InitialE2eeHandshake>;
    if (
      typeof parsed.senderIdentityKey === 'string' &&
      typeof parsed.ephemeralPublicKey === 'string' &&
      typeof parsed.deviceId === 'string'
    ) {
      return {
        senderIdentityKey: parsed.senderIdentityKey,
        ephemeralPublicKey: parsed.ephemeralPublicKey,
        deviceId: parsed.deviceId,
      };
    }
  } catch {
    // ignore corrupt metadata
  }
  localStorage.removeItem(INITIAL_HANDSHAKE_PREFIX + sessionId);
  return null;
}

export function clearPendingInitialHandshake(sessionId: string): void {
  localStorage.removeItem(INITIAL_HANDSHAKE_PREFIX + sessionId);
}

function savePendingInitialHandshake(sessionId: string, handshake: InitialE2eeHandshake): void {
  localStorage.setItem(INITIAL_HANDSHAKE_PREFIX + sessionId, JSON.stringify(handshake));
}

function newestDevice<T extends { lastActiveAt?: string }>(devices: T[]): T | undefined {
  return [...devices].sort((a, b) => {
    const left = new Date(a.lastActiveAt || 0).getTime();
    const right = new Date(b.lastActiveAt || 0).getTime();
    return right - left;
  })[0];
}

/**
 * 发起 E2EE 协商（主动方 Alice）
 * 流程：检查本地密钥 → 获取对方 Bundle → X3DH → 初始化 Double Ratchet → 保存状态 → 等待对方确认
 */
export async function initiateNegotiation(
  sessionId: string,
  remoteUserId: string,
  remoteDeviceId?: string,
): Promise<boolean> {
  setLocalSessionStatus(sessionId, 'negotiating');
  try {
    await ensureLocalE2eeDeviceRegistered();

    const identityKeyPair = await getIdentityKeyPair();
    if (!identityKeyPair) {
      throw new Error('Local identity key not found');
    }
    const localBundle = await getLocalPublicBundle();
    if (!localBundle) {
      throw new Error('Local E2EE public bundle not found');
    }

    const devicesResp = await keyService.getDevices(remoteUserId);
    const targetDevice = newestDevice(devicesResp.data || []);
    if (!targetDevice?.deviceId) {
      throw new Error('Remote user has no active E2EE device');
    }

    const bundleResp = await keyService.getBundle(
      remoteUserId,
      remoteDeviceId || targetDevice.deviceId,
    );
    if (!bundleResp.data) {
      throw new Error('Remote user has no E2EE key bundle');
    }

    const remoteBundle: PreKeyBundle = {
      userId: remoteUserId,
      deviceId: bundleResp.data.deviceId,
      identityKey: bundleResp.data.identityKey,
      signingIdentityKey: bundleResp.data.signingIdentityKey,
      signedPreKey: bundleResp.data.signedPreKey,
      signedPreKeySignature: bundleResp.data.signedPreKeySignature,
    };

    const bundleForX3dh = {
      identityKey: remoteBundle.identityKey,
      signingIdentityKey: remoteBundle.signingIdentityKey,
      signedPreKey: remoteBundle.signedPreKey,
      signedPreKeySignature: remoteBundle.signedPreKeySignature,
    };

    const { rootKey, ephemeralPublicKey } = await x3dhInitiate(identityKeyPair, bundleForX3dh);

    const rootCryptoKey = await importRootKey(rootKey);
    const ratchetState = await initSendingChain(rootCryptoKey, identityKeyPair);

    await saveRatchetState(sessionId, ratchetState);

    // Verify the state was actually persisted
    const verifyState = await getRatchetState(sessionId);
    if (!verifyState) {
      console.error(`[E2EE] CRITICAL: Ratchet state was NOT persisted after initiation for session=${sessionId}`);
      clearPendingInitialHandshake(sessionId);
      setLocalSessionStatus(sessionId, 'failed');
      return false;
    }

    const handshake: InitialE2eeHandshake = {
      senderIdentityKey: localBundle.identityKey,
      ephemeralPublicKey,
      deviceId: remoteBundle.deviceId,
    };
    savePendingInitialHandshake(sessionId, handshake);
    await keyService.requestEncryption(
      sessionId,
      localBundle.identityKey,
      localBundle.signedPreKey,
      JSON.stringify(handshake),
    );
    setLocalSessionStatus(sessionId, 'negotiating');

    return true;
  } catch (error) {
    console.error('[E2EE] Negotiation initiation failed:', error);
    clearPendingInitialHandshake(sessionId);
    setLocalSessionStatus(sessionId, 'failed');
    return false;
  }
}

/**
 * 响应 E2EE 协商（被动方 Bob）
 * 流程：收到首条加密消息中的 ephemeralKey → X3DH 响应 → 初始化接收链
 */
export async function respondToNegotiation(
  sessionId: string,
  remoteIdentityKeyBase64: string,
  ephemeralPublicKeyBase64: string,
): Promise<boolean> {
  setLocalSessionStatus(sessionId, 'negotiating');
  try {
    await ensureLocalE2eeDeviceRegistered();

    const identityKeyPair = await getIdentityKeyPair();
    if (!identityKeyPair) throw new Error('Local identity key not found');

    // 获取本地 signedPreKey（ID=1）
    const signedPreKeyPair = await getSignedPreKey(1);
    if (!signedPreKeyPair) throw new Error('Local signed pre-key not found');

    const rootKey = await x3dhRespond(
      identityKeyPair,
      signedPreKeyPair,
      null, // oneTimePreKey — TODO: look up used OPK
      remoteIdentityKeyBase64,
      ephemeralPublicKeyBase64,
    );

    const rootCryptoKey = await importRootKey(rootKey);
    const ratchetState = await initReceivingChain(rootCryptoKey, identityKeyPair);

    await saveRatchetState(sessionId, ratchetState);

    // Verify the state was actually persisted
    const verifyState = await getRatchetState(sessionId);
    if (!verifyState) {
      console.error(`[E2EE] CRITICAL: Ratchet state was NOT persisted after negotiation for session=${sessionId}`);
      setLocalSessionStatus(sessionId, 'failed');
      return false;
    }

    setLocalSessionStatus(sessionId, 'encrypted');

    return true;
  } catch (error) {
    console.error('[E2EE] Negotiation response failed:', error);
    setLocalSessionStatus(sessionId, 'failed');
    return false;
  }
}

export async function restoreE2eeSession(sessionId: string): Promise<boolean> {
  if (getLocalSessionStatus(sessionId) !== 'encrypted') {
    return false;
  }
  const state = await getRatchetState(sessionId);
  if (!state) return false;
  setLocalSessionStatus(sessionId, 'encrypted');
  return true;
}

export async function resetNegotiation(sessionId: string, status: E2eeSessionStatus = 'plaintext'): Promise<void> {
  clearPendingInitialHandshake(sessionId);
  await deleteRatchetState(sessionId);
  setLocalSessionStatus(sessionId, status);
}
