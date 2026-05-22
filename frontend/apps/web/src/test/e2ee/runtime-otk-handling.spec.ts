/**
 * Web E2EE runtime OTK handling tests — verifies that hard-fail behaviour
 * matches Mobile and that the silent fallback has been removed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock WASM — must be at the top before any imports that resolve it
// Use vitest hoisting-safe pattern: vi.mock factory uses bare functions, not vi.fn()
// ---------------------------------------------------------------------------

const wasmCalls: Record<string, unknown[][]> = {};

vi.mock("@im/rust-e2ee-wasm", () => ({
  default: () => Promise.resolve(undefined),
  WasmSessionManager: class {
    create_inbound_session(
      sid: string,
      ik: Uint8Array,
      spk: Uint8Array,
      otk: Uint8Array | null,
      rik: Uint8Array,
      rek: Uint8Array,
    ): void {
      (wasmCalls["create_inbound_session"] ??= []).push([sid, ik, spk, otk, rik, rek]);
    }
    create_outbound_session(): Uint8Array {
      return new Uint8Array(40);
    }
    encrypt(): Uint8Array {
      const wire = new Uint8Array(4 + 52 + 16);
      new DataView(wire.buffer).setUint32(0, 52, false);
      return wire;
    }
    decrypt(): Uint8Array {
      return new Uint8Array([104, 101, 108, 108, 111]);
    }
    export_session(): Uint8Array {
      return new Uint8Array(1);
    }
    restore_session(): void {}
    remove_session(): void {}
    generate_pre_key_bundle(): string {
      return JSON.stringify({
        version: 2,
        identityKeyPairBincode: "AAAB",
        signedPreKeyPairBincode: "AAAC",
        oneTimePreKeyPairs: [],
        publicBundle: {
          identityKey: "AAAD",
          signingKey: "AAAE",
          signedPreKey: { id: 3, key: "AAAF" },
          signedPreKeySignature: "AAAG",
          oneTimePreKeys: [],
        },
      });
    }
  },
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock — hoisting handles the rest)
// ---------------------------------------------------------------------------

import { WebE2eeRuntime } from "@im/shared-e2ee-core/runtime/web";
import {
  classifyE2eeError,
  E2eePolicyError,
} from "@im/shared-e2ee-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeHandshakeBytes = (
  signedPreKeyId: number,
  oneTimePreKeyId: number | null,
): Uint8Array => {
  const bytes = new Uint8Array(40);
  for (let i = 0; i < 32; i++) {
    bytes[i] = i + 1;
  }
  const dv = new DataView(bytes.buffer);
  dv.setUint32(32, signedPreKeyId, false);
  dv.setUint32(36, oneTimePreKeyId ?? 0xffffffff, false);
  return bytes;
};

const b64 = (label: string): string => {
  const encoder = new TextEncoder();
  const raw = encoder.encode(label.padEnd(48, "\0"));
  let binary = "";
  for (let i = 0; i < raw.length; i++) {
    binary += String.fromCharCode(raw[i]);
  }
  return btoa(binary);
};

const makeLocalKeys = () => ({
  version: 2 as const,
  identityKeyPairBincode: b64("identityKeyPairBincode"),
  signedPreKeyPairBincode: b64("signedPreKeyPairBincode"),
  oneTimePreKeyPairs: [
    { id: 7, keyPairBincode: b64("otk-private-7"), publicKey: b64("otk-public-7") },
    { id: 8, keyPairBincode: b64("otk-private-8"), publicKey: b64("otk-public-8") },
  ],
  publicBundle: {
    identityKey: b64("identityKey"),
    signingKey: b64("signingKey"),
    signedPreKey: { id: 3, key: b64("spk") },
    signedPreKeySignature: b64("sig"),
    oneTimePreKeys: [] as { id: number; key: string }[],
  },
});

const lastWasmCall = (method: string): unknown[] | undefined => {
  const calls = wasmCalls[method];
  if (!calls || calls.length === 0) return undefined;
  return calls[calls.length - 1];
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebE2eeRuntime inbound OTK handling", () => {
  let runtime: WebE2eeRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(wasmCalls)) delete wasmCalls[key];
    runtime = new WebE2eeRuntime();
  });

  it("fails with E2EE_ONE_TIME_PREKEY_MISSING when handshake references an OTK but local OTK is missing (no silent fallback)", async () => {
    const localKeys = {
      ...makeLocalKeys(),
      oneTimePreKeyPairs: [],
    };
    const handshake = makeHandshakeBytes(3, 7);

    await expect(
      runtime.createInboundSession({
        sessionId: "alice_bob",
        localKeys,
        remoteIdentityKey: b64("remote-identity"),
        handshake,
      }),
    ).rejects.toThrow("missing one-time pre-key: 7");

    expect(lastWasmCall("create_inbound_session")).toBeUndefined();
  });

  it("fails with E2eePolicyError type carrying the correct code and category", async () => {
    const localKeys = {
      ...makeLocalKeys(),
      oneTimePreKeyPairs: [],
    };
    const handshake = makeHandshakeBytes(3, 7);

    let caught: unknown = null;
    try {
      await runtime.createInboundSession({
        sessionId: "alice_bob",
        localKeys,
        remoteIdentityKey: b64("remote-identity"),
        handshake,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(E2eePolicyError);
    const policyErr = caught as E2eePolicyError;
    expect(policyErr.code).toBe("E2EE_ONE_TIME_PREKEY_MISSING");
    expect(policyErr.category).toBe("protocol");
  });

  it("error is classified as protocol/not retryable by classifyE2eeError (message-based)", () => {
    const error = new Error(
      "Rust E2EE handshake references missing one-time pre-key: 7",
    );
    const classification = classifyE2eeError(error);
    expect(classification.code).toBe("E2EE_ONE_TIME_PREKEY_MISSING");
    expect(classification.category).toBe("protocol");
    expect(classification.retryable).toBe(false);
    expect(classification.safeMessage).toBe("加密会话状态不完整，请重新协商");
  });

  it("allows signed-pre-key-only fallback when handshake has no OTK (null oneTimePreKeyId)", async () => {
    const localKeys = {
      ...makeLocalKeys(),
      oneTimePreKeyPairs: [],
    };
    const handshake = makeHandshakeBytes(3, null);

    await expect(
      runtime.createInboundSession({
        sessionId: "alice_bob",
        localKeys,
        remoteIdentityKey: b64("remote-identity"),
        handshake,
      }),
    ).resolves.toBeUndefined();

    const call = lastWasmCall("create_inbound_session") as unknown[];
    expect(call).toBeDefined();
    expect(call![3]).toBeNull(); // OTK pair should be null
  });

  it("passes the matching one-time pre-key pair when the handshake references an available OTK", async () => {
    const localKeys = makeLocalKeys();
    const handshake = makeHandshakeBytes(3, 7);

    await expect(
      runtime.createInboundSession({
        sessionId: "alice_bob",
        localKeys,
        remoteIdentityKey: b64("remote-identity"),
        handshake,
      }),
    ).resolves.toBeUndefined();

    const call = lastWasmCall("create_inbound_session") as unknown[];
    expect(call).toBeDefined();
    expect(call![3]).not.toBeNull(); // OTK pair present
  });

  it("does not create infinite pending — error is thrown before any WASM call succeeds", async () => {
    const localKeys = {
      ...makeLocalKeys(),
      oneTimePreKeyPairs: [],
    };
    const handshake = makeHandshakeBytes(3, 7);

    await expect(
      runtime.createInboundSession({
        sessionId: "alice_bob",
        localKeys,
        remoteIdentityKey: b64("remote-identity"),
        handshake,
      }),
    ).rejects.toThrow();

    expect(lastWasmCall("create_inbound_session")).toBeUndefined();
  });

  it("rejects invalid-length handshake early (before OTK lookup)", async () => {
    const localKeys = makeLocalKeys();

    await expect(
      runtime.createInboundSession({
        sessionId: "alice_bob",
        localKeys,
        remoteIdentityKey: b64("remote-identity"),
        handshake: new Uint8Array(20),
      }),
    ).rejects.toThrow("handshake length");
  });
});
