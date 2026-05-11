/**
 * Double Ratchet 消息加密算法
 *
 * 实现 Signal Protocol 的 Double Ratchet 算法，包括:
 * - 发送链 (Sending Chain): KDF 链式派生消息密钥
 * - 接收链 (Receiving Chain): KDF 链式派生消息密钥
 * - DH 轮换 (DH Ratchet): 每次收到新远端公钥时执行双向 DH 派生
 *
 * 安全特性:
 * - 前向保密 (Forward Secrecy): 旧密钥泄露不影响新消息
 * - 断后保密 (Break-in Recovery): 即使当前状态泄露，下次 DH 轮换后恢复安全
 */

import {
  generateRatchetKeyPair,
  exportPublicKey,
  importPublicKey,
  ecdhDeriveBits,
  hkdfDeriveKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
} from './crypto-primitives';
import { bufferToBase64, base64ToBuffer, concatBuffers, randomBytes } from './codec';
import type { RatchetHeader } from '../types';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** Double Ratchet 状态 */
export interface RatchetState {
  /** 当前根密钥（每次 DH 轮换后更新） */
  rootKey: CryptoKey;
  /** 发送链密钥（首次初始化后不为 null） */
  sendingChainKey: CryptoKey | null;
  /** 接收链密钥（初始化后通常不为 null） */
  receivingChainKey: CryptoKey | null;
  /** 发送消息计数器 */
  sendCounter: number;
  /** 接收消息计数器 */
  receiveCounter: number;
  /** 上一轮发送链的计数器（DH 轮换时记录） */
  previousCounter: number;
  /** 当前 DH 密钥对 */
  dhKeyPair: CryptoKeyPair;
  /** 远端 DH 公钥（首次收到远端消息后不为 null） */
  remotePublicKey: CryptoKey | null;
  /**
   * 跳过消息密钥缓存（支持乱序解密）
   * key 格式: `${ratchetPublicKeyBase64}_${counter}`
   */
  skippedMessageKeys: Map<string, CryptoKey>;
}

/** KDF 链分割结果 */
interface ChainKeySplit {
  messageKey: CryptoKey;
  chainKey: CryptoKey;
}

// ---------------------------------------------------------------------------
// HKDF Info 常量
// ---------------------------------------------------------------------------

const HKDF_SALT: ArrayBuffer = new Uint8Array(0).buffer as ArrayBuffer;
const INFO_ROOT_KEY: ArrayBuffer = new TextEncoder().encode('RootKey').buffer as ArrayBuffer;
const INFO_SENDING_CHAIN: ArrayBuffer = new TextEncoder().encode('SendingChainKey').buffer as ArrayBuffer;
const INFO_RECEIVING_CHAIN: ArrayBuffer = new TextEncoder().encode('ReceivingChainKey').buffer as ArrayBuffer;
const INFO_MESSAGE_KEYS: ArrayBuffer = new TextEncoder().encode('MessageKeys').buffer as ArrayBuffer;
const INFO_CHAIN_KEYS: ArrayBuffer = new TextEncoder().encode('ChainKeys').buffer as ArrayBuffer;

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
 * 构建 AES-GCM 的 AAD (Additional Authenticated Data)
 *
 * 将消息头的关键字段（ratchetPublicKey + counter + previousCounter）序列化为
 * ArrayBuffer，作为 AES-GCM 的 AAD。接收方可以用相同方式重建 AAD，
 * 确保消息头未被篡改。
 */
function buildAad(ratchetPublicKey: string, counter: number, previousCounter: number): ArrayBuffer {
  return new TextEncoder().encode(
    JSON.stringify({ ratchetPublicKey, counter, previousCounter }),
  ).buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// 根密钥导入
// ---------------------------------------------------------------------------

/**
 * 将 X3DH 派生的 Base64 根密钥导入为 CryptoKey
 *
 * X3DH 返回 256 位原始密钥材料 (Base64 编码)。
 * 此函数将其导入为 extractable 的 AES-GCM-256 CryptoKey，供 Double Ratchet 使用。
 *
 * @param rootKeyBase64 - X3DH 派生的根密钥 (Base64)
 * @returns AES-GCM-256 CryptoKey (extractable)
 */
export async function importRootKey(rootKeyBase64: string): Promise<CryptoKey> {
  const raw = base64ToBuffer(rootKeyBase64);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// KDF 链分割
// ---------------------------------------------------------------------------

/**
 * 从链密钥派生消息密钥和下一个链密钥
 *
 * 使用 HKDF 从当前链密钥派生:
 * - messageKey: 用于 AES-GCM 加密单条消息
 * - chainKey: 下一个链密钥（链式推进）
 *
 * @param chainKey - 当前链密钥 (AES-GCM-256, extractable)
 * @returns messageKey + 新的 chainKey
 */
async function splitChainKey(chainKey: CryptoKey): Promise<ChainKeySplit> {
  const raw = await crypto.subtle.exportKey('raw', chainKey);
  const messageKey = await hkdfDeriveKey(toBuffer(raw), HKDF_SALT, INFO_MESSAGE_KEYS);
  const newChainKey = await hkdfDeriveKey(toBuffer(raw), HKDF_SALT, INFO_CHAIN_KEYS);
  return { messageKey, chainKey: newChainKey };
}

/**
 * KDF_RK: 从根密钥和 DH 输出派生新的根密钥和链密钥
 *
 * @param rootKey - 当前根密钥
 * @param dhOutput - ECDH 派生的共享密钥 (256 bits)
 * @param chainInfo - 链密钥的 HKDF info（发送或接收）
 * @returns 新的根密钥和链密钥
 */
async function kdfRootKey(
  rootKey: CryptoKey,
  dhOutput: ArrayBuffer,
  chainInfo: ArrayBuffer,
): Promise<{ newRootKey: CryptoKey; chainKey: CryptoKey }> {
  const rootKeyRaw = await crypto.subtle.exportKey('raw', rootKey);
  const kdfInput = concatBuffers(toBuffer(rootKeyRaw), toBuffer(dhOutput));

  const newRootKey = await hkdfDeriveKey(kdfInput, HKDF_SALT, INFO_ROOT_KEY);
  const chainKey = await hkdfDeriveKey(kdfInput, HKDF_SALT, chainInfo);
  return { newRootKey, chainKey };
}

// ---------------------------------------------------------------------------
// DH 轮换
// ---------------------------------------------------------------------------

/**
 * 执行 DH 轮换（收到远端新公钥时调用）
 *
 * 标准 Double Ratchet DH 轮换包含两步:
 * 1. 接收方向: ECDH(当前私钥, 远端新公钥) → 派生接收链密钥
 * 2. 发送方向: 生成新 DH 密钥对 → ECDH(新私钥, 远端新公钥) → 派生发送链密钥
 *
 * @param state - 当前棘轮状态（会被就地修改）
 * @param newRemotePub - 远端新公钥
 */
async function performDhRatchet(state: RatchetState, newRemotePub: CryptoKey): Promise<void> {
  // 记录上一轮发送计数器
  state.previousCounter = state.sendCounter;
  state.sendCounter = 0;
  state.receiveCounter = 0;

  // --- 步骤 1: 接收方向 ---
  // 使用当前 DH 私钥 + 远端新公钥 → 派生接收链
  // 使用 INFO_SENDING_CHAIN 与 initSendingChain/initReceivingChain 保持一致，
  // 确保 Alice 的 sendingChainKey 与 Bob 的 receivingChainKey 匹配
  const dh1 = await ecdhDeriveBits(state.dhKeyPair.privateKey, newRemotePub);
  const { newRootKey: rk1, chainKey: receivingChainKey } = await kdfRootKey(
    state.rootKey,
    toBuffer(dh1),
    INFO_SENDING_CHAIN,
  );
  state.rootKey = rk1;
  state.receivingChainKey = receivingChainKey;

  // --- 步骤 2: 发送方向 ---
  // 生成新 DH 密钥对
  state.dhKeyPair = await generateRatchetKeyPair();
  // 使用新 DH 私钥 + 同一远端公钥 → 派生发送链
  const dh2 = await ecdhDeriveBits(state.dhKeyPair.privateKey, newRemotePub);
  const { newRootKey: rk2, chainKey: sendingChainKey } = await kdfRootKey(
    state.rootKey,
    toBuffer(dh2),
    INFO_SENDING_CHAIN,
  );
  state.rootKey = rk2;
  state.sendingChainKey = sendingChainKey;

  // 更新远端公钥
  state.remotePublicKey = newRemotePub;
}

// ---------------------------------------------------------------------------
// 发送消息加密
// ---------------------------------------------------------------------------

/**
 * 使用发送链加密一条消息
 *
 * 流程:
 * 1. 从发送链密钥派生消息密钥 + 新链密钥
 * 2. 使用 AES-256-GCM 加密明文
 * 3. 构建消息头（包含 DH 公钥、计数器、IV）
 * 4. 推进发送计数器
 *
 * @param state - 当前棘轮状态（会被就地修改）
 * @param plaintext - 明文消息
 * @returns 消息头 + Base64 编码的密文
 */
export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: string,
): Promise<{ header: RatchetHeader; ciphertext: string }> {
  if (!state.sendingChainKey) {
    throw new Error('Double Ratchet: sending chain not initialized');
  }

  // 从发送链派生消息密钥
  const { messageKey, chainKey: newChainKey } = await splitChainKey(state.sendingChainKey);
  state.sendingChainKey = newChainKey;

  // 构建消息头
  const pubRaw = await exportPublicKey(state.dhKeyPair.publicKey);
  const ratchetPublicKey = bufferToBase64(toBuffer(pubRaw));
  const header: RatchetHeader = {
    ratchetPublicKey,
    counter: state.sendCounter,
    previousCounter: state.previousCounter,
    iv: bufferToBase64(randomBytes(12).buffer as ArrayBuffer),
  };

  // 构建 AAD 并 AES-256-GCM 加密
  const aad = buildAad(ratchetPublicKey, header.counter, header.previousCounter);
  const iv = new Uint8Array(base64ToBuffer(header.iv));
  const ptBuffer: ArrayBuffer = new TextEncoder().encode(plaintext).buffer as ArrayBuffer;
  const { ciphertext } = await aesGcmEncrypt(messageKey, ptBuffer, iv, aad);

  state.sendCounter++;
  return { header, ciphertext: bufferToBase64(ciphertext) };
}

// ---------------------------------------------------------------------------
// 接收消息解密
// ---------------------------------------------------------------------------

/**
 * 使用接收链解密一条消息
 *
 * 流程:
 * 1. 检查远端 DH 公钥是否变化 → 如变化则执行 DH 轮换
 * 2. 推进接收链到目标计数器位置
 * 3. 使用 AES-256-GCM 解密密文
 * 4. 更新接收计数器
 *
 * @param state - 当前棘轮状态（会被就地修改）
 * @param header - 消息头
 * @param ciphertextBase64 - Base64 编码的密文
 * @returns 解密后的明文
 */
export async function ratchetDecrypt(
  state: RatchetState,
  header: RatchetHeader,
  ciphertextBase64: string,
): Promise<string> {
  const ciphertext = base64ToBuffer(ciphertextBase64);
  const iv = new Uint8Array(base64ToBuffer(header.iv));
  const targetCounter = header.counter;
  const aad = buildAad(header.ratchetPublicKey, targetCounter, header.previousCounter);

  // 检查跳过消息密钥缓存
  const skipKey = `${header.ratchetPublicKey}_${targetCounter}`;
  const cachedMessageKey = state.skippedMessageKeys.get(skipKey);
  if (cachedMessageKey) {
    state.skippedMessageKeys.delete(skipKey);
    const decrypted = await aesGcmDecrypt(cachedMessageKey, ciphertext, iv, aad);
    return new TextDecoder().decode(decrypted);
  }

  // 导入远端公钥
  const remotePub = await importPublicKey(base64ToBuffer(header.ratchetPublicKey));

  // 检查是否需要 DH 轮换
  // 仅当已有远端公钥且与消息中的不同时才执行 DH 轮换
  // 首次接收消息时（remotePublicKey === null）使用预初始化的接收链
  const needsRatchet = state.remotePublicKey !== null && await isDifferentPublicKey(
    state.remotePublicKey,
    header.ratchetPublicKey,
  );
  if (targetCounter < state.receiveCounter && !needsRatchet) {
    throw new Error('Double Ratchet: duplicate or expired message');
  }
  if (needsRatchet) {
    await performDhRatchet(state, remotePub);
  }

  // 首次接收消息时记录远端公钥
  if (!state.remotePublicKey) {
    state.remotePublicKey = remotePub;
  }

  if (!state.receivingChainKey) {
    throw new Error('Double Ratchet: receiving chain not initialized');
  }

  // 推进接收链到目标计数器位置，缓存跳过的消息密钥
  let currentChainKey = state.receivingChainKey;

  for (let i = state.receiveCounter; i < targetCounter; i++) {
    const { messageKey: skippedKey, chainKey: nextChainKey } = await splitChainKey(currentChainKey);
    // 缓存跳过的消息密钥，支持乱序解密
    const skippedRatchetPub = header.ratchetPublicKey;
    state.skippedMessageKeys.set(`${skippedRatchetPub}_${i}`, skippedKey);
    currentChainKey = nextChainKey;
  }

  // 派生目标消息密钥
  const { messageKey, chainKey: newChainKey } = await splitChainKey(currentChainKey);
  state.receivingChainKey = newChainKey;

  // AES-256-GCM 解密（带 AAD）
  const decrypted = await aesGcmDecrypt(messageKey, ciphertext, iv, aad);
  state.receiveCounter = targetCounter + 1;

  return new TextDecoder().decode(decrypted);
}

/**
 * 比较两个公钥是否不同（Base64 字符串比较）
 */
async function isDifferentPublicKey(
  currentRemotePub: CryptoKey,
  newRemotePubBase64: string,
): Promise<boolean> {
  const currentRaw = await exportPublicKey(currentRemotePub);
  return bufferToBase64(toBuffer(currentRaw)) !== newRemotePubBase64;
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/**
 * 初始化发送链（X3DH 完成后调用）
 *
 * 从 X3DH 派生的根密钥中提取发起方发送链和接收链密钥。
 * RatchetState 会写入 IndexedDB，因此 DH 密钥对使用可导出的 ratchet key。
 *
 * @param rootKey - X3DH 派生的根密钥 (CryptoKey, 需提前通过 importRootKey 转换)
 * @param _identityKeyPair - 发起方 Identity Key Pair（保留参数用于兼容现有调用）
 * @returns 初始化的 RatchetState
 */
export async function initSendingChain(
  rootKey: CryptoKey,
  _identityKeyPair: CryptoKeyPair,
): Promise<RatchetState> {
  const rootKeyRaw = await crypto.subtle.exportKey('raw', rootKey);
  const sendingChainKey = await hkdfDeriveKey(toBuffer(rootKeyRaw), HKDF_SALT, INFO_SENDING_CHAIN);
  const receivingChainKey = await hkdfDeriveKey(toBuffer(rootKeyRaw), HKDF_SALT, INFO_RECEIVING_CHAIN);
  const ratchetKeyPair = await generateRatchetKeyPair();

  return {
    rootKey,
    sendingChainKey,
    receivingChainKey,
    sendCounter: 0,
    receiveCounter: 0,
    previousCounter: 0,
    dhKeyPair: ratchetKeyPair,
    remotePublicKey: null,
    skippedMessageKeys: new Map(),
  };
}

/**
 * 初始化接收链（响应方在 X3DH 完成后调用）
 *
 * 从 X3DH 派生的根密钥中提取响应方接收链和发送链密钥。
 * 响应方接收链匹配发起方发送链，响应方发送链匹配发起方接收链。
 *
 * @param rootKey - X3DH 派生的根密钥 (CryptoKey)
 * @param _identityKeyPair - 响应方 Identity Key Pair（保留参数用于兼容现有调用）
 * @returns 初始化的 RatchetState
 */
export async function initReceivingChain(
  rootKey: CryptoKey,
  _identityKeyPair: CryptoKeyPair,
): Promise<RatchetState> {
  const rootKeyRaw = await crypto.subtle.exportKey('raw', rootKey);
  // 使用与 initSendingChain 相同的 info，确保双方初始链密钥一致
  const receivingChainKey = await hkdfDeriveKey(toBuffer(rootKeyRaw), HKDF_SALT, INFO_SENDING_CHAIN);
  const sendingChainKey = await hkdfDeriveKey(toBuffer(rootKeyRaw), HKDF_SALT, INFO_RECEIVING_CHAIN);
  const ratchetKeyPair = await generateRatchetKeyPair();

  return {
    rootKey,
    sendingChainKey,
    receivingChainKey,
    sendCounter: 0,
    receiveCounter: 0,
    previousCounter: 0,
    dhKeyPair: ratchetKeyPair,
    remotePublicKey: null,
    skippedMessageKeys: new Map(),
  };
}
