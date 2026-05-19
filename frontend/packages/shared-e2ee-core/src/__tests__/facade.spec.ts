import {
  OLD_E2EE_UNREADABLE_TEXT,
  RUST_E2EE_ALGORITHM,
  RUST_E2EE_ENVELOPE_VERSION,
  assertRustWireFormat,
  base64ToBytes,
  bytesToBase64,
  createE2eeEnvelope,
  isRustE2eeEnvelope,
  parseE2eeEnvelope,
  parseRustHandshake,
} from "../index";
import { describe, expect, it } from "vitest";

describe("shared-e2ee-core rust-only facade", () => {
  it("encodes and parses version 2 rust envelopes", () => {
    const wire = new Uint8Array(4 + 52 + 16);
    wire.set([0, 0, 0, 52], 0);
    wire.fill(1, 4);

    const envelope = createE2eeEnvelope({
      senderDeviceId: "web-a",
      recipientDeviceId: "web-b",
      sessionId: "p_1_2",
      handshake: new Uint8Array(40),
      wire,
    });

    expect(envelope.version).toBe(RUST_E2EE_ENVELOPE_VERSION);
    expect(envelope.algorithm).toBe(RUST_E2EE_ALGORITHM);
    expect(isRustE2eeEnvelope(envelope)).toBe(true);
    expect(parseE2eeEnvelope(JSON.stringify(envelope))).toEqual(envelope);
    expect(base64ToBytes(envelope.wire)).toEqual(wire);
  });

  it("rejects old p256 style envelopes without fallback", () => {
    const oldEnvelope = {
      version: 1,
      alg: "AES-256-GCM",
      iv: "AAAAAAAAAAAAAAAA",
      ciphertext: "AA==",
    };

    expect(isRustE2eeEnvelope(oldEnvelope)).toBe(false);
    expect(parseE2eeEnvelope(JSON.stringify(oldEnvelope))).toBeNull();
    expect(OLD_E2EE_UNREADABLE_TEXT).toContain("旧加密消息不可解密");
  });

  it("validates rust wire header length", () => {
    const wire = new Uint8Array(4 + 52 + 16);
    wire.set([0, 0, 0, 52], 0);
    expect(() => assertRustWireFormat(wire)).not.toThrow();

    wire[3] = 51;
    expect(() => assertRustWireFormat(wire)).toThrow("header length");
  });

  it("parses rust x3dh handshake metadata", () => {
    const handshake = new Uint8Array(40);
    handshake.fill(7, 0, 32);
    handshake.set([0, 0, 0, 1], 32);
    handshake.set([0, 0, 0, 9], 36);

    const parsed = parseRustHandshake(handshake);
    expect(parsed.signedPreKeyId).toBe(1);
    expect(parsed.oneTimePreKeyId).toBe(9);
    expect(bytesToBase64(parsed.ephemeralPublicKey)).toBe(bytesToBase64(handshake.slice(0, 32)));
  });
});
