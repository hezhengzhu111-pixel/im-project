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
import { saveRatchetState, getRatchetState } from '../store/session-store';
import { getIdentityKeyPair, getSignedPreKey } from '../store/key-store';
import type { PreKeyBundle, E2eeSessionStatus } from '../types';
import { emitE2eeStatusChange } from '../status-events';

const SESSION_STATUS_PREFIX = 'e2ee:status:';

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

/**
 * 发起 E2EE 协商（主动方 Alice）
 * 流程：检查本地密钥 → 获取对方 Bundle → X3DH → 初始化 Double Ratchet → 保存状态
 */
export async function initiateNegotiation(
  sessionId: string,
  remoteUserId: string,
  remoteDeviceId?: string,
): Promise<boolean> {
  setLocalSessionStatus(sessionId, 'negotiating');
  try {
    const identityKeyPair = await getIdentityKeyPair();
    if (!identityKeyPair) {
      throw new Error('Local identity key not found');
    }

    const bundleResp = await keyService.getBundle(remoteUserId, remoteDeviceId);
    if (!bundleResp.data) {
      throw new Error('Remote user has no E2EE key bundle');
    }

    const bundleData = bundleResp.data as unknown as Record<string, unknown>;

    const remoteBundle: PreKeyBundle = {
      userId: remoteUserId,
      deviceId: bundleResp.data.deviceId,
      identityKey: bundleResp.data.identityKey,
      signedPreKey: bundleResp.data.signedPreKey,
      signedPreKeySignature: bundleResp.data.signedPreKeySignature,
      oneTimePreKey: bundleData.oneTimePreKey as string | undefined,
    };

    // x3dhInitiate expects a signingIdentityKey for SPK signature verification.
    // The server bundle may include it; fall back to identityKey if missing.
    const bundleForX3dh = {
      identityKey: remoteBundle.identityKey,
      signingIdentityKey:
        (bundleData.signingIdentityKey as string | undefined) ?? remoteBundle.identityKey,
      signedPreKey: remoteBundle.signedPreKey,
      signedPreKeySignature: remoteBundle.signedPreKeySignature,
      oneTimePreKey: remoteBundle.oneTimePreKey,
    };

    const { rootKey, ephemeralPublicKey } = await x3dhInitiate(identityKeyPair, bundleForX3dh);

    const rootCryptoKey = await importRootKey(rootKey);
    const ratchetState = await initSendingChain(rootCryptoKey, identityKeyPair);

    await saveRatchetState(sessionId, ratchetState);
    setLocalSessionStatus(sessionId, 'encrypted');

    return true;
  } catch (error) {
    console.error('[E2EE] Negotiation initiation failed:', error);
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
    setLocalSessionStatus(sessionId, 'encrypted');

    return true;
  } catch (error) {
    console.error('[E2EE] Negotiation response failed:', error);
    setLocalSessionStatus(sessionId, 'failed');
    return false;
  }
}

export async function restoreE2eeSession(sessionId: string): Promise<boolean> {
  const state = await getRatchetState(sessionId);
  if (!state) return false;
  setLocalSessionStatus(sessionId, 'encrypted');
  return true;
}
