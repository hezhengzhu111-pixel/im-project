import { describe, it, expect } from 'vitest';
import {
  generateKeyBundle,
  x3dhInitiate,
  x3dhRespond,
} from '@/features/e2ee/engine/x3dh';
import {
  importRootKey,
  initSendingChain,
  initReceivingChain,
  ratchetEncrypt,
  ratchetDecrypt,
} from '@/features/e2ee/engine/double-ratchet';
import type { RatchetHeader } from '@/features/e2ee/types';

/** 创建 Bob 的远程 Bundle（x3dhInitiate 需要 signingIdentityKey） */
function createRemoteBundle(bob: Awaited<ReturnType<typeof generateKeyBundle>>) {
  return {
    identityKey: bob.bundle.identityKey,
    signingIdentityKey: bob.bundle.signingIdentityKey,
    signedPreKey: bob.bundle.signedPreKey,
    signedPreKeySignature: bob.bundle.signedPreKeySignature,
    oneTimePreKey: bob.bundle.oneTimePreKeys[0],
  };
}

describe('Double Ratchet', () => {
  // ---------------------------------------------------------------------------
  // importRootKey
  // ---------------------------------------------------------------------------

  it('importRootKey converts Base64 root key to CryptoKey', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    expect(rootKey).toBeDefined();
    expect(rootKey.type).toBe('secret');
    expect(rootKey.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect(rootKey.extractable).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // initSendingChain / initReceivingChain
  // ---------------------------------------------------------------------------

  it('initSendingChain creates state with sending chain key', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    const state = await initSendingChain(rootKey, alice.identityKeyPair);

    expect(state.rootKey).toBeDefined();
    expect(state.sendingChainKey).not.toBeNull();
    expect(state.receivingChainKey).toBeNull();
    expect(state.sendCounter).toBe(0);
    expect(state.receiveCounter).toBe(0);
    expect(state.previousCounter).toBe(0);
    expect(state.remotePublicKey).toBeNull();
  });

  it('initReceivingChain creates state with receiving chain key', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    const state = await initReceivingChain(rootKey, bob.identityKeyPair);

    expect(state.rootKey).toBeDefined();
    expect(state.sendingChainKey).toBeNull();
    expect(state.receivingChainKey).not.toBeNull();
    expect(state.sendCounter).toBe(0);
    expect(state.receiveCounter).toBe(0);
    expect(state.remotePublicKey).toBeNull();
  });

  it('initSendingChain and initReceivingChain derive the same initial chain key', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    const aliceState = await initSendingChain(rootKey, alice.identityKeyPair);
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    // 双方的初始链密钥应该相同（使用相同的 HKDF info）
    const aliceChainRaw = await crypto.subtle.exportKey('raw', aliceState.sendingChainKey!);
    const bobChainRaw = await crypto.subtle.exportKey('raw', bobState.receivingChainKey!);

    const aliceHex = Buffer.from(new Uint8Array(aliceChainRaw)).toString('hex');
    const bobHex = Buffer.from(new Uint8Array(bobChainRaw)).toString('hex');
    expect(aliceHex).toBe(bobHex);
  });

  // ---------------------------------------------------------------------------
  // ratchetEncrypt
  // ---------------------------------------------------------------------------

  it('ratchetEncrypt produces valid header and ciphertext', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    const aliceState = await initSendingChain(rootKey, alice.identityKeyPair);

    const { header, ciphertext } = await ratchetEncrypt(aliceState, 'hello bob');

    // 验证 header 结构
    expect(header.counter).toBe(0);
    expect(header.previousCounter).toBe(0);
    expect(header.ratchetPublicKey).toBeTruthy();
    expect(header.iv).toBeTruthy();

    // 验证密文
    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toBe('hello bob');

    // 验证计数器递增
    expect(aliceState.sendCounter).toBe(1);
  });

  it('ratchetEncrypt throws when sending chain is not initialized', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    // Bob 的状态没有发送链
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    await expect(ratchetEncrypt(bobState, 'test')).rejects.toThrow(
      'Double Ratchet: sending chain not initialized',
    );
  });

  // ---------------------------------------------------------------------------
  // ratchetEncrypt + ratchetDecrypt — 完整往返
  // ---------------------------------------------------------------------------

  it('encrypt and decrypt round-trip after X3DH', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // X3DH 密钥协商
    const aliceResult = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );
    const bobRootKeyBase64 = await x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      bob.oneTimePreKeyPairs[0],
      alice.bundle.identityKey,
      aliceResult.ephemeralPublicKey,
    );

    // 验证双方派生出相同的根密钥
    expect(aliceResult.rootKey).toBe(bobRootKeyBase64);

    // 导入根密钥
    const rootKey = await importRootKey(aliceResult.rootKey);

    // 初始化棘轮状态
    const aliceState = await initSendingChain(rootKey, alice.identityKeyPair);
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    // Alice 加密
    const plaintext = 'hello bob, this is a secret message!';
    const { header, ciphertext } = await ratchetEncrypt(aliceState, plaintext);

    // Bob 解密
    const decrypted = await ratchetDecrypt(bobState, header, ciphertext);

    expect(decrypted).toBe(plaintext);
  });

  // ---------------------------------------------------------------------------
  // 多条消息按序加解密
  // ---------------------------------------------------------------------------

  it('encrypt and decrypt multiple messages in sequence', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // X3DH
    const aliceResult = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );
    await x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      bob.oneTimePreKeyPairs[0],
      alice.bundle.identityKey,
      aliceResult.ephemeralPublicKey,
    );

    const rootKey = await importRootKey(aliceResult.rootKey);
    const aliceState = await initSendingChain(rootKey, alice.identityKeyPair);
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    // Alice 连续发送 5 条消息
    const messages = [
      'message 1: hello',
      'message 2: how are you?',
      'message 3: this is encrypted',
      'message 4: forward secrecy!',
      'message 5: bye',
    ];

    const encrypted: { header: RatchetHeader; ciphertext: string }[] = [];
    for (const msg of messages) {
      encrypted.push(await ratchetEncrypt(aliceState, msg));
    }

    // 验证计数器递增
    expect(encrypted[0].header.counter).toBe(0);
    expect(encrypted[1].header.counter).toBe(1);
    expect(encrypted[2].header.counter).toBe(2);
    expect(encrypted[3].header.counter).toBe(3);
    expect(encrypted[4].header.counter).toBe(4);
    expect(aliceState.sendCounter).toBe(5);

    // Bob 按序解密
    for (let i = 0; i < messages.length; i++) {
      const decrypted = await ratchetDecrypt(bobState, encrypted[i].header, encrypted[i].ciphertext);
      expect(decrypted).toBe(messages[i]);
    }

    expect(bobState.receiveCounter).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // 每条消息使用不同的消息密钥
  // ---------------------------------------------------------------------------

  it('each message uses a different message key', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const aliceResult = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );
    await x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      bob.oneTimePreKeyPairs[0],
      alice.bundle.identityKey,
      aliceResult.ephemeralPublicKey,
    );

    const rootKey = await importRootKey(aliceResult.rootKey);
    const aliceState = await initSendingChain(rootKey, alice.identityKeyPair);

    // 相同明文应产生不同密文（因为每条消息使用不同密钥和 IV）
    const { ciphertext: ct1 } = await ratchetEncrypt(aliceState, 'same message');
    const { ciphertext: ct2 } = await ratchetEncrypt(aliceState, 'same message');

    expect(ct1).not.toBe(ct2);
  });

  // ---------------------------------------------------------------------------
  // X3DH 根密钥一致性验证
  // ---------------------------------------------------------------------------

  it('X3DH root key consistency enables successful decryption', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    // Alice 发起 X3DH
    const aliceResult = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    // Bob 响应 X3DH
    const bobRootKey = await x3dhRespond(
      bob.identityKeyPair,
      bob.signedPreKeyPair,
      bob.oneTimePreKeyPairs[0],
      alice.bundle.identityKey,
      aliceResult.ephemeralPublicKey,
    );

    // 关键断言: 双方派生出相同的根密钥
    expect(aliceResult.rootKey).toBe(bobRootKey);

    // 导入后应产生相同的 CryptoKey
    const aliceRootKey = await importRootKey(aliceResult.rootKey);
    const bobRootKeyCrypto = await importRootKey(bobRootKey);

    const aliceRaw = await crypto.subtle.exportKey('raw', aliceRootKey);
    const bobRaw = await crypto.subtle.exportKey('raw', bobRootKeyCrypto);

    expect(Buffer.from(new Uint8Array(aliceRaw)).toString('hex'))
      .toBe(Buffer.from(new Uint8Array(bobRaw)).toString('hex'));
  });

  // ---------------------------------------------------------------------------
  // 消息头结构验证
  // ---------------------------------------------------------------------------

  it('message header contains valid ratchet public key', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    const aliceState = await initSendingChain(rootKey, alice.identityKeyPair);

    const { header } = await ratchetEncrypt(aliceState, 'test');

    // ratchetPublicKey 应该是有效的 Base64 编码的 ECDH 公钥
    expect(header.ratchetPublicKey).toBeTruthy();
    const pubBytes = atob(header.ratchetPublicKey);
    expect(pubBytes.length).toBe(65); // P-256 非压缩公钥 65 字节

    // IV 应该是 12 字节
    const ivBytes = atob(header.iv);
    expect(ivBytes.length).toBe(12);
  });
});
