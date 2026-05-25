import type { RustLocalE2eeKeyMaterial, RustPublicPreKeyBundle } from "@im/shared-e2ee-core";

const DB_NAME = "e2ee_keys";
const DB_VERSION = 3;
const STORES = ["identity", "prekeys", "sessions", "sender_keys", "meta"] as const;
const LOCAL_KEY_MATERIAL_KEY = "rustLocalKeyMaterial";

export type LocalPublicBundle = RustPublicPreKeyBundle;

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
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName: string, key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

const isRustLocalKeyMaterial = (value: unknown): value is RustLocalE2eeKeyMaterial => {
  const record = value as Partial<RustLocalE2eeKeyMaterial> | undefined;
  return (
    record?.version === 2 &&
    typeof record.identityKeyPairBincode === "string" &&
    typeof record.signedPreKeyPairBincode === "string" &&
    Array.isArray(record.oneTimePreKeyPairs) &&
    typeof record.publicBundle?.identityKey === "string"
  );
};

export async function saveLocalKeyMaterial(keys: RustLocalE2eeKeyMaterial): Promise<void> {
  await idbPut("identity", LOCAL_KEY_MATERIAL_KEY, keys);
  await idbPut("meta", "localPublicBundle", keys.publicBundle);
}

export async function getLocalKeyMaterial(): Promise<RustLocalE2eeKeyMaterial | null> {
  const result = await idbGet("identity", LOCAL_KEY_MATERIAL_KEY);
  return isRustLocalKeyMaterial(result) ? result : null;
}

export async function hasIdentityKey(): Promise<boolean> {
  return (await getLocalKeyMaterial()) !== null;
}

export async function saveDeviceId(deviceId: string): Promise<void> {
  await idbPut("meta", "deviceId", deviceId);
}

export async function getDeviceId(): Promise<string | undefined> {
  const result = await idbGet("meta", "deviceId");
  return typeof result === "string" ? result : undefined;
}

export async function saveLocalPublicBundle(bundle: LocalPublicBundle): Promise<void> {
  await idbPut("meta", "localPublicBundle", bundle);
}

export async function getLocalPublicBundle(): Promise<LocalPublicBundle | null> {
  const keys = await getLocalKeyMaterial();
  if (keys?.publicBundle) {
    return keys.publicBundle;
  }
  const result = await idbGet("meta", "localPublicBundle");
  const bundle = result as Partial<LocalPublicBundle> | undefined;
  return typeof bundle?.identityKey === "string" && typeof bundle.signedPreKeySignature === "string"
    ? (bundle as LocalPublicBundle)
    : null;
}

export async function markOneTimePreKeyConsumed(oneTimePreKeyId: number): Promise<void> {
  const keys = await getLocalKeyMaterial();
  if (!keys) {
    return;
  }
  await saveLocalKeyMaterial({
    ...keys,
    oneTimePreKeyPairs: keys.oneTimePreKeyPairs.filter((pair) => pair.id !== oneTimePreKeyId),
    publicBundle: {
      ...keys.publicBundle,
      oneTimePreKeys: keys.publicBundle.oneTimePreKeys?.filter((preKey) => preKey.id !== oneTimePreKeyId),
    },
  });
}

export async function savePreKeyBundle(bundle: unknown): Promise<unknown> {
  const id = (bundle as Record<string, unknown>)?.id ?? Date.now();
  await idbPut("prekeys", `preKeyBundle_${String(id)}`, bundle);
  return id;
}

export async function clearLocalKeyMaterial(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["identity", "meta"], "readwrite");
    tx.objectStore("identity").delete(LOCAL_KEY_MATERIAL_KEY);
    tx.objectStore("meta").delete("localPublicBundle");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all session state and reset E2EE status markers.
 *
 * Called during device re-registration because new key material (SPK, OTKs)
 * invalidates all existing Double Ratchet sessions — they were established
 * with old public keys that no longer match the new private keys.
 */
export async function clearAllSessionState(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["sessions"], "readwrite");
    tx.objectStore("sessions").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Reset all e2ee status markers so the UI shows "enable encryption" again
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("e2ee:status:") || key.startsWith("e2ee:remote_device:") || key.startsWith("e2ee:initial-handshake:")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage may be unavailable
  }
}

export async function clearLegacyE2eeState(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("e2ee:initial-handshake:")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage can be unavailable in tests or private browsing.
  }
}

export async function clearAllKeys(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, "readwrite");

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);

    for (const storeName of storeNames) {
      tx.objectStore(storeName).clear();
    }
  });
}

const rustOnlyError = (): Error => new Error("rust_e2ee_only");

export async function saveIdentityKeyPair(): Promise<void> {
  throw rustOnlyError();
}

export async function getIdentityKeyPair(): Promise<null> {
  return null;
}

export async function saveSignedPreKey(): Promise<void> {
  throw rustOnlyError();
}

export async function getSignedPreKey(): Promise<null> {
  return null;
}
