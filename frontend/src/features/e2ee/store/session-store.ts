/**
 * E2EE 会话状态持久化存储
 *
 * 将 Double Ratchet 状态序列化到 IndexedDB，支持会话恢复。
 * 使用 JWK 格式存储 CryptoKey 对象（需 extractable: true）。
 *
 * 注意: Identity Key (extractable: false) 不能导出为 JWK，
 * 但 RatchetState 中的密钥（rootKey, chainKey, DH key）都是 extractable 的。
 */

import type { RatchetState } from '../engine/double-ratchet';
import { cryptoKeyToJwk, jwkToCryptoKey } from '../engine/codec';

// ---------------------------------------------------------------------------
// 序列化类型
// ---------------------------------------------------------------------------

/** 序列化后的单个跳过消息密钥条目 */
interface SerializedSkippedKey {
  key: string;
  messageKey: JsonWebKey;
}

/** 序列化后的 RatchetState（所有 CryptoKey 转为 JWK） */
interface SerializedRatchetState {
  rootKey: JsonWebKey;
  sendingChainKey: JsonWebKey | null;
  receivingChainKey: JsonWebKey | null;
  sendCounter: number;
  receiveCounter: number;
  previousCounter: number;
  dhPrivateKey: JsonWebKey;
  dhPublicKey: JsonWebKey;
  remotePublicKey: JsonWebKey | null;
  skippedMessageKeys: SerializedSkippedKey[];
}

// ---------------------------------------------------------------------------
// IndexedDB 常量
// ---------------------------------------------------------------------------

const DB_NAME = 'e2ee_keys';
const DB_VERSION = 2;
const STORE_NAME = 'sessions';
const STORES = ['identity', 'prekeys', 'sessions', 'sender_keys', 'meta'] as const;

// ---------------------------------------------------------------------------
// IndexedDB 底层操作
// ---------------------------------------------------------------------------

/**
 * 打开 IndexedDB 数据库
 *
 * 如果 sessions store 不存在，通过 onupgradeneeded 创建。
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// 保存/读取 RatchetState
// ---------------------------------------------------------------------------

/**
 * 保存 RatchetState 到 IndexedDB
 *
 * @param sessionId - 会话标识（如 "123_456"）
 * @param state - 当前棘轮状态
 */
export async function saveRatchetState(sessionId: string, state: RatchetState): Promise<void> {
  // 序列化跳过消息密钥
  const skippedEntries: SerializedSkippedKey[] = [];
  for (const [key, messageKey] of state.skippedMessageKeys) {
    skippedEntries.push({ key, messageKey: await cryptoKeyToJwk(messageKey) });
  }

  const serialized: SerializedRatchetState = {
    rootKey: await cryptoKeyToJwk(state.rootKey),
    sendingChainKey: state.sendingChainKey ? await cryptoKeyToJwk(state.sendingChainKey) : null,
    receivingChainKey: state.receivingChainKey ? await cryptoKeyToJwk(state.receivingChainKey) : null,
    sendCounter: state.sendCounter,
    receiveCounter: state.receiveCounter,
    previousCounter: state.previousCounter,
    dhPrivateKey: await cryptoKeyToJwk(state.dhKeyPair.privateKey),
    dhPublicKey: await cryptoKeyToJwk(state.dhKeyPair.publicKey),
    remotePublicKey: state.remotePublicKey ? await cryptoKeyToJwk(state.remotePublicKey) : null,
    skippedMessageKeys: skippedEntries,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(serialized, sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 从 IndexedDB 读取 RatchetState
 *
 * @param sessionId - 会话标识
 * @returns RatchetState 或 null（不存在时）
 */
export async function getRatchetState(sessionId: string): Promise<RatchetState | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(sessionId);
    req.onsuccess = () => {
      const data = req.result as SerializedRatchetState | undefined;
      if (!data) {
        resolve(null);
        return;
      }
      deserializeRatchetState(data).then(resolve).catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 删除指定会话的 RatchetState
 *
 * @param sessionId - 会话标识
 */
export async function deleteRatchetState(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 列出所有已存储的会话 ID
 */
export async function listSessionIds(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// 反序列化
// ---------------------------------------------------------------------------

/**
 * 将 JWK 格式还原为 RatchetState
 */
async function deserializeRatchetState(data: SerializedRatchetState): Promise<RatchetState> {
  const ecdhParams: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' };
  const aesParams: AesKeyAlgorithm = { name: 'AES-GCM', length: 256 };

  const rootKey = await jwkToCryptoKey(data.rootKey, aesParams, ['encrypt', 'decrypt']);

  const sendingChainKey = data.sendingChainKey
    ? await jwkToCryptoKey(data.sendingChainKey, aesParams, ['encrypt', 'decrypt'])
    : null;

  const receivingChainKey = data.receivingChainKey
    ? await jwkToCryptoKey(data.receivingChainKey, aesParams, ['encrypt', 'decrypt'])
    : null;

  const dhPrivateKey = await jwkToCryptoKey(data.dhPrivateKey, ecdhParams, ['deriveKey', 'deriveBits']);
  const dhPublicKey = await jwkToCryptoKey(data.dhPublicKey, ecdhParams, []);

  const remotePublicKey = data.remotePublicKey
    ? await jwkToCryptoKey(data.remotePublicKey, ecdhParams, [])
    : null;

  // 反序列化跳过消息密钥
  const skippedMessageKeys = new Map<string, CryptoKey>();
  if (data.skippedMessageKeys) {
    for (const entry of data.skippedMessageKeys) {
      const mk = await jwkToCryptoKey(entry.messageKey, aesParams, ['encrypt', 'decrypt']);
      skippedMessageKeys.set(entry.key, mk);
    }
  }

  return {
    rootKey,
    sendingChainKey,
    receivingChainKey,
    sendCounter: data.sendCounter,
    receiveCounter: data.receiveCounter,
    previousCounter: data.previousCounter,
    dhKeyPair: { privateKey: dhPrivateKey, publicKey: dhPublicKey },
    remotePublicKey,
    skippedMessageKeys,
  };
}
