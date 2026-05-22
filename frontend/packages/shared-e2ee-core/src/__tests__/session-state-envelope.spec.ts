import {
  SESSION_STATE_ENVELOPE_VERSION,
  SESSION_STATE_ALGORITHM,
  SessionStateContextMismatchError,
  decodeSessionStateEnvelope,
  encodeSessionStateEnvelope,
  extractSessionStateBytes,
  serializeSessionStateEnvelope,
  validateSessionStateEnvelopeContext,
  type SessionStateEnvelope,
  type SessionStateEnvelopeContext,
} from "../session-state-envelope";
import { bytesToBase64 } from "../bytes";
import { describe, expect, it } from "vitest";

const mockContext: SessionStateEnvelopeContext = {
  userId: "user-alice-123",
  localDeviceId: "web-aaaa-bbbb-cccc-dddd-eeee",
  sessionId: "p_100_200",
  remoteUserId: "user-bob-456",
  remoteDeviceId: "mobile-ffff-eeee-dddd-cccc-bbbb",
};

const mockState = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

describe("SessionStateEnvelope", () => {
  // ── encode / decode round-trip ─────────────────────────────────────

  it("encodes and decodes a valid envelope (round-trip)", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    expect(envelope.version).toBe(SESSION_STATE_ENVELOPE_VERSION);
    expect(envelope.algorithm).toBe(SESSION_STATE_ALGORITHM);
    expect(envelope.userId).toBe(mockContext.userId);
    expect(envelope.localDeviceId).toBe(mockContext.localDeviceId);
    expect(envelope.sessionId).toBe(mockContext.sessionId);
    expect(envelope.remoteDeviceId).toBe(mockContext.remoteDeviceId);
    expect(envelope.remoteUserIdHash).toHaveLength(16);
    expect(envelope.state).toBe(bytesToBase64(mockState));
    expect(envelope.createdAt).toBeGreaterThan(0);
    expect(envelope.updatedAt).toBe(envelope.createdAt);

    const serialized = serializeSessionStateEnvelope(envelope);
    const parsed = JSON.parse(serialized);
    const decoded = decodeSessionStateEnvelope(parsed);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(mockContext.userId);
    expect(decoded!.localDeviceId).toBe(mockContext.localDeviceId);
    expect(decoded!.sessionId).toBe(mockContext.sessionId);
    expect(decoded!.remoteDeviceId).toBe(mockContext.remoteDeviceId);
    expect(decoded!.remoteUserIdHash).toBe(envelope.remoteUserIdHash);
    expect(extractSessionStateBytes(decoded!)).toEqual(mockState);
  });

  // ── context validation ─────────────────────────────────────────────

  it("validateSessionStateEnvelopeContext passes when all fields match", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    const result = await validateSessionStateEnvelopeContext(envelope, mockContext);
    expect(result).toBe(true);
  });

  it("validateSessionStateEnvelopeContext fails on userId mismatch", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    await expect(
      validateSessionStateEnvelopeContext(envelope, {
        ...mockContext,
        userId: "user-eve-999",
      }),
    ).rejects.toThrow(SessionStateContextMismatchError);
  });

  it("validateSessionStateEnvelopeContext fails on localDeviceId mismatch", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    await expect(
      validateSessionStateEnvelopeContext(envelope, {
        ...mockContext,
        localDeviceId: "wrong-device-id",
      }),
    ).rejects.toThrow(SessionStateContextMismatchError);
  });

  it("validateSessionStateEnvelopeContext fails on sessionId mismatch", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    await expect(
      validateSessionStateEnvelopeContext(envelope, {
        ...mockContext,
        sessionId: "wrong-session",
      }),
    ).rejects.toThrow(SessionStateContextMismatchError);
  });

  it("validateSessionStateEnvelopeContext fails on remoteDeviceId mismatch", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    await expect(
      validateSessionStateEnvelopeContext(envelope, {
        ...mockContext,
        remoteDeviceId: "wrong-remote-device",
      }),
    ).rejects.toThrow(SessionStateContextMismatchError);
  });

  it("validateSessionStateEnvelopeContext fails on remoteUserId mismatch (hash)", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    await expect(
      validateSessionStateEnvelopeContext(envelope, {
        ...mockContext,
        remoteUserId: "user-mallory-000",
      }),
    ).rejects.toThrow(SessionStateContextMismatchError);
  });

  it("SessionStateContextMismatchError lists mismatched fields", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    let caught: SessionStateContextMismatchError | null = null;
    try {
      await validateSessionStateEnvelopeContext(envelope, {
        ...mockContext,
        userId: "wrong-user",
        sessionId: "wrong-session",
      });
    } catch (error) {
      caught = error as SessionStateContextMismatchError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.code).toBe("E2EE_SESSION_STATE_CONTEXT_MISMATCH");
    expect(caught!.mismatchedFields).toContain("userId");
    expect(caught!.mismatchedFields).toContain("sessionId");
    expect(caught!.mismatchedFields).not.toContain("localDeviceId");
  });

  // ── decode rejects invalid data ────────────────────────────────────

  it("decodeSessionStateEnvelope returns null for null/undefined", () => {
    expect(decodeSessionStateEnvelope(null)).toBeNull();
    expect(decodeSessionStateEnvelope(undefined)).toBeNull();
  });

  it("decodeSessionStateEnvelope returns null for non-object", () => {
    expect(decodeSessionStateEnvelope("string")).toBeNull();
    expect(decodeSessionStateEnvelope(42)).toBeNull();
  });

  it("decodeSessionStateEnvelope returns null for wrong version", () => {
    expect(decodeSessionStateEnvelope({ version: 2, algorithm: SESSION_STATE_ALGORITHM })).toBeNull();
    expect(decodeSessionStateEnvelope({ version: 1 })).toBeNull();
  });

  it("decodeSessionStateEnvelope returns null for wrong algorithm", () => {
    expect(
      decodeSessionStateEnvelope({
        version: 3,
        algorithm: "wrong-algo",
        userId: "u",
        localDeviceId: "d",
        sessionId: "s",
        remoteUserIdHash: "a1b2c3d4e5f6a7b8",
        remoteDeviceId: "rd",
        createdAt: 1,
        updatedAt: 1,
        state: "AA==",
      }),
    ).toBeNull();
  });

  it("decodeSessionStateEnvelope returns null when required field is missing", () => {
    const valid: SessionStateEnvelope = {
      version: SESSION_STATE_ENVELOPE_VERSION,
      algorithm: SESSION_STATE_ALGORITHM,
      userId: "u",
      localDeviceId: "d",
      sessionId: "s",
      remoteUserIdHash: "a1b2c3d4e5f6a7b8",
      remoteDeviceId: "rd",
      createdAt: 1,
      updatedAt: 1,
      state: "AA==",
    };

    const requiredFields = ["userId", "localDeviceId", "sessionId", "remoteUserIdHash", "remoteDeviceId", "state"] as const;
    for (const field of requiredFields) {
      const broken = { ...valid, [field]: "" };
      expect(decodeSessionStateEnvelope(broken)).toBeNull();
    }
  });

  it("decodeSessionStateEnvelope returns null when createdAt/updatedAt are not numbers", () => {
    expect(
      decodeSessionStateEnvelope({
        version: 3,
        algorithm: SESSION_STATE_ALGORITHM,
        userId: "u",
        localDeviceId: "d",
        sessionId: "s",
        remoteUserIdHash: "a1b2c3d4e5f6a7b8",
        remoteDeviceId: "rd",
        createdAt: "not-a-number",
        updatedAt: 1,
        state: "AA==",
      }),
    ).toBeNull();
  });

  it("decodeSessionStateEnvelope returns null for invalid direction", () => {
    expect(
      decodeSessionStateEnvelope({
        version: 3,
        algorithm: SESSION_STATE_ALGORITHM,
        userId: "u",
        localDeviceId: "d",
        sessionId: "s",
        remoteUserIdHash: "a1b2c3d4e5f6a7b8",
        remoteDeviceId: "rd",
        createdAt: 1,
        updatedAt: 1,
        state: "AA==",
        direction: "sideways",
      }),
    ).toBeNull();
  });

  it("decodeSessionStateEnvelope accepts valid direction values", () => {
    const base = {
      version: 3 as const,
      algorithm: SESSION_STATE_ALGORITHM,
      userId: "u",
      localDeviceId: "d",
      sessionId: "s",
      remoteUserIdHash: "a1b2c3d4e5f6a7b8",
      remoteDeviceId: "rd",
      createdAt: 1,
      updatedAt: 1,
      state: "AA==",
    };

    expect(decodeSessionStateEnvelope({ ...base, direction: "outbound" })).not.toBeNull();
    expect(decodeSessionStateEnvelope({ ...base, direction: "inbound" })).not.toBeNull();
    expect(decodeSessionStateEnvelope({ ...base, direction: "established" })).not.toBeNull();
    expect(decodeSessionStateEnvelope(base)).not.toBeNull(); // no direction is fine
  });

  // ── fingerprint / hash does NOT leak raw input ─────────────────────

  it("remoteUserIdHash does not contain the plaintext remoteUserId", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    expect(envelope.remoteUserIdHash).not.toContain(mockContext.remoteUserId);
    expect(envelope.remoteUserIdHash).not.toContain("user-bob");
  });

  it("remoteUserIdHash differs for different userIds", async () => {
    const e1 = await encodeSessionStateEnvelope(mockState, mockContext);
    const e2 = await encodeSessionStateEnvelope(mockState, {
      ...mockContext,
      remoteUserId: "user-charlie-789",
    });
    expect(e1.remoteUserIdHash).not.toBe(e2.remoteUserIdHash);
  });

  it("remoteUserIdHash is deterministic", async () => {
    const e1 = await encodeSessionStateEnvelope(mockState, mockContext);
    const e2 = await encodeSessionStateEnvelope(mockState, mockContext);
    expect(e1.remoteUserIdHash).toBe(e2.remoteUserIdHash);
  });

  // ── identity key fingerprints ──────────────────────────────────────

  it("includes local and remote identity key fingerprints when provided", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext, {
      localIdentityKey: "local-ik-b64",
      remoteIdentityKey: "remote-ik-b64",
    });
    expect(envelope.localIdentityKeyFingerprint).toHaveLength(16);
    expect(envelope.remoteIdentityKeyFingerprint).toHaveLength(16);
    expect(envelope.localIdentityKeyFingerprint).not.toBe(envelope.remoteIdentityKeyFingerprint);
  });

  it("identity key fingerprints are deterministic", async () => {
    const e1 = await encodeSessionStateEnvelope(mockState, mockContext, {
      localIdentityKey: "some-key",
    });
    const e2 = await encodeSessionStateEnvelope(mockState, mockContext, {
      localIdentityKey: "some-key",
    });
    expect(e1.localIdentityKeyFingerprint).toBe(e2.localIdentityKeyFingerprint);
  });

  it("identity key fingerprint does not contain raw key", async () => {
    const ikBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv";
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext, {
      localIdentityKey: ikBase64,
    });
    expect(envelope.localIdentityKeyFingerprint).not.toContain(ikBase64);
    expect(envelope.localIdentityKeyFingerprint).not.toContain("ABCD");
  });

  // ── direction ──────────────────────────────────────────────────────

  it("direction defaults to undefined when not provided", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext);
    expect(envelope.direction).toBeUndefined();
  });

  it("direction is set when provided", async () => {
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext, {
      direction: "outbound",
    });
    expect(envelope.direction).toBe("outbound");
  });

  // ── updatedAt ──────────────────────────────────────────────────────

  it("createdAt and updatedAt are set to the provided timestamp", async () => {
    const ts = 1700000000000;
    const envelope = await encodeSessionStateEnvelope(mockState, mockContext, { createdAt: ts });
    expect(envelope.createdAt).toBe(ts);
    expect(envelope.updatedAt).toBe(ts);
  });

  // ── state extraction ───────────────────────────────────────────────

  it("extractSessionStateBytes returns the raw state bytes", async () => {
    const state = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const envelope = await encodeSessionStateEnvelope(state, mockContext);
    expect(extractSessionStateBytes(envelope)).toEqual(state);
  });

  // ── serialization ──────────────────────────────────────────────────

  it("serializeSessionStateEnvelope produces valid JSON", () => {
    const envelope: SessionStateEnvelope = {
      version: SESSION_STATE_ENVELOPE_VERSION,
      algorithm: SESSION_STATE_ALGORITHM,
      userId: "u",
      localDeviceId: "d",
      sessionId: "s",
      remoteUserIdHash: "a1b2c3d4e5f6a7b8",
      remoteDeviceId: "rd",
      createdAt: 1,
      updatedAt: 1,
      state: "AA==",
    };
    const json = serializeSessionStateEnvelope(envelope);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(3);
  });

  // ── encode rejects empty required fields ──────────────────────────

  it("encodeSessionStateEnvelope throws when userId is empty", async () => {
    await expect(
      encodeSessionStateEnvelope(mockState, { ...mockContext, userId: "" }),
    ).rejects.toThrow("SessionStateEnvelope requires userId");
  });

  it("encodeSessionStateEnvelope throws when localDeviceId is empty", async () => {
    await expect(
      encodeSessionStateEnvelope(mockState, { ...mockContext, localDeviceId: "" }),
    ).rejects.toThrow("SessionStateEnvelope requires localDeviceId");
  });

  it("encodeSessionStateEnvelope throws when sessionId is empty", async () => {
    await expect(
      encodeSessionStateEnvelope(mockState, { ...mockContext, sessionId: "" }),
    ).rejects.toThrow("SessionStateEnvelope requires sessionId");
  });

  it("encodeSessionStateEnvelope throws when remoteUserId is empty", async () => {
    await expect(
      encodeSessionStateEnvelope(mockState, { ...mockContext, remoteUserId: "" }),
    ).rejects.toThrow("SessionStateEnvelope requires remoteUserId");
  });

  it("encodeSessionStateEnvelope throws when remoteDeviceId is empty", async () => {
    await expect(
      encodeSessionStateEnvelope(mockState, { ...mockContext, remoteDeviceId: "" }),
    ).rejects.toThrow("SessionStateEnvelope requires remoteDeviceId");
  });

  // ── decode continues to reject empty remoteDeviceId ────────────────

  it("decodeSessionStateEnvelope returns null when remoteDeviceId is empty", () => {
    const record = {
      version: 3,
      algorithm: SESSION_STATE_ALGORITHM,
      userId: "u",
      localDeviceId: "d",
      sessionId: "s",
      remoteUserIdHash: "a1b2c3d4e5f6a7b8",
      remoteDeviceId: "",
      createdAt: 1,
      updatedAt: 1,
      state: "AA==",
    };
    expect(decodeSessionStateEnvelope(record)).toBeNull();
  });

  it("decodeSessionStateEnvelope returns null when remoteUserIdHash is empty", () => {
    const record = {
      version: 3,
      algorithm: SESSION_STATE_ALGORITHM,
      userId: "u",
      localDeviceId: "d",
      sessionId: "s",
      remoteUserIdHash: "",
      remoteDeviceId: "rd",
      createdAt: 1,
      updatedAt: 1,
      state: "AA==",
    };
    expect(decodeSessionStateEnvelope(record)).toBeNull();
  });

});
