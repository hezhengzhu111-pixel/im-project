/**
 * Sender Key 群聊加密引擎
 *
 * 实现 Signal Protocol 的 Sender Key 多播加密算法，用于群聊场景：
 * - 每个群成员生成独立的 Sender Key（chainKey + signingKeyPair）
 * - 通过 HKDF 链式派生消息密钥，保证前向保密
 * - ECDSA 签名防止消息伪造
 * - AES-256-GCM 加密保证机密性
 *
 * 流程:
 * 1. 群管理员生成 Sender Key → 用每个成员的公钥加密后分发
 * 2. 发送方使用 Sender Key 的 chainKey 派生消息密钥并加密
 * 3. 接收方使用对应发送方的 Sender Key 验签并解密
 *
 * 实现说明:
 * - chainKey 存储为原始字节（ArrayBuffer），而非 CryptoKey
 *   因为 HKDF key 在某些运行时（如 jsdom）不可导出
 * - 需要 HKDF 操作时，临时导入为不可导出的 CryptoKey
 */

import {
  generateSigningKeyPair,
  exportPublicKey,
  importSigningPublicKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
  ecdsaSign,
  ecdsaVerify,
} from './crypto-primitives';
import {
  bufferToBase64,
  base64ToBuffer,
  randomBytes,
  concatBuffers,
} from './codec';
import type { SenderKeyHeader } from '../types';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** Sender Key 状态 */
export interface SenderKey {
  /** 链密钥原始字节（32 字节），用于 HKDF 派生 */
  chainKey: ArrayBuffer;
  /** 签名密钥对（ECDSA P-256） */
  signingKeyPair: CryptoKeyPair;
  /** 消息计数器 */
  counter: number;
}

/** Sender Key 序列化格式（用于密钥分发和持久化） */
export interface SerializedSenderKey {
  /** 链密钥原始字节（Base64） */
  chainKey: string;
  /** 签名私钥（JWK 格式） */
  signingPrivateJwk: JsonWebKey;
  /** 签名公钥（JWK 格式） */
  signingPublicJwk: JsonWebKey;
  /** 消息计数器 */
  counter: number;
}

// ---------------------------------------------------------------------------
// HKDF Info 常量
// ---------------------------------------------------------------------------

const HKDF_SALT: ArrayBuffer = new Uint8Array(0).buffer as ArrayBuffer;
const INFO_MESSAGE_KEYS: ArrayBuffer = new TextEncoder().encode('SenderMessageKeys').buffer as ArrayBuffer;
const INFO_CHAIN_KEYS: ArrayBuffer = new TextEncoder().encode('SenderChainKeys').buffer as ArrayBuffer;

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 安全地将 ArrayBufferLike 转为 ArrayBuffer */
function toBuffer(data: ArrayBufferLike): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const bytes = new Uint8Array(data);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/**
 * 将 counter 编码为 4 字节大端序 ArrayBuffer
 */
function counterToBuffer(counter: number): ArrayBuffer {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, counter, false); // big-endian
  return buf;
}

/**
 * 将原始字节导入为 HKDF CryptoKey（不可导出）
 */
async function importHkdfKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits'],
  );
}

// ---------------------------------------------------------------------------
// Sender Key 生成
// ---------------------------------------------------------------------------

/**
 * 生成新的 Sender Key
 *
 * @returns 新的 SenderKey 实例
 */
export async function generateSenderKey(): Promise<SenderKey> {
  // 生成 256 位随机链密钥原始字节
  const chainKey = randomBytes(32).buffer as ArrayBuffer;

  // 生成 ECDSA 签名密钥对
  const signingKeyPair = await generateSigningKeyPair();

  return {
    chainKey,
    signingKeyPair,
    counter: 0,
  };
}

// ---------------------------------------------------------------------------
// 链密钥分割
// ---------------------------------------------------------------------------

/**
 * 从链密钥派生消息密钥和下一个链密钥
 *
 * 使用 HKDF 从当前链密钥派生:
 * - messageKey: 用于 AES-GCM 加密单条消息
 * - chainKey: 下一个链密钥（链式推进）
 *
 * @param chainKeyRaw - 当前链密钥原始字节（32 字节）
 * @returns messageKey + 新的 chainKey 原始字节
 */
export async function splitSenderChainKey(
  chainKeyRaw: ArrayBuffer,
): Promise<{ messageKey: CryptoKey; chainKey: ArrayBuffer }> {
  // 导入为 HKDF key（临时，不可导出）
  const hkdfKey = await importHkdfKey(chainKeyRaw);

  // 派生消息密钥（256 位 AES-GCM）
  const messageKeyBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: INFO_MESSAGE_KEYS },
    hkdfKey,
    256,
  );

  // 派生下一个链密钥（256 位原始字节）
  const nextChainKeyBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: INFO_CHAIN_KEYS },
    hkdfKey,
    256,
  );

  // 导入消息密钥为 AES-GCM
  const messageKey = await crypto.subtle.importKey(
    'raw',
    messageKeyBits,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  return { messageKey, chainKey: toBuffer(nextChainKeyBits) };
}

// ---------------------------------------------------------------------------
// 加密
// ---------------------------------------------------------------------------

/**
 * 使用 Sender Key 加密一条消息
 *
 * 流程:
 * 1. 从链密钥派生消息密钥 + 新链密钥
 * 2. AES-256-GCM 加密明文
 * 3. ECDSA 签名（ciphertext || counter）
 * 4. 构建消息头
 *
 * @param senderKey - Sender Key 状态（会被就地修改）
 * @param plaintext - 明文消息
 * @returns 消息头 + Base64 编码的密文
 */
export async function senderKeyEncrypt(
  senderKey: SenderKey,
  plaintext: string,
): Promise<{ header: SenderKeyHeader; ciphertext: string }> {
  // 从链密钥派生消息密钥
  const { messageKey, chainKey: newChainKey } = await splitSenderChainKey(senderKey.chainKey);
  senderKey.chainKey = newChainKey;

  // 导出签名公钥
  const signingPubRaw = await exportPublicKey(senderKey.signingKeyPair.publicKey);
  const signingPubkey = bufferToBase64(toBuffer(signingPubRaw));

  // 生成 IV 并加密
  const iv = randomBytes(12);
  const ptBuffer: ArrayBuffer = new TextEncoder().encode(plaintext).buffer as ArrayBuffer;
  const { ciphertext } = await aesGcmEncrypt(messageKey, ptBuffer, iv);

  // 构建签名数据: ciphertext || counter (4 bytes big-endian)
  const counterBuf = counterToBuffer(senderKey.counter);
  const signatureData = concatBuffers(ciphertext, counterBuf);
  const signature = await ecdsaSign(senderKey.signingKeyPair.privateKey, signatureData);

  // 构建消息头
  const header: SenderKeyHeader = {
    signingPubkey,
    counter: senderKey.counter,
    signature: bufferToBase64(signature),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
  };

  senderKey.counter++;

  return { header, ciphertext: bufferToBase64(ciphertext) };
}

// ---------------------------------------------------------------------------
// 解密
// ---------------------------------------------------------------------------

/**
 * 使用 Sender Key 解密一条消息
 *
 * 流程:
 * 1. 导入签名公钥并验证 ECDSA 签名
 * 2. 推进链密钥到目标计数器位置
 * 3. AES-256-GCM 解密密文
 *
 * @param senderKey - Sender Key 状态（会被就地修改）
 * @param header - 消息头
 * @param ciphertextBase64 - Base64 编码的密文
 * @returns 解密后的明文
 */
export async function senderKeyDecrypt(
  senderKey: SenderKey,
  header: SenderKeyHeader,
  ciphertextBase64: string,
): Promise<string> {
  const ciphertext = base64ToBuffer(ciphertextBase64);
  const signature = base64ToBuffer(header.signature);
  const iv = new Uint8Array(base64ToBuffer(header.iv));

  // 导入签名公钥并验证
  const signingPubKey = await importSigningPublicKey(base64ToBuffer(header.signingPubkey));
  const counterBuf = counterToBuffer(header.counter);
  const signatureData = concatBuffers(ciphertext, counterBuf);
  const valid = await ecdsaVerify(signingPubKey, signature, signatureData);
  if (!valid) {
    throw new Error('Sender Key: signature verification failed');
  }

  // 推进链密钥到目标计数器位置
  // 如果接收方的计数器落后于发送方，需要跳过中间的消息密钥
  let currentChainKey = senderKey.chainKey;
  for (let i = senderKey.counter; i < header.counter; i++) {
    const { chainKey: nextChainKey } = await splitSenderChainKey(currentChainKey);
    currentChainKey = nextChainKey;
  }

  // 派生目标消息密钥
  const { messageKey, chainKey: newChainKey } = await splitSenderChainKey(currentChainKey);
  senderKey.chainKey = newChainKey;
  senderKey.counter = header.counter + 1;

  // AES-256-GCM 解密
  const decrypted = await aesGcmDecrypt(messageKey, ciphertext, iv);
  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// 序列化 / 反序列化
// ---------------------------------------------------------------------------

/**
 * 序列化 Sender Key（用于密钥分发和持久化存储）
 *
 * @param senderKey - 要序列化的 Sender Key
 * @returns 序列化格式
 */
export async function serializeSenderKey(senderKey: SenderKey): Promise<SerializedSenderKey> {
  const signingPrivateJwk = await crypto.subtle.exportKey('jwk', senderKey.signingKeyPair.privateKey);
  const signingPublicJwk = await crypto.subtle.exportKey('jwk', senderKey.signingKeyPair.publicKey);

  return {
    chainKey: bufferToBase64(senderKey.chainKey),
    signingPrivateJwk,
    signingPublicJwk,
    counter: senderKey.counter,
  };
}

/**
 * 反序列化 Sender Key
 *
 * @param data - 序列化格式数据
 * @returns 还原的 Sender Key
 */
export async function deserializeSenderKey(data: SerializedSenderKey): Promise<SenderKey> {
  const chainKey = base64ToBuffer(data.chainKey);

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    data.signingPrivateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    data.signingPublicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );

  return {
    chainKey,
    signingKeyPair: { privateKey, publicKey },
    counter: data.counter,
  };
}
