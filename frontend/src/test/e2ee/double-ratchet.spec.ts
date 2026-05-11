import 'fake-indexeddb/auto';
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
import { saveRatchetState, getRatchetState } from '@/features/e2ee/store/session-store';
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
    expect(state.receivingChainKey).not.toBeNull();
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
    expect(state.sendingChainKey).not.toBeNull();
    expect(state.receivingChainKey).not.toBeNull();
    expect(state.sendCounter).toBe(0);
    expect(state.receiveCounter).toBe(0);
    expect(state.remotePublicKey).toBeNull();
  });

  it('initSendingChain creates a persistable ratchet state', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    const state = await initSendingChain(rootKey, alice.identityKeyPair);

    await saveRatchetState('persistable_sending_chain', state);
    const restored = await getRatchetState('persistable_sending_chain');

    expect(restored).not.toBeNull();
    expect(restored!.sendingChainKey).not.toBeNull();
    expect(restored!.dhKeyPair.privateKey.extractable).toBe(false);
  });

  it('initSendingChain and initReceivingChain derive matching initial chain keys', async () => {
    const alice = await generateKeyBundle();
    const bob = await generateKeyBundle();

    const { rootKey: rootKeyBase64 } = await x3dhInitiate(
      alice.identityKeyPair,
      createRemoteBundle(bob),
    );

    const rootKey = await importRootKey(rootKeyBase64);
    const aliceState = await initSendingChain(rootKey, alice.identityKeyPair);
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    const aliceSendRaw = await crypto.subtle.exportKey('raw', aliceState.sendingChainKey!);
    const bobReceiveRaw = await crypto.subtle.exportKey('raw', bobState.receivingChainKey!);
    const bobSendRaw = await crypto.subtle.exportKey('raw', bobState.sendingChainKey!);
    const aliceReceiveRaw = await crypto.subtle.exportKey('raw', aliceState.receivingChainKey!);

    const aliceSendHex = Buffer.from(new Uint8Array(aliceSendRaw)).toString('hex');
    const bobReceiveHex = Buffer.from(new Uint8Array(bobReceiveRaw)).toString('hex');
    const bobSendHex = Buffer.from(new Uint8Array(bobSendRaw)).toString('hex');
    const aliceReceiveHex = Buffer.from(new Uint8Array(aliceReceiveRaw)).toString('hex');

    expect(aliceSendHex).toBe(bobReceiveHex);
    expect(bobSendHex).toBe(aliceReceiveHex);
    expect(aliceSendHex).not.toBe(aliceReceiveHex);
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
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);
    bobState.sendingChainKey = null;

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

  it('supports bidirectional first messages after X3DH', async () => {
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
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    const aliceMessage = await ratchetEncrypt(aliceState, 'hello bob');
    expect(await ratchetDecrypt(bobState, aliceMessage.header, aliceMessage.ciphertext))
      .toBe('hello bob');

    const bobMessage = await ratchetEncrypt(bobState, 'hello alice');
    expect(await ratchetDecrypt(aliceState, bobMessage.header, bobMessage.ciphertext))
      .toBe('hello alice');
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

  // ---------------------------------------------------------------------------
  // DH 轮换测试
  // ---------------------------------------------------------------------------

  it('DH ratchet rotation: new remote public key triggers ratchet step', async () => {
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
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    // --- 第一轮: Alice → Bob (使用初始发送链) ---
    const msg1 = await ratchetEncrypt(aliceState, 'round 1 msg 1');
    const msg2 = await ratchetEncrypt(aliceState, 'round 1 msg 2');
    expect(await ratchetDecrypt(bobState, msg1.header, msg1.ciphertext)).toBe('round 1 msg 1');
    expect(await ratchetDecrypt(bobState, msg2.header, msg2.ciphertext)).toBe('round 1 msg 2');

    // 记录 Alice 当前的 ratchet 公钥
    const alicePubKey1 = msg1.header.ratchetPublicKey;
    expect(msg2.header.ratchetPublicKey).toBe(alicePubKey1); // 同一轮，公钥相同

    // --- 模拟 Alice 发送带新 DH 公钥的消息 ---
    // Alice 生成新 DH 密钥对，用当前 rootKey + ECDH(newPriv, bobPub) 派生新发送链
    // 这与 Bob 的 performDhRatchet step 1 (接收方向) 完全对称:
    //   Bob: dh = ECDH(bob.priv, aliceNewPub) → recvChain = HKDF(rootKey_raw||dh, salt, INFO)
    //   Alice: dh = ECDH(aliceNew.priv, bob.pub) → sendChain = HKDF(rootKey_raw||dh, salt, INFO)
    // 由于 ECDH 交换律: ECDH(bob.priv, aliceNew.pub) == ECDH(aliceNew.priv, bob.pub)
    // 且双方使用相同的 rootKey，所以 sendChain == recvChain ✓
    const { generateEphemeralKeyPair: genNewKeyPair } = await import(
      '@/features/e2ee/engine/crypto-primitives'
    );
    const { ecdhDeriveBits: ecdh, hkdfDeriveKey: hkdf } = await import(
      '@/features/e2ee/engine/crypto-primitives'
    );

    const HKDF_SALT = new Uint8Array(0).buffer as ArrayBuffer;
    const INFO_ROOT_KEY = new TextEncoder().encode('RootKey').buffer as ArrayBuffer;
    const INFO_CHAIN = new TextEncoder().encode('SendingChainKey').buffer as ArrayBuffer;

    // 生成新 DH 密钥对
    const newKeyPair = await genNewKeyPair();

    // ECDH(newPriv, bob.pub) — 与 Bob 的 ECDH(bob.priv, newPub) 相同（交换律）
    const dh = await ecdh(newKeyPair.privateKey, bobState.dhKeyPair.publicKey);
    const rootKeyRaw = await crypto.subtle.exportKey('raw', aliceState.rootKey);
    const kdfInput = new Uint8Array(rootKeyRaw.byteLength + dh.byteLength);
    kdfInput.set(new Uint8Array(rootKeyRaw), 0);
    kdfInput.set(new Uint8Array(dh), rootKeyRaw.byteLength);

    // 派生新 rootKey 和发送链（与 performDhRatchet step 1 使用相同参数）
    const newRootKey = await hkdf(kdfInput.buffer as ArrayBuffer, HKDF_SALT, INFO_ROOT_KEY);
    const newSendingChainKey = await hkdf(kdfInput.buffer as ArrayBuffer, HKDF_SALT, INFO_CHAIN);

    // 更新 Alice 状态
    aliceState.rootKey = newRootKey;
    aliceState.sendingChainKey = newSendingChainKey;
    aliceState.dhKeyPair = newKeyPair;
    aliceState.previousCounter = aliceState.sendCounter;
    aliceState.sendCounter = 0;

    // --- 第二轮: Alice → Bob (使用新发送链和新密钥对) ---
    const msg3 = await ratchetEncrypt(aliceState, 'round 2 msg 1');

    // 验证 ratchet 公钥已变化
    expect(msg3.header.ratchetPublicKey).not.toBe(alicePubKey1);

    // Bob 解密: 检测到新公钥 → 触发 performDhRatchet → 成功解密
    expect(await ratchetDecrypt(bobState, msg3.header, msg3.ciphertext)).toBe('round 2 msg 1');
    expect(bobState.receiveCounter).toBe(1); // DH 轮换后 receiveCounter 重置
    expect(bobState.sendingChainKey).not.toBeNull(); // Bob 也获得发送链
  });

  // ---------------------------------------------------------------------------
  // 乱序消息解密测试
  // ---------------------------------------------------------------------------

  it('out-of-order messages are decryptable via skipped message key cache', async () => {
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
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    // Alice 发送 5 条消息
    const msgs = ['msg 0', 'msg 1', 'msg 2', 'msg 3', 'msg 4'];
    const encrypted: { header: RatchetHeader; ciphertext: string }[] = [];
    for (const msg of msgs) {
      encrypted.push(await ratchetEncrypt(aliceState, msg));
    }

    // Bob 先收到第 3 条消息（counter=2），产生 counter gap
    // receiveCounter=0, targetCounter=2 → 跳过 counter 0 和 1，缓存其消息密钥
    const dec3 = await ratchetDecrypt(bobState, encrypted[2].header, encrypted[2].ciphertext);
    expect(dec3).toBe('msg 2');

    // Bob 收到之前跳过的第 0 条消息（从缓存解密）
    const dec1 = await ratchetDecrypt(bobState, encrypted[0].header, encrypted[0].ciphertext);
    expect(dec1).toBe('msg 0');

    // Bob 收到之前跳过的第 1 条消息（从缓存解密）
    const dec2 = await ratchetDecrypt(bobState, encrypted[1].header, encrypted[1].ciphertext);
    expect(dec2).toBe('msg 1');

    // Bob 收到第 4 条消息（counter=3），正常推进
    const dec4 = await ratchetDecrypt(bobState, encrypted[3].header, encrypted[3].ciphertext);
    expect(dec4).toBe('msg 3');

    // Bob 收到第 5 条消息（counter=4），正常推进
    const dec5 = await ratchetDecrypt(bobState, encrypted[4].header, encrypted[4].ciphertext);
    expect(dec5).toBe('msg 4');

    // 验证所有 5 条消息都成功解密
    expect(bobState.receiveCounter).toBe(5);
    expect(bobState.skippedMessageKeys.size).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // AES-GCM AAD 篡改检测测试
  // ---------------------------------------------------------------------------

  it('AES-GCM AAD prevents header tampering', async () => {
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
    const bobState = await initReceivingChain(rootKey, bob.identityKeyPair);

    const { header, ciphertext } = await ratchetEncrypt(aliceState, 'tamper test');

    // 篡改 counter（修改 AAD 中的字段）
    const tamperedHeader: RatchetHeader = { ...header, counter: header.counter + 1 };

    // 解密应该失败（AAD 不匹配）
    await expect(ratchetDecrypt(bobState, tamperedHeader, ciphertext)).rejects.toThrow();
  });
});
