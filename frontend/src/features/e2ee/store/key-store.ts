/**
 * E2EE 密钥持久化存储
 *
 * Web 端使用 IndexedDB，通过 structured clone 存储 CryptoKey 对象。
 * Identity Key (extractable: false) 直接以 CryptoKey 形式存储，不可导出。
 * Signed Pre Key (extractable: true) 以 JWK + raw public key 形式存储。
 */

import { cryptoKeyToJwk, jwkToCryptoKey } from '../engine/codec';
import { exportPublicKey, importPublicKey } from '../engine/crypto-primitives';

const DB_NAME = 'e2ee_keys';
const DB_VERSION = 1;

const STORES = ['identity', 'prekeys', 'sessions', 'sender_keys', 'meta'] as const;

// ---------------------------------------------------------------------------
// IndexedDB 底层操作
// ---------------------------------------------------------------------------

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

async function idbGet(storeName: string, key: string): Promise<unknown | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName: string, key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Identity Key Pair — extractable: false，直接存储 CryptoKey
// ---------------------------------------------------------------------------

/**
 * 保存 Identity Key Pair（ECDH P-256，extractable: false）
 * 使用 IndexedDB structured clone 直接存储 CryptoKey 对象，无需 JWK 导出。
 */
export async function saveIdentityKeyPair(keyPair: CryptoKeyPair): Promise<void> {
  await idbPut('identity', 'identityKeyPair', keyPair);
}

/**
 * 读取 Identity Key Pair
 */
export async function getIdentityKeyPair(): Promise<CryptoKeyPair | null> {
  const result = await idbGet('identity', 'identityKeyPair');
  return (result as CryptoKeyPair) ?? null;
}

/**
 * 是否已存在 Identity Key
 */
export async function hasIdentityKey(): Promise<boolean> {
  const kp = await getIdentityKeyPair();
  return kp !== null && kp !== undefined;
}

// ---------------------------------------------------------------------------
// Signed Pre Key — extractable: true，以 JWK + raw public key 存储
// ---------------------------------------------------------------------------

interface StoredSignedPreKey {
  privateKeyJwk: JsonWebKey;
  publicKeyRaw: ArrayBuffer;
}

/**
 * 保存 Signed Pre Key Pair（ECDH P-256，extractable: true）
 * 私钥以 JWK 格式存储，公钥以 raw ArrayBuffer 存储。
 */
export async function saveSignedPreKey(id: number, keyPair: CryptoKeyPair): Promise<void> {
  const privateKeyJwk = await cryptoKeyToJwk(keyPair.privateKey);
  const publicKeyRaw = await exportPublicKey(keyPair.publicKey);

  await idbPut('prekeys', `signedPreKey_${id}`, {
    privateKeyJwk,
    publicKeyRaw,
  } satisfies StoredSignedPreKey);
}

/**
 * 读取 Signed Pre Key Pair
 */
export async function getSignedPreKey(id: number): Promise<CryptoKeyPair | null> {
  const stored = (await idbGet('prekeys', `signedPreKey_${id}`)) as StoredSignedPreKey | undefined;
  if (!stored) return null;

  const privateKey = await jwkToCryptoKey(
    stored.privateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' } as EcKeyImportParams,
    ['deriveKey', 'deriveBits'],
  );
  const publicKey = await importPublicKey(stored.publicKeyRaw);

  return { privateKey, publicKey };
}

// ---------------------------------------------------------------------------
// Device ID
// ---------------------------------------------------------------------------

/**
 * 保存设备标识
 */
export async function saveDeviceId(deviceId: string): Promise<void> {
  await idbPut('meta', 'deviceId', deviceId);
}

/**
 * 读取设备标识
 */
export async function getDeviceId(): Promise<string | undefined> {
  const result = await idbGet('meta', 'deviceId');
  return (result as string) ?? undefined;
}

// ---------------------------------------------------------------------------
// Pre-Key Bundle 元数据
// ---------------------------------------------------------------------------

/**
 * 保存 Pre-Key Bundle 元数据
 */
export async function savePreKeyBundle(bundle: unknown): Promise<unknown> {
  const id = (bundle as Record<string, unknown>)?.id ?? Date.now();
  const key = `preKeyBundle_${id}`;
  await idbPut('prekeys', key, bundle);
  return id;
}

// ---------------------------------------------------------------------------
// 清除所有密钥
// ---------------------------------------------------------------------------

/**
 * 清除所有存储的密钥（退出登录时调用）
 */
export async function clearAllKeys(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, 'readwrite');

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);

    for (const storeName of storeNames) {
      tx.objectStore(storeName).clear();
    }
  });
}
