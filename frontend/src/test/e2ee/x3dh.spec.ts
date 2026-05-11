import { describe, it, expect } from 'vitest';
import {
  generateKeyBundle,
  x3dhInitiate,
  x3dhRespond,
} from '@/features/e2ee/engine/x3dh';

/** 将 ArrayBufferLike 安全转为 ArrayBuffer */
function ab(data: ArrayBufferLike): ArrayBuffer {
  const bytes = new Uint8Array(data);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

describe('e2ee X3DH key exchange', () => {
  // ---------------------------------------------------------------------------
  // generateKeyBundle — 生成有效 Bundle
  // ---------------------------------------------------------------------------

  it('generates valid key bundle with correct structure', async () => {
    const result = await generateKeyBundle();

    // 密钥对存在
    expect(result.identityKeyPair).toBeDefined();
    expect(result.signingIdentityKeyPair).toBeDefined();
    expect(result.signedPreKeyPair).toBeDefined();
    expect(result.oneTimePreKeyPairs).toHaveLength(20);

    // IK 不可提取（ECDH）
    expect(result.identityKeyPair.privateKey.extractable).toBe(false);
    // 签名 IK 可提取（ECDSA）
    expect(result.signingIdentityKeyPair.privateKey.extractable).toBe(false);
    // SPK 可提取
    expect(result.signedPreKeyPair.privateKey.extractable).toBe(false);
    // OPK 可提取
    result.oneTimePreKeyPairs.forEach((kp) => {
      expect(kp.privateKey.extractable).toBe(true);
    });

    // Base64 Bundle 结构
    const { bundle } = result;
    expect(bundle.identityKey).toBeTruthy();
    expect(bundle.signingIdentityKey).toBeTruthy();
    expect(bundle.signedPreKey).toBeTruthy();
    expect(bundle.signedPreKeySignature).toBeTruthy();
    expect(bundle.oneTimePreKeys).toHaveLength(20);

    // Base64 解码不应抛出
    const ikBytes = atob(bundle.identityKey);
    const spkBytes = atob(bundle.signedPreKey);
    const sigBytes = atob(bundle.signedPreKeySignature);
    expect(ikBytes.length).toBeGreaterThan(0);
    expect(spkBytes.length).toBeGreaterThan(0);
    expect(sigBytes.length).toBeGreaterThan(0);
  });

  it('generates unique key bundles on each call', async () => {
    const bundle1 = await generateKeyBundle();
    const bundle2 = await generateKeyBundle();

    // 不同调用应生成不同的公钥
    expect(bundle1.bundle.identityKey).not.toBe(bundle2.bundle.identityKey);
    expect(bundle1.bundle.signedPreKey).not.toBe(bundle2.bundle.signedPreKey);
    expect(bundle1.bundle.oneTimePreKeys[0]).not.toBe(
      bundle2.bundle.oneTimePreKeys[0],
    );
  });

  it('SPK signature can be verified with signing IK', async () => {
    const { bundle } = await generateKeyBundle();

    // 签名应可被同一 IK 验证
    // 这通过 x3dhInitiate 验签来间接测试 — 如果签名无效会抛出
    // 直接测试: 使用 x3dhInitiate 验证自己的 Bundle 不会抛出
    const remoteBundle = {
      identityKey: bundle.identityKey,
      signingIdentityKey: bundle.signingIdentityKey,
      signedPreKey: bundle.signedPreKey,
      signedPreKeySignature: bundle.signedPreKeySignature,
      oneTimePreKey: bundle.oneTimePreKeys[0],
    };

    // 用另一方的 IK 尝试协商（验证签名不会失败）
    const initiator = await generateKeyBundle();
    // 只要不抛出 "signature verification failed" 就说明签名有效
    await expect(
      x3dhInitiate(initiator.identityKeyPair, remoteBundle),
    ).resolves.toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // x3dhInitiate + x3dhRespond — 双方派生相同 Root Key
  // ---------------------------------------------------------------------------

  it('initiate and respond derive the SAME root key (with OPK)', async () => {
    // 生成双方的 Bundle
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // Alice 发起协商（使用 Bob 的第一个 OPK）
    const aliceResult = await x3dhInitiate(alice.identityKeyPair, {
      identityKey: bob.bundle.identityKey,
      signingIdentityKey: bob.bundle.signingIdentityKey,
      signedPreKey: bob.bundle.signedPreKey,
      signedPreKeySignature: bob.bundle.signedPreKeySignature,
      oneTimePreKey: bob.bundle.oneTimePreKeys[0],
    });

    // Bob 响应协商（使用对应的 OPK）
    const bobRootKey = await x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      bob.oneTimePreKeyPairs[0], // 使用与 Bundle 中第一个 OPK 对应的私钥
      alice.bundle.identityKey,
      aliceResult.ephemeralPublicKey,
    );

    // 关键断言: 双方派生出相同的 Root Key
    expect(aliceResult.rootKey).toBe(bobRootKey);
  });

  it('initiate and respond derive the SAME root key (without OPK)', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // Alice 发起协商（不使用 OPK）
    const aliceResult = await x3dhInitiate(alice.identityKeyPair, {
      identityKey: bob.bundle.identityKey,
      signingIdentityKey: bob.bundle.signingIdentityKey,
      signedPreKey: bob.bundle.signedPreKey,
      signedPreKeySignature: bob.bundle.signedPreKeySignature,
      // 不传 oneTimePreKey
    });

    // Bob 响应（不使用 OPK）
    const bobRootKey = await x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      null, // 没有 OPK
      alice.bundle.identityKey,
      aliceResult.ephemeralPublicKey,
    );

    // 双方派生出相同的 Root Key
    expect(aliceResult.rootKey).toBe(bobRootKey);
  });

  it('different OPKs produce different root keys', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // 使用第一个 OPK
    const result1 = await x3dhInitiate(alice.identityKeyPair, {
      identityKey: bob.bundle.identityKey,
      signingIdentityKey: bob.bundle.signingIdentityKey,
      signedPreKey: bob.bundle.signedPreKey,
      signedPreKeySignature: bob.bundle.signedPreKeySignature,
      oneTimePreKey: bob.bundle.oneTimePreKeys[0],
    });

    // 使用第二个 OPK
    const result2 = await x3dhInitiate(alice.identityKeyPair, {
      identityKey: bob.bundle.identityKey,
      signingIdentityKey: bob.bundle.signingIdentityKey,
      signedPreKey: bob.bundle.signedPreKey,
      signedPreKeySignature: bob.bundle.signedPreKeySignature,
      oneTimePreKey: bob.bundle.oneTimePreKeys[1],
    });

    // 不同 OPK 应产生不同的 Root Key
    expect(result1.rootKey).not.toBe(result2.rootKey);
  });

  it('with OPK differs from without OPK', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // 有 OPK
    const withOpk = await x3dhInitiate(alice.identityKeyPair, {
      identityKey: bob.bundle.identityKey,
      signingIdentityKey: bob.bundle.signingIdentityKey,
      signedPreKey: bob.bundle.signedPreKey,
      signedPreKeySignature: bob.bundle.signedPreKeySignature,
      oneTimePreKey: bob.bundle.oneTimePreKeys[0],
    });

    // 无 OPK
    const withoutOpk = await x3dhInitiate(alice.identityKeyPair, {
      identityKey: bob.bundle.identityKey,
      signingIdentityKey: bob.bundle.signingIdentityKey,
      signedPreKey: bob.bundle.signedPreKey,
      signedPreKeySignature: bob.bundle.signedPreKeySignature,
    });

    expect(withOpk.rootKey).not.toBe(withoutOpk.rootKey);
  });

  // ---------------------------------------------------------------------------
  // x3dhInitiate — 签名验证失败
  // ---------------------------------------------------------------------------

  it('rejects bundle with invalid signature', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // 篡改签名（翻转第一个字节）
    const sigBytes = atob(bob.bundle.signedPreKeySignature);
    const sigArray = new Uint8Array(sigBytes.length);
    for (let i = 0; i < sigBytes.length; i++) {
      sigArray[i] = sigBytes.charCodeAt(i);
    }
    sigArray[0] ^= 0xff;
    const tamperedSig = btoa(String.fromCharCode(...sigArray));

    await expect(
      x3dhInitiate(alice.identityKeyPair, {
        identityKey: bob.bundle.identityKey,
        signingIdentityKey: bob.bundle.signingIdentityKey,
        signedPreKey: bob.bundle.signedPreKey,
        signedPreKeySignature: tamperedSig,
      }),
    ).rejects.toThrow('X3DH: SPK signature verification failed');
  });

  it('rejects bundle signed by different IK', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();
    const charlie = await generateKeyBundle();

    // Bob 的 SPK 签名，但使用 Charlie 的签名 IK 验证
    await expect(
      x3dhInitiate(alice.identityKeyPair, {
        identityKey: bob.bundle.identityKey,
        signingIdentityKey: charlie.bundle.signingIdentityKey, // 错误的签名 IK
        signedPreKey: bob.bundle.signedPreKey,
        signedPreKeySignature: bob.bundle.signedPreKeySignature,
      }),
    ).rejects.toThrow('X3DH: SPK signature verification failed');
  });

  // ---------------------------------------------------------------------------
  // x3dhRespond — 多次协商产生不同结果
  // ---------------------------------------------------------------------------

  it('multiple sessions between same parties produce different root keys', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // 第一次协商（使用 OPK[0]）
    const session1Init = await x3dhInitiate(alice.identityKeyPair, {
      identityKey: bob.bundle.identityKey,
      signingIdentityKey: bob.bundle.signingIdentityKey,
      signedPreKey: bob.bundle.signedPreKey,
      signedPreKeySignature: bob.bundle.signedPreKeySignature,
      oneTimePreKey: bob.bundle.oneTimePreKeys[0],
    });
    const session1Resp = await x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      bob.oneTimePreKeyPairs[0],
      alice.bundle.identityKey,
      session1Init.ephemeralPublicKey,
    );

    // 第二次协商（使用 OPK[1]，每次发起产生新 EK）
    const session2Init = await x3dhInitiate(alice.identityKeyPair, {
      identityKey: bob.bundle.identityKey,
      signingIdentityKey: bob.bundle.signingIdentityKey,
      signedPreKey: bob.bundle.signedPreKey,
      signedPreKeySignature: bob.bundle.signedPreKeySignature,
      oneTimePreKey: bob.bundle.oneTimePreKeys[1],
    });
    const session2Resp = await x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      bob.oneTimePreKeyPairs[1],
      alice.bundle.identityKey,
      session2Init.ephemeralPublicKey,
    );

    // 每次协商应产生不同的 Root Key（因为使用不同 OPK + 不同 EK）
    expect(session1Init.rootKey).not.toBe(session2Init.rootKey);
    // 但每次双方应一致
    expect(session1Init.rootKey).toBe(session1Resp);
    expect(session2Init.rootKey).toBe(session2Resp);
  });
});
