import {
  base64ToBytes,
  bytesToBase64,
  copyBytes,
  decodeSessionStateEnvelope,
  encodeSessionStateEnvelope,
  extractSessionStateBytes,
  serializeSessionStateEnvelope,
  validateSessionStateEnvelopeContext,
  SESSION_STATE_ENVELOPE_VERSION,
  type SessionStateEnvelope,
  type SessionStateEnvelopeContext,
} from "@im/shared-e2ee-core";
import { logger } from "@/utils/logger";

const DB_NAME = "e2ee_keys";
const DB_VERSION = 3;
const STORE_NAME = "sessions";
const STORES = ["identity", "prekeys", "sessions", "sender_keys", "meta"] as const;

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

export interface SaveSessionMeta {
  userId?: string;
  localDeviceId: string;
  remoteUserId?: string;
  remoteDeviceId: string;
  direction?: SessionStateEnvelope["direction"];
  localIdentityKey?: string;
  remoteIdentityKey?: string;
}

/**
 * Save session state as a version 3 envelope in IndexedDB.
 *
 * The envelope binds the bincode state to localDeviceId, sessionId,
 * remoteUserId (hashed), and remoteDeviceId.
 *
 * When userId is unavailable (e.g. pre-login), the userId field in the
 * envelope is set to the localDeviceId as a scope approximation.
 * TODO: enforce userId scope once the Web E2EE flow has full user context.
 */
export async function saveSessionStateBytes(
  sessionId: string,
  stateBytes: Uint8Array | string,
  meta: SaveSessionMeta,
): Promise<void> {
  if (!sessionId || sessionId.length === 0) {
    throw new Error("E2EE session state requires sessionId");
  }
  if (!meta.localDeviceId || meta.localDeviceId.length === 0) {
    throw new Error("E2EE session state requires localDeviceId");
  }
  if (!meta.remoteDeviceId || meta.remoteDeviceId.length === 0) {
    throw new Error("E2EE session state requires remoteDeviceId");
  }

  const resolvedUserId = meta.userId || meta.localDeviceId;
  const remoteUserId = meta.remoteUserId || meta.remoteDeviceId;
  if (!remoteUserId || remoteUserId.length === 0) {
    throw new Error("E2EE session state requires remoteUserId");
  }

  const envelope = await encodeSessionStateEnvelope(
    stateBytes,
    {
      userId: resolvedUserId,
      localDeviceId: meta.localDeviceId,
      sessionId,
      remoteUserId,
      remoteDeviceId: meta.remoteDeviceId,
    },
    {
      direction: meta.direction,
      localIdentityKey: meta.localIdentityKey,
      remoteIdentityKey: meta.remoteIdentityKey,
    },
  );

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(JSON.parse(serializeSessionStateEnvelope(envelope)), sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve session state bytes, validating the version 3 envelope context.
 *
 * @param expectedRemoteUserId — validated against the hash in the envelope.
 * @param expectedRemoteDeviceId — validated against remoteDeviceId in the envelope.
 *
 * Returns `null` when:
 * - No stored state exists
 * - The stored state is not a valid v3 envelope
 * - The envelope fails context validation
 * - The stored state is a v2 record (cannot prove context, discarded)
 */
export async function getSessionStateBytes(
  sessionId: string,
  localDeviceId: string,
  expectedRemoteUserId: string,
  expectedRemoteDeviceId: string,
  userId?: string,
): Promise<Uint8Array | null> {
  const db = await openDB();
  const stored = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(sessionId);
    req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
    req.onerror = () => reject(req.error);
  });

  if (!stored || typeof stored !== "object") {
    return null;
  }

  // ── Version 3: validate envelope context ───────────────────────
  if (stored.version === SESSION_STATE_ENVELOPE_VERSION) {
    const envelope = decodeSessionStateEnvelope(stored);
    if (!envelope) {
      return null;
    }
    const resolvedUserId = userId || localDeviceId;
    const resolvedRemoteUserId = expectedRemoteUserId || expectedRemoteDeviceId;
    try {
      await validateSessionStateEnvelopeContext(envelope, {
        userId: resolvedUserId,
        localDeviceId,
        sessionId,
        remoteUserId: resolvedRemoteUserId,
        remoteDeviceId: expectedRemoteDeviceId,
      });
    } catch (ctxErr: unknown) {
      // DIAGNOSTIC: 记录上下文验证失败的具体原因
      const mismatchDetail = ctxErr instanceof Error ? ctxErr.message : String(ctxErr ?? "");
      logger.warn("[E2EE] getSessionStateBytes: context mismatch — stored session rejected", {
        sessionId,
        localDeviceId,
        expectedRemoteUserId,
        expectedRemoteDeviceId,
        storedLocalDeviceId: envelope.localDeviceId,
        storedRemoteDeviceId: envelope.remoteDeviceId,
        mismatchDetail,
      });
      return null;
    }
    try {
      const stateBytes = extractSessionStateBytes(envelope);
      return stateBytes.length > 0 ? copyBytes(stateBytes) : null;
    } catch {
      return null;
    }
  }

  // ── Version 2 / legacy: cannot prove context — discard ─────────
  // Old records contain only { version: 2, stateBytes } with no userId,
  // deviceId, or remote peer metadata. They cannot be safely restored
  // because we cannot prove which user/device/session/peer they belong to.
  // Returning null triggers re-negotiation.
  return null;
}

/**
 * Find a session state by sessionId and localDeviceId alone, without requiring
 * remoteUserId or remoteDeviceId. Used as a fallback when the localStorage
 * mapping of remote device IDs has been lost (e.g. browser data cleared).
 *
 * Returns the state bytes together with the remoteUserId and remoteDeviceId
 * extracted from the envelope so the caller can reconstruct the mapping.
 */
export async function findSessionByLocalDevice(
  sessionId: string,
  localDeviceId: string,
  userId?: string,
): Promise<{ state: Uint8Array; remoteUserId: string; remoteDeviceId: string } | null> {
  const db = await openDB();
  const stored = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(sessionId);
    req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
    req.onerror = () => reject(req.error);
  });

  if (!stored || typeof stored !== "object") {
    return null;
  }

  if (stored.version !== SESSION_STATE_ENVELOPE_VERSION) {
    return null;
  }

  const envelope = decodeSessionStateEnvelope(stored);
  if (!envelope) {
    return null;
  }

  const resolvedUserId = userId || localDeviceId;

  // Only validate userId and localDeviceId — we don't know the remote peer yet
  if (envelope.userId !== resolvedUserId) {
    return null;
  }
  if (envelope.localDeviceId !== localDeviceId) {
    return null;
  }
  if (envelope.sessionId !== sessionId) {
    return null;
  }

  // Extract the remote peer info from the envelope so the caller can
  // reconstruct the localStorage mapping and use it going forward.
  try {
    const stateBytes = extractSessionStateBytes(envelope);
    if (stateBytes.length === 0) {
      return null;
    }
    return {
      state: copyBytes(stateBytes),
      remoteDeviceId: envelope.remoteDeviceId,
      // The envelope stores remoteUserIdHash, not the raw userId.
      // We return the hash as a best-effort identifier — the caller
      // should already know the remoteUserId from the conversation context.
      remoteUserId: "",
    };
  } catch {
    return null;
  }
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

// ── Ratchet aliases (used by the WASM runtime layer) ──────────────

export async function saveRatchetState(
  sessionId: string,
  stateBytes: Uint8Array | string,
  meta: SaveSessionMeta,
): Promise<void> {
  await saveSessionStateBytes(sessionId, stateBytes, meta);
}

export async function getRatchetState(
  sessionId: string,
  localDeviceId: string,
  expectedRemoteUserId: string,
  expectedRemoteDeviceId: string,
  userId?: string,
): Promise<Uint8Array | null> {
  return getSessionStateBytes(sessionId, localDeviceId, expectedRemoteUserId, expectedRemoteDeviceId, userId);
}

export async function deleteRatchetState(sessionId: string): Promise<void> {
  await deleteSessionState(sessionId);
}

export const encodeSessionStateForTransport = (stateBytes: Uint8Array): string => bytesToBase64(stateBytes);
