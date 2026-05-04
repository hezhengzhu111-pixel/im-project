import { describe, it, expect } from 'vitest';
import {
  generateIdentityKeyPair,
  generateEphemeralKeyPair,
  generateSignedPreKeyPair,
  generateOneTimePreKeyPair,
  generateSigningKeyPair,
  exportPublicKey,
  importPublicKey,
  importSigningPublicKey,
  ecdhDeriveBits,
  hkdfDeriveKey,
  hkdfDeriveBits,
  aesGcmEncrypt,
  aesGcmDecrypt,
  ecdsaSign,
  ecdsaVerify,
  pbkdf2DeriveKey,
} from '@/features/e2ee/engine/crypto-primitives';

/** 将 ArrayBufferLike 安全转为 ArrayBuffer（兼容 SharedArrayBuffer 场景） */
function ab(data: ArrayBufferLike): ArrayBuffer {
  const bytes = new Uint8Array(data);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

describe('e2ee crypto-primitives', () => {
  // -----------------------------------------------------------------------
  // Key Generation — extractable 属性
  // -----------------------------------------------------------------------

  it('Identity Key is not extractable', async () => {
    const kp = await generateIdentityKeyPair();
    // extractable 参数控制私钥；公钥在 Web Crypto API 中始终可导出
    expect(kp.privateKey.extractable).toBe(false);
  });

  it('Ephemeral Key is not extractable', async () => {
    const kp = await generateEphemeralKeyPair();
    expect(kp.privateKey.extractable).toBe(false);
  });

  it('Signed Pre Key is extractable', async () => {
    const kp = await generateSignedPreKeyPair();
    expect(kp.privateKey.extractable).toBe(true);
    expect(kp.publicKey.extractable).toBe(true);
  });

  it('One-Time Pre Key is extractable', async () => {
    const kp = await generateOneTimePreKeyPair();
    expect(kp.privateKey.extractable).toBe(true);
    expect(kp.publicKey.extractable).toBe(true);
  });

  it('Signing Key is extractable', async () => {
    const kp = await generateSigningKeyPair();
    expect(kp.privateKey.extractable).toBe(true);
    expect(kp.publicKey.extractable).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Public Key Export / Import
  // -----------------------------------------------------------------------

  it('exportPublicKey returns raw ArrayBuffer', async () => {
    const kp = await generateSignedPreKeyPair();
    const raw = await exportPublicKey(kp.publicKey);
    // jsdom 中 exportKey 返回的 ArrayBuffer 可能与全局 ArrayBuffer 不同
    expect(raw.byteLength).toBe(65); // P-256 uncompressed point
    expect(raw.constructor.name).toBe('ArrayBuffer');
  });

  it('importPublicKey produces usable ECDH key', async () => {
    const kp = await generateSignedPreKeyPair();
    const raw = await exportPublicKey(kp.publicKey);
    const imported = await importPublicKey(raw);
    expect(imported.type).toBe('public');
    expect(imported.algorithm).toMatchObject({ namedCurve: 'P-256' });
  });

  it('importSigningPublicKey produces usable ECDSA key', async () => {
    const signKp = await generateSigningKeyPair();
    const raw = await exportPublicKey(signKp.publicKey);
    const imported = await importSigningPublicKey(raw);
    expect(imported.type).toBe('public');
    expect(imported.algorithm).toMatchObject({ namedCurve: 'P-256' });
  });

  // -----------------------------------------------------------------------
  // ECDH — 双方派生相同共享密钥
  // -----------------------------------------------------------------------

  it('ECDH derives same shared secret for both parties', async () => {
    const alice = await generateSignedPreKeyPair();
    const bob = await generateSignedPreKeyPair();

    const aliceRaw = await exportPublicKey(alice.publicKey);
    const bobRaw = await exportPublicKey(bob.publicKey);

    const alicePub = await importPublicKey(aliceRaw);
    const bobPub = await importPublicKey(bobRaw);

    const secretA = await ecdhDeriveBits(alice.privateKey, bobPub);
    const secretB = await ecdhDeriveBits(bob.privateKey, alicePub);

    expect(new Uint8Array(secretA)).toEqual(new Uint8Array(secretB));
    expect(secretA.byteLength).toBe(32); // 256 bits = 32 bytes
  });

  // -----------------------------------------------------------------------
  // HKDF — 相同输入派生一致的密钥
  // -----------------------------------------------------------------------

  it('HKDF derives consistent key from same input', async () => {
    const ikm = ab(new Uint8Array(32).buffer);
    const salt = ab(new Uint8Array(16).buffer);
    const info = ab(new TextEncoder().encode('e2ee-session-key').buffer);

    const key1 = await hkdfDeriveKey(ikm, salt, info);
    const key2 = await hkdfDeriveKey(ikm, salt, info);

    // 两个密钥应可用于加解密互操作
    const plaintext = ab(new TextEncoder().encode('hello').buffer);
    const { ciphertext, iv } = await aesGcmEncrypt(key1, plaintext);
    const decrypted = await aesGcmDecrypt(key2, ciphertext, iv);
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plaintext));
  });

  it('hkdfDeriveBits returns correct length', async () => {
    const ikm = ab(new Uint8Array(32).buffer);
    const salt = ab(new Uint8Array(16).buffer);
    const info = ab(new TextEncoder().encode('test').buffer);

    const bits = await hkdfDeriveBits(ikm, salt, info, 256);
    expect(bits.byteLength).toBe(32);
  });

  // -----------------------------------------------------------------------
  // AES-256-GCM — 加解密往返
  // -----------------------------------------------------------------------

  it('AES-256-GCM encrypt/decrypt round-trip', async () => {
    const key = await hkdfDeriveKey(
      ab(new Uint8Array(32).buffer),
      ab(new Uint8Array(16).buffer),
      ab(new TextEncoder().encode('test').buffer),
    );

    const plaintext = ab(new TextEncoder().encode('Hello, E2EE!').buffer);
    const { ciphertext, iv } = await aesGcmEncrypt(key, plaintext);

    expect(ciphertext.byteLength).toBeGreaterThan(0);
    expect(iv.length).toBe(12); // 12-byte nonce

    const decrypted = await aesGcmDecrypt(key, ciphertext, iv);
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plaintext));
  });

  it('AES-256-GCM uses provided iv', async () => {
    const key = await hkdfDeriveKey(
      ab(new Uint8Array(32).buffer),
      ab(new Uint8Array(16).buffer),
      ab(new TextEncoder().encode('test').buffer),
    );

    const customIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const plaintext = ab(new TextEncoder().encode('custom iv').buffer);
    const { ciphertext, iv } = await aesGcmEncrypt(key, plaintext, customIv);

    expect(iv).toEqual(customIv);

    const decrypted = await aesGcmDecrypt(key, ciphertext, iv);
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plaintext));
  });

  it('AES-256-GCM fails with wrong key', async () => {
    const key1 = await hkdfDeriveKey(
      ab(new Uint8Array(32).buffer),
      ab(new Uint8Array(16).buffer),
      ab(new TextEncoder().encode('key1').buffer),
    );
    const key2 = await hkdfDeriveKey(
      ab(new Uint8Array(32).buffer),
      ab(new Uint8Array(16).buffer),
      ab(new TextEncoder().encode('key2').buffer),
    );

    const plaintext = ab(new TextEncoder().encode('secret').buffer);
    const { ciphertext, iv } = await aesGcmEncrypt(key1, plaintext);

    await expect(aesGcmDecrypt(key2, ciphertext, iv)).rejects.toThrow();
  });

  // -----------------------------------------------------------------------
  // ECDSA — 签名与验签
  // -----------------------------------------------------------------------

  it('ECDSA sign and verify (positive)', async () => {
    const kp = await generateSigningKeyPair();
    const data = ab(new TextEncoder().encode('message to sign').buffer);

    const signature = await ecdsaSign(kp.privateKey, data);
    expect(signature.byteLength).toBeGreaterThan(0);

    const valid = await ecdsaVerify(kp.publicKey, signature, data);
    expect(valid).toBe(true);
  });

  it('ECDSA verify fails with tampered data (negative)', async () => {
    const kp = await generateSigningKeyPair();
    const data = ab(new TextEncoder().encode('original').buffer);
    const tampered = ab(new TextEncoder().encode('tampered').buffer);

    const signature = await ecdsaSign(kp.privateKey, data);
    const valid = await ecdsaVerify(kp.publicKey, signature, tampered);
    expect(valid).toBe(false);
  });

  it('ECDSA verify fails with wrong public key (negative)', async () => {
    const kp1 = await generateSigningKeyPair();
    const kp2 = await generateSigningKeyPair();
    const data = ab(new TextEncoder().encode('message').buffer);

    const signature = await ecdsaSign(kp1.privateKey, data);
    const valid = await ecdsaVerify(kp2.publicKey, signature, data);
    expect(valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // PBKDF2
  // -----------------------------------------------------------------------

  it('PBKDF2 derives key with correct algorithm', async () => {
    const salt = ab(new Uint8Array(16).buffer);
    const key = await pbkdf2DeriveKey('my-password', salt);

    expect(key.type).toBe('secret');
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(key.extractable).toBe(false);
  });

  it('PBKDF2 key can encrypt and decrypt', async () => {
    const salt = ab(new Uint8Array(16).buffer);
    const key = await pbkdf2DeriveKey('test-password', salt);

    const plaintext = ab(new TextEncoder().encode('PBKDF2 test').buffer);
    const { ciphertext, iv } = await aesGcmEncrypt(key, plaintext);
    const decrypted = await aesGcmDecrypt(key, ciphertext, iv);

    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plaintext));
  });

  it('PBKDF2 with same password and salt derives same key', async () => {
    const salt = ab(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).buffer);
    const key1 = await pbkdf2DeriveKey('same-password', salt);
    const key2 = await pbkdf2DeriveKey('same-password', salt);

    const plaintext = ab(new TextEncoder().encode('consistent').buffer);
    const { ciphertext, iv } = await aesGcmEncrypt(key1, plaintext);
    const decrypted = await aesGcmDecrypt(key2, ciphertext, iv);

    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plaintext));
  });

  it('PBKDF2 with different passwords derives different keys', async () => {
    const salt = ab(new Uint8Array(16).buffer);
    const key1 = await pbkdf2DeriveKey('password-a', salt);
    const key2 = await pbkdf2DeriveKey('password-b', salt);

    const plaintext = ab(new TextEncoder().encode('test').buffer);
    const { ciphertext, iv } = await aesGcmEncrypt(key1, plaintext);

    await expect(aesGcmDecrypt(key2, ciphertext, iv)).rejects.toThrow();
  });
});
