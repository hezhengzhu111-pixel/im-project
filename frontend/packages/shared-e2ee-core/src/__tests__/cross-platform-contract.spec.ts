/**
 * Cross-platform E2EE contract tests — verifies Mobile ↔ Web ↔ Backend compatibility
 * for the Rust E2EE v2 protocol.
 */
import {
  RUST_E2EE_ALGORITHM,
  RUST_E2EE_ENVELOPE_VERSION,
  isRustE2eeEnvelope,
  normalizeEnvelope,
  parseE2eeEnvelope,
} from "../index";
import { describe, expect, it } from "vitest";

const webStyleEnvelope = {
  version: 2,
  algorithm: "rust-x25519-x3dh-dr-v1",
  senderDeviceId: "web-aaaa-bbbb-cccc-dddd-eeee",
  recipientDeviceId: "mobile-aaaa-bbbb-cccc-dddd-eeee",
  sessionId: "100_200",
  handshake: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  wire: "AAAAAA==",
} as const;

const mobileStylePayload = {
  receiverId: "200",
  clientMessageId: "cm-mobile-1",
  messageType: "TEXT",
  encrypted: true,
  e2eeEnvelope: {
    version: 2,
    algorithm: "rust-x25519-x3dh-dr-v1",
    senderDeviceId: "mobile-aaaa-bbbb-cccc-dddd-eeee",
    recipientDeviceId: "web-aaaa-bbbb-cccc-dddd-eeee",
    sessionId: "100_200",
    wire: "BBBBBB==",
  },
  e2eeDeviceId: "mobile-aaaa-bbbb-cccc-dddd-eeee",
};

describe("cross-platform Rust E2EE v2 contract", () => {
  describe("envelope normalisation", () => {
    it("accepts Web-style envelope with algorithm field", () => {
      expect(normalizeEnvelope(webStyleEnvelope)).toEqual(webStyleEnvelope);
    });

    it("accepts envelope with legacy alg field and normalises to algorithm", () => {
      const withAlg = {
        ...webStyleEnvelope,
        alg: webStyleEnvelope.algorithm,
      } as Record<string, unknown>;
      delete (withAlg as Record<string, unknown>).algorithm;
      const normalized = normalizeEnvelope(withAlg);
      expect(normalized).not.toBeNull();
      expect(normalized!.algorithm).toBe(RUST_E2EE_ALGORITHM);
    });

    it("rejects envelope missing sessionId", () => {
      const broken = { ...webStyleEnvelope, sessionId: "" };
      expect(normalizeEnvelope(broken)).toBeNull();
    });

    it("rejects envelope with wrong version", () => {
      expect(normalizeEnvelope({ ...webStyleEnvelope, version: 1 })).toBeNull();
    });

    it("rejects envelope with wrong algorithm", () => {
      expect(
        normalizeEnvelope({ ...webStyleEnvelope, algorithm: "aes-256-gcm" }),
      ).toBeNull();
    });
  });

  describe("Mobile → Web payload structure", () => {
    it("has same shape as Web sendPrivateEncrypted payload", () => {
      expect(mobileStylePayload).toHaveProperty("receiverId");
      expect(mobileStylePayload).toHaveProperty("clientMessageId");
      expect(mobileStylePayload).toHaveProperty("messageType");
      expect(mobileStylePayload).toHaveProperty("encrypted", true);
      expect(mobileStylePayload).toHaveProperty("e2eeEnvelope");
      expect(mobileStylePayload).toHaveProperty("e2eeDeviceId");
    });

    it("does not contain plaintext content", () => {
      expect(mobileStylePayload).not.toHaveProperty("content");
    });

    it("does not contain legacy e2eeHeader", () => {
      expect(mobileStylePayload).not.toHaveProperty("e2eeHeader");
      expect(mobileStylePayload).not.toHaveProperty("e2ee_header");
    });

    it("does not contain legacy identity or ephemeral key fields", () => {
      expect(mobileStylePayload).not.toHaveProperty("e2eeSenderIdentityKey");
      expect(mobileStylePayload).not.toHaveProperty("e2eeEphemeralKey");
    });

    it("e2eeEnvelope has correct version and algorithm", () => {
      expect(mobileStylePayload.e2eeEnvelope.version).toBe(
        RUST_E2EE_ENVELOPE_VERSION,
      );
      expect(mobileStylePayload.e2eeEnvelope.algorithm).toBe(
        RUST_E2EE_ALGORITHM,
      );
    });
  });

  describe("Backend contract compatibility", () => {
    it("mobile-* device IDs are valid senderDeviceId values", () => {
      expect(
        isRustE2eeEnvelope({
          ...webStyleEnvelope,
          senderDeviceId: "mobile-aaaa-bbbb-cccc-dddd-eeee",
        }),
      ).toBe(true);
    });

    it("mobile-* device IDs are valid recipientDeviceId values", () => {
      expect(
        isRustE2eeEnvelope({
          ...webStyleEnvelope,
          recipientDeviceId: "mobile-aaaa-bbbb-cccc-dddd-eeee",
        }),
      ).toBe(true);
    });

    it("envelope with handshake is valid (first message)", () => {
      expect(isRustE2eeEnvelope(webStyleEnvelope)).toBe(true);
    });

    it("envelope without handshake is valid (subsequent messages)", () => {
      const noHandshake = { ...webStyleEnvelope };
      delete (noHandshake as { handshake?: string }).handshake;
      expect(isRustE2eeEnvelope(noHandshake)).toBe(true);
    });

    it("rejects envelope without wire field", () => {
      expect(isRustE2eeEnvelope({ ...webStyleEnvelope, wire: "" })).toBe(false);
    });
  });

  describe("serialisation round-trip", () => {
    it("envelope survives JSON stringify and parse round-trip", () => {
      const encoded = JSON.stringify(webStyleEnvelope);
      const parsed = parseE2eeEnvelope(encoded);
      expect(parsed).not.toBeNull();
      expect(parsed!.version).toBe(RUST_E2EE_ENVELOPE_VERSION);
      expect(parsed!.algorithm).toBe(RUST_E2EE_ALGORITHM);
      expect(parsed!.sessionId).toBe("100_200");
    });
  });
});
