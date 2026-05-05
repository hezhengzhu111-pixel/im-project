import { describe, it, expect } from 'vitest';
import {
  generateSenderKey,
  splitSenderChainKey,
  senderKeyEncrypt,
  senderKeyDecrypt,
  serializeSenderKey,
  deserializeSenderKey,
} from '@/features/e2ee/engine/sender-key';
import type { SenderKey } from '@/features/e2ee/engine/sender-key';

describe('Sender Key', () => {
  // ---------------------------------------------------------------------------
  // generateSenderKey
  // ---------------------------------------------------------------------------

  it('generateSenderKey creates a valid SenderKey', async () => {
    const key = await generateSenderKey();

    expect(key.chainKey).toBeDefined();
    expect(key.chainKey).toBeInstanceOf(ArrayBuffer);
    expect(key.chainKey.byteLength).toBe(32);
    expect(key.signingKeyPair).toBeDefined();
    expect(key.signingKeyPair.privateKey).toBeDefined();
    expect(key.signingKeyPair.publicKey).toBeDefined();
    expect(key.counter).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // splitSenderChainKey
  // ---------------------------------------------------------------------------

  it('splitSenderChainKey derives messageKey and next chainKey', async () => {
    const key = await generateSenderKey();
    const { messageKey, chainKey } = await splitSenderChainKey(key.chainKey);

    expect(messageKey).toBeDefined();
    expect(messageKey.type).toBe('secret');
    expect(messageKey.algorithm).toEqual({ name: 'AES-GCM', length: 256 });

    expect(chainKey).toBeDefined();
    expect(chainKey).toBeInstanceOf(ArrayBuffer);
    expect(chainKey.byteLength).toBe(32);
  });

  it('splitSenderChainKey produces deterministic results for same input', async () => {
    const key = await generateSenderKey();

    const result1 = await splitSenderChainKey(key.chainKey);
    const result2 = await splitSenderChainKey(key.chainKey);

    const mk1 = await crypto.subtle.exportKey('raw', result1.messageKey);
    const mk2 = await crypto.subtle.exportKey('raw', result2.messageKey);
    expect(new Uint8Array(mk1)).toEqual(new Uint8Array(mk2));
    expect(new Uint8Array(result1.chainKey)).toEqual(new Uint8Array(result2.chainKey));
  });

  // ---------------------------------------------------------------------------
  // serialize / deserialize round-trip
  // ---------------------------------------------------------------------------

  it('serializeSenderKey and deserializeSenderKey round-trip', async () => {
    const original = await generateSenderKey();
    const serialized = await serializeSenderKey(original);

    expect(serialized.chainKey).toBeDefined();
    expect(typeof serialized.chainKey).toBe('string');
    expect(serialized.signingPrivateJwk).toBeDefined();
    expect(serialized.signingPublicJwk).toBeDefined();
    expect(serialized.counter).toBe(0);

    const restored = await deserializeSenderKey(serialized);
    expect(restored.chainKey).toBeInstanceOf(ArrayBuffer);
    expect(restored.chainKey.byteLength).toBe(32);
    expect(restored.signingKeyPair.privateKey).toBeDefined();
    expect(restored.signingKeyPair.publicKey).toBeDefined();
    expect(restored.counter).toBe(0);

    // Verify chainKey bytes match
    expect(new Uint8Array(restored.chainKey)).toEqual(new Uint8Array(original.chainKey));
  });

  // ---------------------------------------------------------------------------
  // Encrypt / Decrypt round-trip (same key)
  // ---------------------------------------------------------------------------

  it('encrypt and decrypt round-trip (same key instance)', async () => {
    const senderKey = await generateSenderKey();
    const plaintext = 'Hello, Sender Key!';

    // Serialize BEFORE encryption so the receiver gets the original chainKey
    const serialized = await serializeSenderKey(senderKey);
    const receiverKey = await deserializeSenderKey(serialized);

    const { header, ciphertext } = await senderKeyEncrypt(senderKey, plaintext);

    expect(header.signingPubkey).toBeDefined();
    expect(header.counter).toBe(0);
    expect(header.signature).toBeDefined();
    expect(header.iv).toBeDefined();
    expect(ciphertext).toBeDefined();
    expect(senderKey.counter).toBe(1);

    const decrypted = await senderKeyDecrypt(receiverKey, header, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  // ---------------------------------------------------------------------------
  // Encrypt / Decrypt via serialize/distribute
  // ---------------------------------------------------------------------------

  it('encrypt and decrypt round-trip via serialize/distribute', async () => {
    // Simulate: Alice generates sender key, distributes to Bob
    const aliceKey = await generateSenderKey();

    // Alice serializes the key (before encryption)
    const serialized = await serializeSenderKey(aliceKey);

    // Bob deserializes the key
    const bobKey = await deserializeSenderKey(serialized);

    // Alice encrypts a message
    const plaintext = 'Group message from Alice';
    const { header, ciphertext } = await senderKeyEncrypt(aliceKey, plaintext);

    // Bob decrypts the message
    const decrypted = await senderKeyDecrypt(bobKey, header, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  // ---------------------------------------------------------------------------
  // Multiple messages maintain counter order
  // ---------------------------------------------------------------------------

  it('multiple messages maintain counter order', async () => {
    const senderKey = await generateSenderKey();
    const messages = ['Message 1', 'Message 2', 'Message 3', 'Message 4', 'Message 5'];

    // Encrypt all messages
    const encrypted: Array<{ header: import('@/features/e2ee/types').SenderKeyHeader; ciphertext: string }> = [];
    for (const msg of messages) {
      const result = await senderKeyEncrypt(senderKey, msg);
      encrypted.push(result);
    }

    // Verify counters are sequential
    for (let i = 0; i < encrypted.length; i++) {
      expect(encrypted[i].header.counter).toBe(i);
    }

    // Verify sender counter is now at 5
    expect(senderKey.counter).toBe(5);

    // Create a new sender key, serialize it, then encrypt messages with the original,
    // decrypt with the deserialized copy
    const testKey = await generateSenderKey();
    const testSerialized = await serializeSenderKey(testKey);
    const testReceiver = await deserializeSenderKey(testSerialized);

    const testEncrypted: Array<{ header: import('@/features/e2ee/types').SenderKeyHeader; ciphertext: string }> = [];
    for (const msg of messages) {
      const result = await senderKeyEncrypt(testKey, msg);
      testEncrypted.push(result);
    }

    // Decrypt all messages in order
    for (let i = 0; i < messages.length; i++) {
      const decrypted = await senderKeyDecrypt(testReceiver, testEncrypted[i].header, testEncrypted[i].ciphertext);
      expect(decrypted).toBe(messages[i]);
    }

    // Both counters should be at 5
    expect(testKey.counter).toBe(5);
    expect(testReceiver.counter).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // Signature verification fails on tampered ciphertext
  // ---------------------------------------------------------------------------

  it('signature verification fails on tampered ciphertext', async () => {
    const senderKey = await generateSenderKey();
    const plaintext = 'Important message';

    const { header, ciphertext } = await senderKeyEncrypt(senderKey, plaintext);

    // Tamper with the ciphertext (flip a character)
    const tamperedCiphertext = ciphertext.slice(0, -2) + (ciphertext.endsWith('AB') ? 'CD' : 'AB');

    // Create receiver key
    const serialized = await serializeSenderKey(senderKey);
    const receiverKey = await deserializeSenderKey({ ...serialized, counter: 0 });

    // Decryption should fail due to signature mismatch
    await expect(
      senderKeyDecrypt(receiverKey, header, tamperedCiphertext),
    ).rejects.toThrow('Sender Key: signature verification failed');
  });

  it('signature verification fails on tampered counter', async () => {
    const senderKey = await generateSenderKey();
    const plaintext = 'Another message';

    const { header, ciphertext } = await senderKeyEncrypt(senderKey, plaintext);

    // Tamper with the counter in the header
    const tamperedHeader = { ...header, counter: header.counter + 1 };

    // Create receiver key
    const serialized = await serializeSenderKey(senderKey);
    const receiverKey = await deserializeSenderKey({ ...serialized, counter: 0 });

    // Decryption should fail due to signature mismatch (counter is part of signed data)
    await expect(
      senderKeyDecrypt(receiverKey, tamperedHeader, ciphertext),
    ).rejects.toThrow('Sender Key: signature verification failed');
  });

  // ---------------------------------------------------------------------------
  // Cross-party encrypt/decrypt (Alice encrypts, Bob decrypts)
  // ---------------------------------------------------------------------------

  it('cross-party: Alice encrypts multiple messages, Bob decrypts all', async () => {
    // Alice generates sender key
    const aliceKey = await generateSenderKey();

    // Distribute: serialize → transfer → deserialize
    const serialized = await serializeSenderKey(aliceKey);
    const bobKey = await deserializeSenderKey(serialized);

    // Alice sends 3 messages
    const msg1 = await senderKeyEncrypt(aliceKey, 'Hello Bob!');
    const msg2 = await senderKeyEncrypt(aliceKey, 'How are you?');
    const msg3 = await senderKeyEncrypt(aliceKey, 'Goodbye!');

    // Bob decrypts in order
    expect(await senderKeyDecrypt(bobKey, msg1.header, msg1.ciphertext)).toBe('Hello Bob!');
    expect(await senderKeyDecrypt(bobKey, msg2.header, msg2.ciphertext)).toBe('How are you?');
    expect(await senderKeyDecrypt(bobKey, msg3.header, msg3.ciphertext)).toBe('Goodbye!');

    // Both counters should be at 3
    expect(aliceKey.counter).toBe(3);
    expect(bobKey.counter).toBe(3);
  });
});
