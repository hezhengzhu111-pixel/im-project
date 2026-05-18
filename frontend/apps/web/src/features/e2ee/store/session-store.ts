/**
 * E2EE 会话状态持久化存储
 *
 * 将 Double Ratchet 状态保存到 IndexedDB，支持会话恢复。
 * CryptoKey 通过 structured clone 直接保存，私钥和会话密钥不可导出。
 */

import type { RatchetState } from '../engine/double-ratchet';

// ---------------------------------------------------------------------------
// Stored state type
// ---------------------------------------------------------------------------

interface StoredRatchetState extends RatchetState {
  version: 3;
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
  if (state.dhKeyPair.privateKey.extractable) {
    throw new Error('unsupported_browser_crypto');
  }
  const stored: StoredRatchetState = {
    ...state,
    skippedMessageKeys: new Map(state.skippedMessageKeys),
    version: 3,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(stored, sessionId);
    tx.oncomplete = () => {
      // E20: counter values are diagnostic-only; do not log in production
      resolve();
    };
    tx.onerror = () => {
      console.error(`[E2EE] saveRatchetState FAILED: session=${sessionId}`, tx.error);
      reject(tx.error);
    };
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
      const data = req.result as StoredRatchetState | undefined;
      if (!data) {
        console.warn(`[E2EE] getRatchetState: no data for session=${sessionId}`);
        resolve(null);
        return;
      }
      // E20: counter values are diagnostic-only; do not log in production
      deserializeRatchetState(data).then(resolve).catch((err) => {
        console.error(`[E2EE] getRatchetState: deserialize failed for session=${sessionId}`, err);
        reject(err);
      });
    };
    req.onerror = () => {
      console.error(`[E2EE] getRatchetState: IndexedDB error for session=${sessionId}`, req.error);
      reject(req.error);
    };
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
 * Validate and return stored RatchetState. Legacy JWK records are not used because
 * they contain exportable key material; callers must renegotiate the session.
 */
async function deserializeRatchetState(data: StoredRatchetState): Promise<RatchetState> {
  if (data.version !== 3 || data.dhKeyPair.privateKey.extractable) {
    throw new Error('missing_local_private_key');
  }
  return {
    rootKey: data.rootKey,
    sendingChainKey: data.sendingChainKey,
    receivingChainKey: data.receivingChainKey,
    sendCounter: data.sendCounter,
    receiveCounter: data.receiveCounter,
    previousCounter: data.previousCounter,
    dhKeyPair: data.dhKeyPair,
    remotePublicKey: data.remotePublicKey,
    skippedMessageKeys: data.skippedMessageKeys instanceof Map
      ? data.skippedMessageKeys
      : new Map(),
  };
}
