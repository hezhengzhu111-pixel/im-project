/**
 * E2EE 密钥存储测试
 *
 * 使用 fake-indexeddb polyfill 模拟 jsdom 中缺失的 IndexedDB。
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveIdentityKeyPair,
  getIdentityKeyPair,
  hasIdentityKey,
  saveSignedPreKey,
  getSignedPreKey,
  saveDeviceId,
  getDeviceId,
  clearAllKeys,
} from '@/features/e2ee/store/key-store';
import { generateIdentityKeyPair, generateSignedPreKeyPair } from '@/features/e2ee/engine/crypto-primitives';

describe('e2ee key-store', () => {
  // 每个测试前清空所有密钥，保证隔离性
  beforeEach(async () => {
    await clearAllKeys();
  });

  // -----------------------------------------------------------------------
  // Identity Key Pair — structured clone (extractable: false)
  // -----------------------------------------------------------------------

  it('save and retrieve Identity Key pair', async () => {
    const original = await generateIdentityKeyPair();
    await saveIdentityKeyPair(original);

    const retrieved = await getIdentityKeyPair();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.privateKey.type).toBe('private');
    expect(retrieved!.publicKey.type).toBe('public');
    // Identity Key 保持 extractable: false
    expect(retrieved!.privateKey.extractable).toBe(false);
    expect(retrieved!.privateKey.algorithm).toMatchObject({ namedCurve: 'P-256' });
  });

  it('hasIdentityKey returns false when no key exists', async () => {
    expect(await hasIdentityKey()).toBe(false);
  });

  it('hasIdentityKey returns true after saving', async () => {
    const kp = await generateIdentityKeyPair();
    await saveIdentityKeyPair(kp);
    expect(await hasIdentityKey()).toBe(true);
  });

  it('getIdentityKeyPair returns null when no key exists', async () => {
    const result = await getIdentityKeyPair();
    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Signed Pre Key — JWK + raw public key (extractable: true)
  // -----------------------------------------------------------------------

  it('save and retrieve Signed Pre Key pair', async () => {
    const original = await generateSignedPreKeyPair();
    await saveSignedPreKey(1, original);

    const retrieved = await getSignedPreKey(1);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.privateKey.type).toBe('private');
    expect(retrieved!.publicKey.type).toBe('public');
    expect(retrieved!.privateKey.algorithm).toMatchObject({ namedCurve: 'P-256' });
  });

  it('getSignedPreKey returns null for non-existent id', async () => {
    const result = await getSignedPreKey(999);
    expect(result).toBeNull();
  });

  it('Signed Pre Key can be used for ECDH after retrieval', async () => {
    const original = await generateSignedPreKeyPair();
    await saveSignedPreKey(2, original);

    const retrieved = await getSignedPreKey(2);
    expect(retrieved).not.toBeNull();

    // 用恢复的密钥执行 ECDH 派生，验证可用性
    const other = await generateSignedPreKeyPair();
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: other.publicKey },
      retrieved!.privateKey,
      256,
    );
    expect(sharedSecret.byteLength).toBe(32);
  });

  // -----------------------------------------------------------------------
  // Device ID
  // -----------------------------------------------------------------------

  it('save and retrieve Device ID', async () => {
    await saveDeviceId('device-abc-123');
    const id = await getDeviceId();
    expect(id).toBe('device-abc-123');
  });

  it('getDeviceId returns undefined when not set', async () => {
    const id = await getDeviceId();
    expect(id).toBeUndefined();
  });

  it('saveDeviceId overwrites previous value', async () => {
    await saveDeviceId('old-device');
    await saveDeviceId('new-device');
    const id = await getDeviceId();
    expect(id).toBe('new-device');
  });

  // -----------------------------------------------------------------------
  // clearAllKeys
  // -----------------------------------------------------------------------

  it('clearAllKeys removes all stored keys', async () => {
    const kp = await generateIdentityKeyPair();
    await saveIdentityKeyPair(kp);
    await saveDeviceId('test-device');

    expect(await hasIdentityKey()).toBe(true);
    expect(await getDeviceId()).toBe('test-device');

    await clearAllKeys();

    expect(await hasIdentityKey()).toBe(false);
    expect(await getDeviceId()).toBeUndefined();
  });
});
