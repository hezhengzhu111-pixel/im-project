/**
 * Web Crypto API 封装 — E2EE 加密原语
 *
 * 提供 ECDH 密钥生成、HKDF 派生、AES-256-GCM 加解密、ECDSA 签名等操作。
 * Identity Key 必须 extractable: false。
 */

import { randomBytes } from './codec';

// ---------------------------------------------------------------------------
// Key Generation
// ---------------------------------------------------------------------------

/**
 * 生成 Identity Key 对 (ECDH P-256)
 * extractable: false, 用途: deriveKey, deriveBits
 */
export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // extractable: false — 私钥永不可导出
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * 生成 Ephemeral Key 对 (ECDH P-256)
 * extractable: false, 用途: deriveKey, deriveBits
 */
export async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * 生成可持久化的 Double Ratchet DH 密钥对。
 *
 * X3DH 临时密钥仍保持不可导出；RatchetState 需要写入 IndexedDB，
 * 因此这里的私钥必须可导出为 JWK。
 */
export async function generateRatchetKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * 生成 Signed Pre Key 对 (ECDH P-256)
 * extractable: true（需要导出公钥上传服务端）, 用途: deriveKey, deriveBits
 */
export async function generateSignedPreKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * 生成 One-Time Pre Key 对 (ECDH P-256)
 * extractable: true, 用途: deriveKey, deriveBits
 */
export async function generateOneTimePreKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * 生成签名密钥对 (ECDSA P-256)
 * extractable: true, 用途: sign, verify
 */
export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
}

// ---------------------------------------------------------------------------
// Public Key Export / Import
// ---------------------------------------------------------------------------

/**
 * 导出公钥为 raw ArrayBuffer
 */
export async function exportPublicKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key);
}

/**
 * 导入 raw 公钥为 ECDH P-256 CryptoKey
 * extractable: true, 无用途（纯公钥）
 */
export async function importPublicKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

/**
 * 导入 raw 签名公钥为 ECDSA P-256 CryptoKey
 * extractable: true, 用途: verify
 */
export async function importSigningPublicKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
}

// ---------------------------------------------------------------------------
// ECDH
// ---------------------------------------------------------------------------

/**
 * ECDH 派生共享密钥 (256 bits)
 */
export async function ecdhDeriveBits(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
}

// ---------------------------------------------------------------------------
// HKDF
// ---------------------------------------------------------------------------

/**
 * HKDF 派生 AES-GCM-256 密钥
 * extractable: true
 */
export async function hkdfDeriveKey(
  inputKeyMaterial: ArrayBuffer,
  salt: ArrayBuffer,
  info: ArrayBuffer,
): Promise<CryptoKey> {
  // 先用 HKDF 导入为 HKDF 派生密钥
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    inputKeyMaterial,
    'HKDF',
    false,
    ['deriveKey'],
  );

  // 再派生为 AES-GCM 密钥
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * HKDF 派生指定长度的原始比特
 */
export async function hkdfDeriveBits(
  inputKeyMaterial: ArrayBuffer,
  salt: ArrayBuffer,
  info: ArrayBuffer,
  lengthBits: number,
): Promise<ArrayBuffer> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    inputKeyMaterial,
    'HKDF',
    false,
    ['deriveBits'],
  );

  return crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    lengthBits,
  );
}

// ---------------------------------------------------------------------------
// AES-256-GCM
// ---------------------------------------------------------------------------

/**
 * AES-256-GCM 加密
 * @param key - AES-GCM 密钥
 * @param plaintext - 明文
 * @param iv - 可选 12 字节 nonce，不传则自动生成
 * @returns 密文和使用的 iv
 */
export async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: ArrayBuffer,
  iv?: Uint8Array,
  additionalData?: ArrayBuffer,
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const nonce = iv ?? randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, ...(additionalData ? { additionalData } : {}) },
    key,
    plaintext,
  );
  return { ciphertext, iv: nonce };
}

/**
 * AES-256-GCM 解密
 */
export async function aesGcmDecrypt(
  key: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
  additionalData?: ArrayBuffer,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, ...(additionalData ? { additionalData } : {}) },
    key,
    ciphertext,
  );
}

// ---------------------------------------------------------------------------
// ECDSA
// ---------------------------------------------------------------------------

/**
 * ECDSA 签名 (SHA-256)
 */
export async function ecdsaSign(
  privateKey: CryptoKey,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  return crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data,
  );
}

/**
 * ECDSA 验签 (SHA-256)
 */
export async function ecdsaVerify(
  publicKey: CryptoKey,
  signature: ArrayBuffer,
  data: ArrayBuffer,
): Promise<boolean> {
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    signature,
    data,
  );
}

// ---------------------------------------------------------------------------
// PBKDF2
// ---------------------------------------------------------------------------

/**
 * PBKDF2 派生 AES-GCM-256 密钥
 * 600,000 次迭代, SHA-512, extractable: false
 */
export async function pbkdf2DeriveKey(
  password: string,
  salt: ArrayBuffer,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-512' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false
    ['encrypt', 'decrypt'],
  );
}
