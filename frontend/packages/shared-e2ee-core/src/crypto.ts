import { gcm } from "@noble/ciphers/aes.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  base64ToBytes,
  bytesToBase64,
  concatBytes,
  copyBytes,
  secureRandomBytes,
  utf8ToBytes,
} from "./bytes";
import type { EncodedEcdhKeyPair, EncodedEcdsaKeyPair } from "./types";

const P256_PUBLIC_KEY_LENGTH = 65;
const P256_PRIVATE_KEY_LENGTH = 32;
const P256_SIGNATURE_LENGTH = 64;
const AES_256_KEY_LENGTH = 32;
const AES_GCM_IV_LENGTH = 12;
const AES_GCM_TAG_LENGTH = 16;

export const assertP256PublicKeyBytes = (bytes: Uint8Array, label = "P-256 public key"): void => {
  if (bytes.byteLength !== P256_PUBLIC_KEY_LENGTH || bytes[0] !== 0x04) {
    throw new Error(`${label} must be a 65-byte uncompressed point`);
  }
  if (!p256.utils.isValidPublicKey(bytes, false)) {
    throw new Error(`${label} is invalid`);
  }
};

export const assertP1363SignatureBytes = (bytes: Uint8Array): void => {
  if (bytes.byteLength !== P256_SIGNATURE_LENGTH) {
    throw new Error("ECDSA signature must be raw P1363 r||s");
  }
};

const assertPrivateKeyBytes = (bytes: Uint8Array, label = "P-256 private key"): void => {
  if (bytes.byteLength !== P256_PRIVATE_KEY_LENGTH || !p256.utils.isValidSecretKey(bytes)) {
    throw new Error(`${label} is invalid`);
  }
};

const generateP256PrivateKey = (): Uint8Array => {
  for (let attempts = 0; attempts < 128; attempts += 1) {
    const candidate = secureRandomBytes(P256_PRIVATE_KEY_LENGTH);
    if (p256.utils.isValidSecretKey(candidate)) {
      return candidate;
    }
  }
  throw new Error("Unable to generate valid P-256 private key");
};

export const generateEcdhKeyPair = (): EncodedEcdhKeyPair => {
  const privateKey = generateP256PrivateKey();
  const publicKey = p256.getPublicKey(privateKey, false);
  assertP256PublicKeyBytes(publicKey);
  return {
    privateKey: bytesToBase64(privateKey),
    publicKey: bytesToBase64(publicKey),
  };
};

export const generateEcdsaKeyPair = (): EncodedEcdsaKeyPair => generateEcdhKeyPair();

export const validateP256PublicKeyBase64 = (publicKey: string, label?: string): void => {
  assertP256PublicKeyBytes(base64ToBytes(publicKey), label);
};

export const getPublicKeyFromPrivateKey = (privateKeyBase64: string): string => {
  const privateKey = base64ToBytes(privateKeyBase64);
  assertPrivateKeyBytes(privateKey);
  const publicKey = p256.getPublicKey(privateKey, false);
  assertP256PublicKeyBytes(publicKey);
  return bytesToBase64(publicKey);
};

export const p256Ecdh = (privateKeyBase64: string, publicKeyBase64: string): Uint8Array => {
  const privateKey = base64ToBytes(privateKeyBase64);
  const publicKey = base64ToBytes(publicKeyBase64);
  assertPrivateKeyBytes(privateKey);
  assertP256PublicKeyBytes(publicKey);
  const sharedPoint = p256.getSharedSecret(privateKey, publicKey, false);
  if (sharedPoint.byteLength !== P256_PUBLIC_KEY_LENGTH || sharedPoint[0] !== 0x04) {
    throw new Error("ECDH shared point has unexpected format");
  }
  return copyBytes(sharedPoint.subarray(1, 33));
};

export const ecdsaSignP1363 = (privateKeyBase64: string, data: Uint8Array): string => {
  const privateKey = base64ToBytes(privateKeyBase64);
  assertPrivateKeyBytes(privateKey, "ECDSA private key");
  const signature = p256.sign(data, privateKey, {
    format: "compact",
    prehash: true,
    lowS: false,
    extraEntropy: secureRandomBytes(32),
  });
  assertP1363SignatureBytes(signature);
  return bytesToBase64(signature);
};

export const ecdsaVerifyP1363 = (
  publicKeyBase64: string,
  signatureBase64: string,
  data: Uint8Array,
): boolean => {
  const publicKey = base64ToBytes(publicKeyBase64);
  const signature = base64ToBytes(signatureBase64);
  assertP256PublicKeyBytes(publicKey, "ECDSA public key");
  assertP1363SignatureBytes(signature);
  return p256.verify(signature, data, publicKey, {
    format: "compact",
    prehash: true,
    lowS: false,
  });
};

export const hkdfSha256 = (
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: string | Uint8Array,
  length = AES_256_KEY_LENGTH,
): Uint8Array => hkdf(sha256, inputKeyMaterial, salt, typeof info === "string" ? utf8ToBytes(info) : info, length);

export const aesGcmEncryptBytes = (
  keyBase64: string,
  plaintext: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array,
): string => {
  const key = base64ToBytes(keyBase64);
  if (key.byteLength !== AES_256_KEY_LENGTH) {
    throw new Error("AES-GCM key must be 32 bytes");
  }
  if (iv.byteLength !== AES_GCM_IV_LENGTH) {
    throw new Error("AES-GCM IV must be 12 bytes");
  }
  const ciphertext = gcm(key, iv, additionalData).encrypt(plaintext);
  if (ciphertext.byteLength < AES_GCM_TAG_LENGTH) {
    throw new Error("AES-GCM ciphertext missing authentication tag");
  }
  return bytesToBase64(ciphertext);
};

export const aesGcmDecryptBytes = (
  keyBase64: string,
  ciphertextBase64: string,
  iv: Uint8Array,
  additionalData?: Uint8Array,
): Uint8Array => {
  const key = base64ToBytes(keyBase64);
  if (key.byteLength !== AES_256_KEY_LENGTH) {
    throw new Error("AES-GCM key must be 32 bytes");
  }
  if (iv.byteLength !== AES_GCM_IV_LENGTH) {
    throw new Error("AES-GCM IV must be 12 bytes");
  }
  return gcm(key, iv, additionalData).decrypt(base64ToBytes(ciphertextBase64));
};

export const deriveBase64Key = (
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: string | Uint8Array,
): string => bytesToBase64(hkdfSha256(inputKeyMaterial, salt, info, AES_256_KEY_LENGTH));

export const concatDhOutputs = (...parts: Uint8Array[]): Uint8Array => concatBytes(...parts);

export const randomAes256Key = (): string => bytesToBase64(secureRandomBytes(AES_256_KEY_LENGTH));

export const randomAesGcmIv = (): Uint8Array => secureRandomBytes(AES_GCM_IV_LENGTH);

