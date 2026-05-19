import { base64ToBytes, bytesToBase64, copyBytes } from "@im/shared-e2ee-core";

const DB_NAME = "e2ee_keys";
const DB_VERSION = 3;
const STORE_NAME = "sessions";
const STORES = ["identity", "prekeys", "sessions", "sender_keys", "meta"] as const;

interface StoredRustSessionState {
  version: 2;
  stateBytes: Uint8Array;
}

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

const normalizeStateBytes = (stateBytes: Uint8Array | string): Uint8Array =>
  typeof stateBytes === "string" ? base64ToBytes(stateBytes) : copyBytes(stateBytes);

export async function saveSessionStateBytes(sessionId: string, stateBytes: Uint8Array | string): Promise<void> {
  const stored: StoredRustSessionState = {
    version: 2,
    stateBytes: normalizeStateBytes(stateBytes),
  };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(stored, sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSessionStateBytes(sessionId: string): Promise<Uint8Array | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(sessionId);
    req.onsuccess = () => {
      const data = req.result as StoredRustSessionState | undefined;
      resolve(data?.version === 2 && data.stateBytes instanceof Uint8Array ? copyBytes(data.stateBytes) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSessionState(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listSessionIds(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });
}

export async function saveRatchetState(sessionId: string, stateBytes: Uint8Array | string): Promise<void> {
  await saveSessionStateBytes(sessionId, stateBytes);
}

export async function getRatchetState(sessionId: string): Promise<Uint8Array | null> {
  return getSessionStateBytes(sessionId);
}

export async function deleteRatchetState(sessionId: string): Promise<void> {
  await deleteSessionState(sessionId);
}

export const encodeSessionStateForTransport = (stateBytes: Uint8Array): string => bytesToBase64(stateBytes);
