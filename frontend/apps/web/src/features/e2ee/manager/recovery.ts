/**
 * 恢复码备份与恢复
 *
 * 安全流程:
 * - 备份: 获取服务端 salt → PBKDF2(password, salt, 600K) → AES-GCM 加密公钥 → 上传
 * - 恢复: 获取服务端 salt → PBKDF2(password, salt, 600K) → 下载备份 → 解密 → 重新生成密钥对 → 上传 Bundle
 *
 * PBKDF2 参数: 600,000 次迭代, SHA-512, 派生 AES-256-GCM 密钥。
 * Salt 由服务端随机生成并持久化（每个用户唯一）。
 */

import {
  pbkdf2DeriveKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
  exportPublicKey,
} from '../engine/crypto-primitives';
import { generateKeyBundle } from '../engine/x3dh';
import { bufferToBase64, base64ToBuffer, randomBytes } from '../engine/codec';
import {
  saveIdentityKeyPair,
  saveLocalPublicBundle,
  saveSignedPreKey,
} from '../store/key-store';
import { keyService } from '../api/key-service';
import { resolveDeviceId } from './device-identity';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** Signed Pre Key ID（简单递增，实际应用可持久化计数器） */
const SIGNED_PRE_KEY_ID = 1;

// ---------------------------------------------------------------------------
// 公钥导出辅助
// ---------------------------------------------------------------------------

/**
 * 导出 CryptoKey 公钥为 Base64 字符串
 */
async function exportPublicKeyBase64(key: CryptoKey): Promise<string> {
  const raw = await exportPublicKey(key);
  return bufferToBase64(raw);
}

// ---------------------------------------------------------------------------
// createRecoveryBackup()
// ---------------------------------------------------------------------------

/**
 * 创建恢复码备份。
 *
 * 流程:
 * 1. 从服务端获取 salt（Base64）
 * 2. PBKDF2(password, salt) → AES-GCM 密钥
 * 3. 读取 Identity Key 公钥 → 导出为 Base64
 * 4. AES-GCM 加密公钥
 * 5. 上传 (encryptedPubKey, iv) 到服务端
 *
 * @param password - 用户输入的恢复码密码
 * @param identityKeyPair - 当前 Identity Key Pair（必须提供，因为 Identity Key 不可导出私钥）
 * @throws 服务端请求失败或加密失败时抛出异常
 */
export async function createRecoveryBackup(
  password: string,
  identityKeyPair: CryptoKeyPair,
): Promise<void> {
  // 1. 获取 salt
  const saltResponse = await keyService.getSalt();
  const saltBase64 = saltResponse.data;
  const salt = base64ToBuffer(saltBase64);

  // 2. PBKDF2 派生加密密钥
  const derivedKey = await pbkdf2DeriveKey(password, salt);

  // 3. 导出公钥
  const pubKeyBase64 = await exportPublicKeyBase64(identityKeyPair.publicKey);
  const encoder = new TextEncoder();
  const pubKeyPlaintext = encoder.encode(pubKeyBase64).buffer as ArrayBuffer;

  // 4. AES-GCM 加密
  const iv = randomBytes(12);
  const { ciphertext } = await aesGcmEncrypt(derivedKey, pubKeyPlaintext, iv);

  // 5. 上传备份
  const encryptedPubKeyBase64 = bufferToBase64(ciphertext);
  const ivBase64 = bufferToBase64(iv.buffer as ArrayBuffer);
  await keyService.uploadBackup(encryptedPubKeyBase64, ivBase64);
}

// ---------------------------------------------------------------------------
// recoverWithPassword()
// ---------------------------------------------------------------------------

/**
 * 使用恢复码密码恢复密钥。
 *
 * 流程:
 * 1. 从服务端获取 salt
 * 2. PBKDF2(password, salt) → AES-GCM 密钥
 * 3. 下载加密备份
 * 4. AES-GCM 解密 → 得到原始公钥 Base64（验证密码正确性）
 * 5. 重新生成 Identity Key Pair + Signed Pre Key + One-Time Pre Keys
 * 6. 保存到本地存储
 * 7. 上传新 Bundle 到服务端
 *
 * @param password - 用户输入的恢复码密码
 * @throws 密码错误（解密失败）或服务端请求失败时抛出异常
 */
export async function recoverWithPassword(password: string): Promise<void> {
  // 1. 获取 salt
  const saltResponse = await keyService.getSalt();
  const saltBase64 = saltResponse.data;
  const salt = base64ToBuffer(saltBase64);

  // 2. PBKDF2 派生解密密钥
  const derivedKey = await pbkdf2DeriveKey(password, salt);

  // 3. 下载备份
  const backupResponse = await keyService.getBackup();
  const { encryptedPubKey, iv: ivBase64 } = backupResponse.data;

  // 4. AES-GCM 解密（验证密码正确性）
  const ciphertext = base64ToBuffer(encryptedPubKey);
  const iv = new Uint8Array(base64ToBuffer(ivBase64));

  let _decryptedPubKeyBase64: string;
  try {
    const decryptedBuffer = await aesGcmDecrypt(derivedKey, ciphertext, iv);
    const decoder = new TextDecoder();
    _decryptedPubKeyBase64 = decoder.decode(decryptedBuffer);
  } catch {
    throw new Error('恢复码密码错误或备份数据已损坏');
  }

  // 5. 重新生成密钥对
  const bundle = await generateKeyBundle();

  // 6. 保存到本地存储
  await saveIdentityKeyPair(bundle.identityKeyPair);
  await saveSignedPreKey(SIGNED_PRE_KEY_ID, bundle.signedPreKeyPair);

  // 7. 准备上传数据
  const deviceId = await resolveDeviceId();

  // 8. 上传新 Bundle
  await keyService.uploadBundle({
    deviceId,
    identityKey: bundle.bundle.identityKey,
    signingIdentityKey: bundle.bundle.signingIdentityKey,
    signedPreKey: bundle.bundle.signedPreKey,
    signedPreKeySignature: bundle.bundle.signedPreKeySignature,
    oneTimePreKeys: [],
  });
  await saveLocalPublicBundle({
    version: 2,
    identityKey: bundle.bundle.identityKey,
    signingIdentityKey: bundle.bundle.signingIdentityKey,
    signedPreKey: bundle.bundle.signedPreKey,
    signedPreKeySignature: bundle.bundle.signedPreKeySignature,
  });
}
