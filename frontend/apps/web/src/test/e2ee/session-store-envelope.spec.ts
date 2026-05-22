/**
 * Web session-store v3 envelope tests.
 *
 * Uses fake-indexeddb to simulate IndexedDB in jsdom.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteRatchetState,
  deleteSessionState,
  getRatchetState,
  getSessionStateBytes,
  listSessionIds,
  saveRatchetState,
  saveSessionStateBytes,
} from "@/features/e2ee/store/session-store";
import { bytesToBase64, SESSION_STATE_ENVELOPE_VERSION } from "@im/shared-e2ee-core";

const localDeviceId = "web-aaaa-bbbb-cccc-dddd-eeee";
const sessionId = "p_100_200";
const remoteUserId = "bob-456";
const remoteDeviceId = "mobile-ffff-eeee-dddd-cccc-bbbb";
const mockState = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

const defaultMeta = {
  localDeviceId,
  remoteUserId,
  remoteDeviceId,
  userId: "alice-123",
};

describe("Web session-store v3 envelope", () => {
  beforeEach(async () => {
    // Clean up IndexedDB between tests
    const ids = await listSessionIds().catch(() => []);
    for (const id of ids) {
      await deleteSessionState(id).catch(() => undefined);
    }
    localStorage.clear();
  });

  // ── saveSessionStateBytes writes v3 envelope ─────────────────────

  it("saveSessionStateBytes persists a version 3 envelope", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    // Retrieve raw stored data to verify envelope structure
    const { openDB } = await import("fake-indexeddb");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("e2ee_keys", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stored = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const tx = db.transaction("sessions", "readonly");
      const req = tx.objectStore("sessions").get(sessionId);
      req.onsuccess = () => resolve(req.result as Record<string, unknown>);
      req.onerror = () => reject(req.error);
    });

    expect(stored).not.toBeUndefined();
    expect(stored.version).toBe(SESSION_STATE_ENVELOPE_VERSION);
    expect(stored.algorithm).toBe("rust-x25519-x3dh-dr-v1");
    expect(stored.userId).toBe("alice-123");
    expect(stored.localDeviceId).toBe(localDeviceId);
    expect(stored.sessionId).toBe(sessionId);
    expect(stored.remoteDeviceId).toBe(remoteDeviceId);
    expect(stored.remoteUserIdHash).toHaveLength(16);
    expect(stored.remoteUserIdHash).not.toContain(remoteUserId);
  });

  // ── getSessionStateBytes validates context ────────────────────────

  it("getSessionStateBytes returns state when context matches", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
      "alice-123",
    );
    expect(result).not.toBeNull();
    expect(result).toEqual(mockState);
  });

  it("getSessionStateBytes returns null when localDeviceId mismatches", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    const result = await getSessionStateBytes(
      sessionId,
      "wrong-local-device",
      remoteUserId,
      remoteDeviceId,
      "alice-123",
    );
    expect(result).toBeNull();
  });

  it("getSessionStateBytes returns null when sessionId does not exist", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    const result = await getSessionStateBytes(
      "nonexistent-session",
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
      "alice-123",
    );
    expect(result).toBeNull();
  });

  it("getSessionStateBytes returns null when remoteDeviceId mismatches", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      "wrong-remote-device",
      "alice-123",
    );
    expect(result).toBeNull();
  });

  it("getSessionStateBytes returns null when remoteUserIdHash mismatches", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      "wrong-remote-user",
      remoteDeviceId,
      "alice-123",
    );
    expect(result).toBeNull();
  });

  // ── v2 / bare state is rejected ───────────────────────────────────

  it("getSessionStateBytes returns null for raw v2 records (no context, discard)", async () => {
    // Simulate an old v2 record by writing directly to IndexedDB
    const { openDB } = await import("fake-indexeddb");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("e2ee_keys", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put({ version: 2, stateBytes: mockState }, sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
    );
    expect(result).toBeNull();
  });

  // ── clearSession cleanup ──────────────────────────────────────────

  it("clearSession removes the session envelope", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    await deleteSessionState(sessionId);

    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
      "alice-123",
    );
    expect(result).toBeNull();
  });

  it("deleteRatchetState is an alias for deleteSessionState", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);
    await deleteRatchetState(sessionId);

    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
      "alice-123",
    );
    expect(result).toBeNull();
  });

  // ── ratchet aliases ───────────────────────────────────────────────

  it("saveRatchetState and getRatchetState are aliases", async () => {
    await saveRatchetState(sessionId, mockState, defaultMeta);

    const result = await getRatchetState(
      sessionId,
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
      "alice-123",
    );
    expect(result).toEqual(mockState);
  });

  // ── context mismatch does not delete data ─────────────────────────

  it("context mismatch does not delete the stored envelope", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    // Attempt restore with wrong deviceId
    const bad = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      "wrong-device-id",
      "alice-123",
    );
    expect(bad).toBeNull();

    // Valid restore should still work
    const good = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
      "alice-123",
    );
    expect(good).not.toBeNull();
  });

  // ── userId fallback (TODO: enforce user scope) ────────────────────

  it("uses localDeviceId as userId fallback when userId is not provided", async () => {
    // Save without userId — should use localDeviceId as scope approximation
    await saveSessionStateBytes(sessionId, mockState, {
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
      // userId intentionally omitted
    });

    // Retrieval without userId should still work (uses localDeviceId fallback)
    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      remoteDeviceId,
      // userId intentionally omitted
    );
    expect(result).not.toBeNull();
  });

  // ── remoteDeviceId="" 拒绝 ──────────────────────────────────────────

  it("rejects envelope with empty remoteDeviceId during decode", async () => {
    // Directly write a v3 record with empty remoteDeviceId to simulate a
    // legacy bug path where encryptMessage/decryptMessage saved envelopes
    // with remoteDeviceId="".
    const { openDB } = await import("fake-indexeddb");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("e2ee_keys", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put(
        {
          version: 3,
          algorithm: "rust-x25519-x3dh-dr-v1",
          userId: "alice-123",
          localDeviceId,
          sessionId,
          remoteUserIdHash: "0000111122223333",
          remoteDeviceId: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          state: bytesToBase64(mockState),
        },
        sessionId,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      "",
      "alice-123",
    );
    expect(result).toBeNull();
  });

  // ── validateSessionStateEnvelopeContext remoteDeviceId mismatch ────

  it("validateSessionStateEnvelopeContext remoteDeviceId mismatch returns null", async () => {
    await saveSessionStateBytes(sessionId, mockState, defaultMeta);

    // Use a wrong remoteDeviceId — must NOT restore
    const result = await getSessionStateBytes(
      sessionId,
      localDeviceId,
      remoteUserId,
      "wrong-device-id-xyz",
      "alice-123",
    );
    expect(result).toBeNull();
  });
});
