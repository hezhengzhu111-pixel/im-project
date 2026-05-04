/**
 * X3DH (Extended Triple Diffie-Hellman) 密钥协商协议
 *
 * 实现 Signal Protocol 的 X3DH 密钥交换，包括:
 * - Key Bundle 生成（IK + SPK + OPKs）
 * - 发起方协商（Initiator）
 * - 响应方协商（Responder）
 *
 * 注意: Web Crypto API 不支持同一密钥同时用于 ECDH 和 ECDSA。
 * 因此 Identity Key 采用双密钥结构:
 *   - signingIdentityKey (ECDSA P-256): 用于签名/验签
 *   - identityKey (ECDH P-256): 用于 DH 密钥协商
 */

import {
  generateIdentityKeyPair,
  generateSignedPreKeyPair,
  generateOneTimePreKeyPair,
  generateEphemeralKeyPair,
  generateSigningKeyPair,
  exportPublicKey,
  importPublicKey,
  importSigningPublicKey,
  ecdhDeriveBits,
  ecdsaSign,
  ecdsaVerify,
  hkdfDeriveBits,
} from './crypto-primitives';
import { bufferToBase64, base64ToBuffer, concatBuffers } from './codec';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 密钥 Bundle — 包含所有密钥对和 base64 编码的公钥 */
export interface KeyBundle {
  /** ECDH Identity Key 对（用于 DH 密钥协商） */
  identityKeyPair: CryptoKeyPair;
  /** ECDSA Identity Key 对（用于签名/验签） */
  signingIdentityKeyPair: CryptoKeyPair;
  /** Signed Pre Key 对 */
  signedPreKeyPair: CryptoKeyPair;
  /** One-Time Pre Key 对数组 */
  oneTimePreKeyPairs: CryptoKeyPair[];
  /** Base64 编码的上传 Bundle */
  bundle: EncodedBundle;
}

/** Base64 编码的 Bundle（用于上传服务端） */
export interface EncodedBundle {
  /** ECDH Identity Key 公钥 (Base64) */
  identityKey: string;
  /** ECDSA Signing Identity Key 公钥 (Base64) */
  signingIdentityKey: string;
  /** Signed Pre Key 公钥 (Base64) */
  signedPreKey: string;
  /** SPK 签名 (Base64, 由 ECDSA IK 签名) */
  signedPreKeySignature: string;
  /** One-Time Pre Key 公钥数组 (Base64) */
  oneTimePreKeys: string[];
}

/** X3DH 协商结果 */
export interface X3dhResult {
  /** 派生的 Root Key (Base64) */
  rootKey: string;
  /** 发起方临时公钥 (Base64, 响应方需要) */
  ephemeralPublicKey: string;
}

// ---------------------------------------------------------------------------
// HKDF Info 常量
// ---------------------------------------------------------------------------

const X3DH_INFO = new TextEncoder().encode('X3DH-RootKey-v1');
const HKDF_SALT = new Uint8Array(32); // 32 字节全零 salt

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 安全地将 ArrayBufferLike 转为 ArrayBuffer */
function toBuffer(data: ArrayBufferLike): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const bytes = new Uint8Array(data);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

// ---------------------------------------------------------------------------
// generateKeyBundle
// ---------------------------------------------------------------------------

const OPK_COUNT = 20;

/**
 * 生成完整的 X3DH Key Bundle
 *
 * 包含:
 * - Identity Key (双密钥: ECDH + ECDSA)
 * - Signed Pre Key (ECDSA IK 签名)
 * - 20 个 One-Time Pre Keys
 *
 * @returns KeyBundle — 包含所有密钥对和 base64 编码的 Bundle
 */
export async function generateKeyBundle(): Promise<KeyBundle> {
  // 1. 生成双密钥 Identity Key
  const identityKeyPair = await generateIdentityKeyPair(); // ECDH P-256
  const signingIdentityKeyPair = await generateSigningKeyPair(); // ECDSA P-256

  // 2. 生成 Signed Pre Key
  const signedPreKeyPair = await generateSignedPreKeyPair();

  // 3. 用 ECDSA IK 私钥签名 SPK 公钥
  const spkRaw = await exportPublicKey(signedPreKeyPair.publicKey);
  const signature = await ecdsaSign(
    signingIdentityKeyPair.privateKey,
    toBuffer(spkRaw),
  );

  // 4. 生成 20 个 One-Time Pre Keys
  const oneTimePreKeyPairs: CryptoKeyPair[] = [];
  for (let i = 0; i < OPK_COUNT; i++) {
    oneTimePreKeyPairs.push(await generateOneTimePreKeyPair());
  }

  // 5. 导出公钥为 Base64
  const ikRaw = await exportPublicKey(identityKeyPair.publicKey);
  const signingIkRaw = await exportPublicKey(signingIdentityKeyPair.publicKey);
  const opkRaws = await Promise.all(
    oneTimePreKeyPairs.map((kp) => exportPublicKey(kp.publicKey)),
  );

  const bundle: EncodedBundle = {
    identityKey: bufferToBase64(toBuffer(ikRaw)),
    signingIdentityKey: bufferToBase64(toBuffer(signingIkRaw)),
    signedPreKey: bufferToBase64(toBuffer(spkRaw)),
    signedPreKeySignature: bufferToBase64(toBuffer(signature)),
    oneTimePreKeys: opkRaws.map((raw) => bufferToBase64(toBuffer(raw))),
  };

  return {
    identityKeyPair,
    signingIdentityKeyPair,
    signedPreKeyPair,
    oneTimePreKeyPairs,
    bundle,
  };
}

// ---------------------------------------------------------------------------
// x3dhInitiate
// ---------------------------------------------------------------------------

/**
 * X3DH 发起方（Alice）
 *
 * 步骤:
 * 1. 验证 Bob 的 SPK 签名
 * 2. 生成临时密钥对 (EK_A)
 * 3. 计算 4 个 DH 共享密钥:
 *    - DH1: IK_A  -> SPK_B
 *    - DH2: EK_A  -> IK_B
 *    - DH3: EK_A  -> SPK_B
 *    - DH4: EK_A  -> OPK_B (如果有)
 * 4. 拼接 + HKDF -> Root Key
 *
 * @param identityKeyPair     - Alice 的 ECDH Identity Key 对
 * @param remoteBundle        - Bob 的公钥 Bundle (Base64 编码)
 * @returns X3dhResult — rootKey (Base64) + ephemeralPublicKey (Base64)
 */
export async function x3dhInitiate(
  identityKeyPair: CryptoKeyPair,
  remoteBundle: {
    identityKey: string;           // ECDH IK_B (Base64)
    signingIdentityKey: string;    // ECDSA IK_B (Base64, 用于验签)
    signedPreKey: string;          // SPK_B (Base64)
    signedPreKeySignature: string; // SPK 签名 (Base64)
    oneTimePreKey?: string;        // OPK_B (Base64, 可选)
  },
): Promise<X3dhResult> {
  // 1. 导入 Bob 的公钥
  const ikRaw = base64ToBuffer(remoteBundle.identityKey);
  const signingIkRaw = base64ToBuffer(remoteBundle.signingIdentityKey);
  const spkRaw = base64ToBuffer(remoteBundle.signedPreKey);
  const sigRaw = base64ToBuffer(remoteBundle.signedPreKeySignature);

  const remoteIkPub = await importPublicKey(ikRaw);
  const remoteSigningIkPub = await importSigningPublicKey(signingIkRaw);
  const remoteSpkPub = await importPublicKey(spkRaw);

  // 2. 验证 SPK 签名
  const sigValid = await ecdsaVerify(
    remoteSigningIkPub,
    toBuffer(sigRaw),
    toBuffer(spkRaw),
  );
  if (!sigValid) {
    throw new Error('X3DH: SPK signature verification failed');
  }

  // 3. 生成临时密钥对
  const ephemeralKeyPair = await generateEphemeralKeyPair();

  // 4. 计算 4 个 DH 共享密钥
  // DH1: IK_A private -> SPK_B public
  const dh1 = await ecdhDeriveBits(
    identityKeyPair.privateKey,
    remoteSpkPub,
  );

  // DH2: EK_A private -> IK_B public
  const dh2 = await ecdhDeriveBits(
    ephemeralKeyPair.privateKey,
    remoteIkPub,
  );

  // DH3: EK_A private -> SPK_B public
  const dh3 = await ecdhDeriveBits(
    ephemeralKeyPair.privateKey,
    remoteSpkPub,
  );

  // DH4: EK_A private -> OPK_B public (如果有)
  let dh4: ArrayBuffer | null = null;
  if (remoteBundle.oneTimePreKey) {
    const opkRaw = base64ToBuffer(remoteBundle.oneTimePreKey);
    const remoteOpkPub = await importPublicKey(opkRaw);
    dh4 = await ecdhDeriveBits(
      ephemeralKeyPair.privateKey,
      remoteOpkPub,
    );
  }

  // 5. 拼接 DH 输出
  const dhParts = [toBuffer(dh1), toBuffer(dh2), toBuffer(dh3)];
  if (dh4) dhParts.push(toBuffer(dh4));
  const concatenated = concatBuffers(...dhParts);

  // 6. HKDF 派生 Root Key
  const rootKeyBits = await hkdfDeriveBits(
    concatenated,
    toBuffer(HKDF_SALT.buffer),
    toBuffer(X3DH_INFO.buffer),
    256,
  );

  // 7. 导出临时公钥
  const ekRaw = await exportPublicKey(ephemeralKeyPair.publicKey);

  return {
    rootKey: bufferToBase64(toBuffer(rootKeyBits)),
    ephemeralPublicKey: bufferToBase64(toBuffer(ekRaw)),
  };
}

// ---------------------------------------------------------------------------
// x3dhRespond
// ---------------------------------------------------------------------------

/**
 * X3DH 响应方（Bob）
 *
 * 计算与发起方相同的 Root Key（DH 方向相反）:
 * - DH1: SPK_B private -> IK_A public
 * - DH2: IK_B  private -> EK_A public
 * - DH3: SPK_B private -> EK_A public
 * - DH4: OPK_B private -> EK_A public (如果有)
 *
 * @param identityKeyPair       - Bob 的 ECDH Identity Key 对
 * @param signedPreKeyPair      - Bob 的 Signed Pre Key 对
 * @param oneTimePreKeyPair     - Bob 的 One-Time Pre Key 对 (可选)
 * @param remoteIdentityKeyRaw  - Alice 的 ECDH IK 公钥 (Base64)
 * @param remoteEphemeralKeyRaw - Alice 的临时公钥 (Base64)
 * @returns rootKey (Base64) — 与发起方计算的相同
 */
export async function x3dhRespond(
  identityKeyPair: CryptoKeyPair,
  signedPreKeyPair: CryptoKeyPair,
  oneTimePreKeyPair: CryptoKeyPair | null,
  remoteIdentityKeyRaw: string,
  remoteEphemeralKeyRaw: string,
): Promise<string> {
  // 1. 导入 Alice 的公钥
  const ikARaw = base64ToBuffer(remoteIdentityKeyRaw);
  const ekARaw = base64ToBuffer(remoteEphemeralKeyRaw);

  const remoteIkPub = await importPublicKey(ikARaw);
  const remoteEkPub = await importPublicKey(ekARaw);

  // 2. 计算 4 个 DH 共享密钥（方向与发起方相反）
  // DH1: SPK_B private -> IK_A public
  const dh1 = await ecdhDeriveBits(
    signedPreKeyPair.privateKey,
    remoteIkPub,
  );

  // DH2: IK_B private -> EK_A public
  const dh2 = await ecdhDeriveBits(
    identityKeyPair.privateKey,
    remoteEkPub,
  );

  // DH3: SPK_B private -> EK_A public
  const dh3 = await ecdhDeriveBits(
    signedPreKeyPair.privateKey,
    remoteEkPub,
  );

  // DH4: OPK_B private -> EK_A public (如果有)
  let dh4: ArrayBuffer | null = null;
  if (oneTimePreKeyPair) {
    dh4 = await ecdhDeriveBits(
      oneTimePreKeyPair.privateKey,
      remoteEkPub,
    );
  }

  // 3. 拼接 DH 输出（与发起方顺序相同）
  const dhParts = [toBuffer(dh1), toBuffer(dh2), toBuffer(dh3)];
  if (dh4) dhParts.push(toBuffer(dh4));
  const concatenated = concatBuffers(...dhParts);

  // 4. HKDF 派生 Root Key
  const rootKeyBits = await hkdfDeriveBits(
    concatenated,
    toBuffer(HKDF_SALT.buffer),
    toBuffer(X3DH_INFO.buffer),
    256,
  );

  return bufferToBase64(toBuffer(rootKeyBits));
}
