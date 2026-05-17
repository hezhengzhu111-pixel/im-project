import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  generateKeyBundle,
  p256Ecdh,
  ratchetDecrypt,
  ratchetEncrypt,
  sanitizeE2eeLogValue,
  initReceivingChain,
  initSendingChain,
  E2eePolicyError,
  assertNoPlaintextDowngrade,
  classifyE2eeError,
  ecdsaSignP1363,
  isEncryptedValue,
  validateP256PublicKeyBase64,
  x3dhInitiate,
  x3dhRespond,
  type E2eeSessionStatus,
} from "../index";

const toBase64Url = (bytes: Uint8Array): string =>
  bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const ecdhPrivateJwk = (privateKeyBase64: string, publicKeyBase64: string): JsonWebKey => {
  const privateKey = base64ToBytes(privateKeyBase64);
  const publicKey = base64ToBytes(publicKeyBase64);
  return {
    kty: "EC",
    crv: "P-256",
    d: toBase64Url(privateKey),
    x: toBase64Url(publicKey.subarray(1, 33)),
    y: toBase64Url(publicKey.subarray(33, 65)),
    ext: true,
  };
};

describe("shared-e2ee-core", () => {
  it("exports the shared E2EE session status type", () => {
    const status: E2eeSessionStatus = "encrypted";
    expect(status).toBe("encrypted");
  });

  it("classifies known E2EE errors without leaking raw details", () => {
    expect(classifyE2eeError(new Error("No ratchet state for session private_1_2"))).toMatchObject({
      code: "NO_RATCHET_STATE",
      category: "state",
      retryable: true,
    });
    expect(classifyE2eeError("E2EE negotiation has not been accepted")).toMatchObject({
      code: "NEGOTIATION_NOT_ACCEPTED",
      category: "negotiation",
    });
    expect(classifyE2eeError(new E2eePolicyError(
      "Plaintext downgrade blocked",
      "PLAINTEXT_DOWNGRADE_BLOCKED",
      "policy",
    ))).toMatchObject({
      code: "PLAINTEXT_DOWNGRADE_BLOCKED",
      category: "policy",
    });
  });

  it("normalizes encrypted markers", () => {
    expect(isEncryptedValue(true)).toBe(true);
    expect(isEncryptedValue(1)).toBe(true);
    expect(isEncryptedValue("1")).toBe(true);
    expect(isEncryptedValue("true")).toBe(true);
    expect(isEncryptedValue(false)).toBe(false);
    expect(isEncryptedValue(0)).toBe(false);
    expect(isEncryptedValue("0")).toBe(false);
  });

  it("blocks plaintext downgrade for protected states and markers", () => {
    expect(() => assertNoPlaintextDowngrade({
      attemptedPlaintext: true,
      sessionStatus: "negotiating",
    })).toThrow(E2eePolicyError);
    expect(() => assertNoPlaintextDowngrade({
      attemptedPlaintext: true,
      messageEncrypted: 1,
    })).toThrow(E2eePolicyError);
    expect(() => assertNoPlaintextDowngrade({
      attemptedPlaintext: true,
      sessionStatus: "plaintext",
      messageEncrypted: false,
    })).not.toThrow();
    expect(() => assertNoPlaintextDowngrade({
      attemptedPlaintext: false,
      sessionStatus: "encrypted",
    })).not.toThrow();
  });

  it("redacts E2EE-sensitive log fields recursively", () => {
    const result = sanitizeE2eeLogValue({
      sessionId: "private_1_2",
      content: "hello",
      e2eeHeader: "{\"counter\":1}",
      nested: {
        rootKey: "secret",
        counter: 3,
      },
      list: [{ mediaKey: "secret" }],
    });

    expect(result).toEqual({
      sessionId: "private_1_2",
      content: "[REDACTED:E2EE]",
      e2eeHeader: "[REDACTED:E2EE]",
      nested: {
        rootKey: "[REDACTED:E2EE]",
        counter: 3,
      },
      list: [{ mediaKey: "[REDACTED:E2EE]" }],
    });
  });

  it("exports WebCrypto-compatible P-256 public keys and P1363 ECDSA signatures", async () => {
    const local = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const identityPublic = base64ToBytes(local.bundle.identityKey);
    const signature = ecdsaSignP1363(
      local.signingIdentityKeyPair.privateKey,
      base64ToBytes(local.bundle.signedPreKey),
    );

    expect(identityPublic).toHaveLength(65);
    expect(identityPublic[0]).toBe(0x04);
    validateP256PublicKeyBase64(local.bundle.identityKey);
    expect(base64ToBytes(signature)).toHaveLength(64);

    const verifyKey = await crypto.subtle.importKey(
      "raw",
      base64ToBytes(local.bundle.signingIdentityKey),
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"],
    );
    await expect(crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      base64ToBytes(signature),
      base64ToBytes(local.bundle.signedPreKey),
    )).resolves.toBe(true);
  });

  it("uses the same ECDH x-coordinate output as WebCrypto deriveBits", async () => {
    const alice = generateKeyBundle({ oneTimePreKeyCount: 0 }).identityKeyPair;
    const bob = generateKeyBundle({ oneTimePreKeyCount: 0 }).identityKeyPair;
    const nobleSecret = p256Ecdh(alice.privateKey, bob.publicKey);
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      ecdhPrivateJwk(alice.privateKey, alice.publicKey),
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    const publicKey = await crypto.subtle.importKey(
      "raw",
      base64ToBytes(bob.publicKey),
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    );
    const webSecret = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "ECDH", public: publicKey },
      privateKey,
      256,
    ));

    expect(bytesToBase64(nobleSecret)).toBe(bytesToBase64(webSecret));
  });

  it("derives the same SPK-only X3DH root key for both directions", () => {
    const alice = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const bob = generateKeyBundle({ oneTimePreKeyCount: 0 });

    const aliceInitiated = x3dhInitiate(alice.identityKeyPair, bob.bundle);
    const bobResponded = x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      null,
      alice.bundle.identityKey,
      aliceInitiated.ephemeralPublicKey,
    );
    expect(aliceInitiated.rootKey).toBe(bobResponded);

    const bobInitiated = x3dhInitiate(bob.identityKeyPair, alice.bundle);
    const aliceResponded = x3dhRespond(
      alice.identityKeyPair,
      alice.signedPreKeyPair,
      null,
      bob.bundle.identityKey,
      bobInitiated.ephemeralPublicKey,
    );
    expect(bobInitiated.rootKey).toBe(aliceResponded);
  });

  it("encrypts and decrypts text with the Web-compatible ratchet header AAD", () => {
    const alice = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const bob = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const handshake = x3dhInitiate(alice.identityKeyPair, bob.bundle);
    const bobRoot = x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      null,
      alice.bundle.identityKey,
      handshake.ephemeralPublicKey,
    );
    const aliceState = initSendingChain(handshake.rootKey, alice.identityKeyPair);
    const bobState = initReceivingChain(bobRoot, bob.identityKeyPair);

    const encrypted = ratchetEncrypt(aliceState, "hello secure mobile");
    expect(encrypted.ciphertext).not.toContain("hello secure mobile");
    expect(JSON.stringify(encrypted.header)).toContain("ratchetPublicKey");
    expect(ratchetDecrypt(bobState, encrypted.header, encrypted.ciphertext)).toBe("hello secure mobile");
  });

  it("rejects tampered AAD and duplicate message replay", () => {
    const alice = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const bob = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const handshake = x3dhInitiate(alice.identityKeyPair, bob.bundle);
    const bobRoot = x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      null,
      alice.bundle.identityKey,
      handshake.ephemeralPublicKey,
    );
    const encrypted = ratchetEncrypt(initSendingChain(handshake.rootKey), "aad bound");

    expect(() => ratchetDecrypt(
      initReceivingChain(bobRoot),
      { ...encrypted.header, previousCounter: encrypted.header.previousCounter + 1 },
      encrypted.ciphertext,
    )).toThrow();

    const bobState = initReceivingChain(bobRoot);
    expect(ratchetDecrypt(bobState, encrypted.header, encrypted.ciphertext)).toBe("aad bound");
    expect(() => ratchetDecrypt(bobState, encrypted.header, encrypted.ciphertext)).toThrow(/duplicate or expired/i);
  });

  it("decrypts bounded out-of-order messages with skipped keys", () => {
    const alice = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const bob = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const handshake = x3dhInitiate(alice.identityKeyPair, bob.bundle);
    const bobRoot = x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      null,
      alice.bundle.identityKey,
      handshake.ephemeralPublicKey,
    );
    const aliceState = initSendingChain(handshake.rootKey);
    const bobState = initReceivingChain(bobRoot);
    const m0 = ratchetEncrypt(aliceState, "first");
    const m1 = ratchetEncrypt(aliceState, "second");
    const m2 = ratchetEncrypt(aliceState, "third");

    expect(ratchetDecrypt(bobState, m2.header, m2.ciphertext)).toBe("third");
    expect(ratchetDecrypt(bobState, m0.header, m0.ciphertext)).toBe("first");
    expect(ratchetDecrypt(bobState, m1.header, m1.ciphertext)).toBe("second");
  });

  it("rejects excessive counter gaps before consuming resources", () => {
    const alice = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const bob = generateKeyBundle({ oneTimePreKeyCount: 0 });
    const handshake = x3dhInitiate(alice.identityKeyPair, bob.bundle);
    const bobRoot = x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      null,
      alice.bundle.identityKey,
      handshake.ephemeralPublicKey,
    );
    const encrypted = ratchetEncrypt(initSendingChain(handshake.rootKey), "gap");
    expect(() => ratchetDecrypt(
      initReceivingChain(bobRoot),
      { ...encrypted.header, counter: 2001 },
      encrypted.ciphertext,
      { maxCounterGap: 2000 },
    )).toThrow(/counter gap/i);
  });
});
