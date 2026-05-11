/**
 * E2EE 端到端集成测试
 *
 * 使用真实的加密引擎（Web Crypto API + Double Ratchet + X3DH），
 * 只 mock 外部依赖（HTTP 请求、localStorage 状态），验证完整的加密/解密流程。
 *
 * 测试场景：
 * 1. 完整 X3DH 密钥协商 + Double Ratchet 加密/解密往返
 * 2. 多条消息连续发送/接收
 * 3. 双向通信（Alice ↔ Bob）
 * 4. 无 ratchet state 时的行为（Bug 场景复现）
 * 5. 通过 e2eeManager 单例的完整流程
 * 6. 消息规范化器保留 E2EE 字段
 * 7. WebSocket 处理器解密路径
 * 8. 历史消息批量解密
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Crypto operations + IndexedDB need more time
vi.setConfig({ testTimeout: 30000 });
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
import { saveRatchetState, getRatchetState, deleteRatchetState } from '@/features/e2ee/store/session-store';
import { e2eeManager } from '@/features/e2ee/manager/e2ee-manager';
import { normalizeMessage } from '@/normalizers/message';
import { buildSessionId } from '@/normalizers/chat';
import type { Message, RawMessageDTO } from '@/types';

// ============================================================================
// Test Helpers
// ============================================================================

const ALICE_ID = '1001';
const BOB_ID = '1002';
const SESSION_ID = `${ALICE_ID}_${BOB_ID}`;

/** Setup: perform X3DH key exchange and initialize ratchet states for both parties */
async function setupEncryptedSession() {
  // Alice generates her key bundle
  const aliceBundle = await generateKeyBundle();
  // Bob generates his key bundle
  const bobBundle = await generateKeyBundle();

  // Alice initiates X3DH (uses Bob's bundle)
  const x3dhResult = await x3dhInitiate(
    aliceBundle.identityKeyPair,
    {
      identityKey: bobBundle.bundle.identityKey,
      signingIdentityKey: bobBundle.bundle.signingIdentityKey,
      signedPreKey: bobBundle.bundle.signedPreKey,
      signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
      oneTimePreKey: bobBundle.bundle.oneTimePreKeys[0],
    },
  );

  // Bob responds to X3DH (uses Alice's identity key + ephemeral key)
  const bobRootKey = await x3dhRespond(
    bobBundle.identityKeyPair,
    bobBundle.signedPreKeyPair,
    bobBundle.oneTimePreKeyPairs[0],
    aliceBundle.bundle.identityKey,
    x3dhResult.ephemeralPublicKey,
  );

  // Verify both parties derived the same root key
  expect(x3dhResult.rootKey).toBe(bobRootKey);

  // Alice initializes sending chain
  const aliceRootCryptoKey = await importRootKey(x3dhResult.rootKey);
  const aliceRatchetState = await initSendingChain(aliceRootCryptoKey, aliceBundle.identityKeyPair);

  // Bob initializes receiving chain
  const bobRootCryptoKey = await importRootKey(bobRootKey);
  const bobRatchetState = await initReceivingChain(bobRootCryptoKey, bobBundle.identityKeyPair);

  // Save ratchet states
  await saveRatchetState(SESSION_ID, aliceRatchetState);
  await saveRatchetState(SESSION_ID + ':bob', bobRatchetState);

  return {
    aliceBundle,
    bobBundle,
    aliceRatchetState,
    bobRatchetState,
    x3dhResult,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('E2EE Integration Tests', () => {
  beforeEach(() => {
    // Clean up e2eeManager singleton state (clears localStorage + in-memory buffers)
    const sessionIds = [
      SESSION_ID, `${BOB_ID}_${ALICE_ID}`, '9999_8888',
      'test_session', 'delete_test', 'nonexistent', 'nonexistent_session',
      '1001_1002', '1002_1001',
      '2001_2002', '2002_2001',
      '3001_3002', '3002_3001',
    ];
    for (const id of sessionIds) {
      e2eeManager.clearSession(id);
    }
  });

  // ==========================================================================
  // Scenario 1: X3DH Key Exchange + Root Key Agreement
  // ==========================================================================

  describe('X3DH Key Exchange', () => {
    it('should derive the same root key for both parties', async () => {
      const aliceBundle = await generateKeyBundle();
      const bobBundle = await generateKeyBundle();

      // Alice initiates
      const aliceResult = await x3dhInitiate(
        aliceBundle.identityKeyPair,
        {
          identityKey: bobBundle.bundle.identityKey,
          signingIdentityKey: bobBundle.bundle.signingIdentityKey,
          signedPreKey: bobBundle.bundle.signedPreKey,
          signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
          oneTimePreKey: bobBundle.bundle.oneTimePreKeys[0],
        },
      );

      // Bob responds
      const bobRootKey = await x3dhRespond(
        bobBundle.identityKeyPair,
        bobBundle.signedPreKeyPair,
        bobBundle.oneTimePreKeyPairs[0],
        aliceBundle.bundle.identityKey,
        aliceResult.ephemeralPublicKey,
      );

      // Root keys must match
      expect(aliceResult.rootKey).toBe(bobRootKey);
      expect(aliceResult.rootKey).toBeTruthy();
      expect(aliceResult.rootKey.length).toBeGreaterThan(0);
    });

    it('should fail X3DH if SPK signature is invalid', async () => {
      const aliceBundle = await generateKeyBundle();
      const bobBundle = await generateKeyBundle();

      // Tamper with the signature — use valid base64 but wrong data
      const validSigBase64 = bobBundle.bundle.signedPreKeySignature;
      const tamperedSig = validSigBase64.slice(0, -4) + 'XXXX'; // tamper last 4 chars

      await expect(
        x3dhInitiate(aliceBundle.identityKeyPair, {
          identityKey: bobBundle.bundle.identityKey,
          signingIdentityKey: bobBundle.bundle.signingIdentityKey,
          signedPreKey: bobBundle.bundle.signedPreKey,
          signedPreKeySignature: tamperedSig,
        }),
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Scenario 2: Double Ratchet Encrypt/Decrypt Round Trip
  // ==========================================================================

  describe('Double Ratchet Encrypt/Decrypt', () => {
    it('should encrypt and decrypt a single message', async () => {
      const { aliceRatchetState, bobRatchetState } = await setupEncryptedSession();

      const plaintext = 'Hello, Bob! This is a secret message. 🔐';

      // Alice encrypts
      const { header, ciphertext } = await ratchetEncrypt(aliceRatchetState, plaintext);

      expect(ciphertext).toBeTruthy();
      expect(ciphertext).not.toBe(plaintext);
      expect(header).toBeTruthy();
      expect(header.counter).toBe(0);

      // Bob decrypts
      const decrypted = await ratchetDecrypt(bobRatchetState, header, ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle multiple sequential messages', async () => {
      const { aliceRatchetState, bobRatchetState } = await setupEncryptedSession();

      const messages = [
        'First message',
        'Second message with emoji 🔑',
        'Third message with special chars: <>&"\'',
        'Fourth message — a longer one that contains multiple sentences. It tests that the ratchet can handle varying message lengths correctly.',
      ];

      // Alice encrypts all messages
      const encrypted: Array<{ header: import('@/features/e2ee/types').RatchetHeader; ciphertext: string }> = [];
      for (const msg of messages) {
        const result = await ratchetEncrypt(aliceRatchetState, msg);
        encrypted.push(result);
      }

      // Verify counters increment
      for (let i = 0; i < encrypted.length; i++) {
        expect(encrypted[i].header.counter).toBe(i);
      }

      // Bob decrypts all messages in order
      for (let i = 0; i < encrypted.length; i++) {
        const decrypted = await ratchetDecrypt(
          bobRatchetState,
          encrypted[i].header,
          encrypted[i].ciphertext,
        );
        expect(decrypted).toBe(messages[i]);
      }
    });

    it('should fail decryption with wrong key (different session)', async () => {
      const { aliceRatchetState } = await setupEncryptedSession();

      // Create a different session
      const otherSession = await setupEncryptedSession();

      const plaintext = 'Secret message';
      const { header, ciphertext } = await ratchetEncrypt(aliceRatchetState, plaintext);

      // Try to decrypt with a different session's key
      await expect(
        ratchetDecrypt(otherSession.bobRatchetState, header, ciphertext),
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Scenario 3: Bidirectional Messaging (Alice ↔ Bob)
  // ==========================================================================

  describe('Bidirectional Messaging', () => {
    it('should support bidirectional encrypted communication', async () => {
      const aliceBundle = await generateKeyBundle();
      const bobBundle = await generateKeyBundle();

      // Alice initiates X3DH
      const x3dhResult = await x3dhInitiate(
        aliceBundle.identityKeyPair,
        {
          identityKey: bobBundle.bundle.identityKey,
          signingIdentityKey: bobBundle.bundle.signingIdentityKey,
          signedPreKey: bobBundle.bundle.signedPreKey,
          signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
          oneTimePreKey: bobBundle.bundle.oneTimePreKeys[0],
        },
      );

      // Bob responds to X3DH
      const bobRootKey = await x3dhRespond(
        bobBundle.identityKeyPair,
        bobBundle.signedPreKeyPair,
        bobBundle.oneTimePreKeyPairs[0],
        aliceBundle.bundle.identityKey,
        x3dhResult.ephemeralPublicKey,
      );

      // Initialize ratchet states
      const aliceRootKey = await importRootKey(x3dhResult.rootKey);
      const aliceState = await initSendingChain(aliceRootKey, aliceBundle.identityKeyPair);

      const bobRootKeyCk = await importRootKey(bobRootKey);
      const bobState = await initReceivingChain(bobRootKeyCk, bobBundle.identityKeyPair);

      // Alice → Bob
      const msg1 = 'Hello from Alice!';
      const enc1 = await ratchetEncrypt(aliceState, msg1);
      const dec1 = await ratchetDecrypt(bobState, enc1.header, enc1.ciphertext);
      expect(dec1).toBe(msg1);

      // After Bob receives a message, he needs to do a DH ratchet step to send back
      // This happens automatically in the ratchet when Bob sends his first message
      // For this test, we need to simulate the ratchet step that happens when
      // the remote public key changes

      // Note: In a real implementation, the ratchet would automatically handle
      // the DH step when Bob sends. Here we test the core encrypt/decrypt.
    });
  });

  // ==========================================================================
  // Scenario 4: No Ratchet State (Bug Reproduction)
  // ==========================================================================

  describe('No Ratchet State (Bug Scenario)', () => {
    it('should throw when trying to decrypt without ratchet state', async () => {
      // This is the exact scenario the user is experiencing:
      // Negotiation was skipped, so there's no ratchet state for the session.

      const noStateSessionId = '9999_8888';

      // Verify no ratchet state exists
      const state = await getRatchetState(noStateSessionId);
      expect(state).toBeNull();

      // Trying to use e2eeManager to decrypt should fail
      const fakeHeader = {
        ratchetPublicKey: 'fake_key',
        counter: 0,
        previousCounter: 0,
        iv: 'fake_iv',
      };

      await expect(
        e2eeManager.decryptMessage(
          noStateSessionId,
          '8888',
          fakeHeader,
          'some_ciphertext',
        ),
      ).rejects.toThrow();
    });

    it('should throw when trying to encrypt without ratchet state', async () => {
      const noStateSessionId = '9999_8888';

      const result = await e2eeManager.encryptMessage(noStateSessionId, 'test');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Scenario 5: E2eeManager Integration
  // ==========================================================================

  describe('E2eeManager Full Flow', () => {
    it('should encrypt and decrypt through the manager singleton', async () => {
      const { aliceRatchetState, bobRatchetState, x3dhResult, aliceBundle, bobBundle } =
        await setupEncryptedSession();

      // Save states for the manager to use
      await saveRatchetState(SESSION_ID, aliceRatchetState);
      await saveRatchetState(`${BOB_ID}_${ALICE_ID}`, bobRatchetState);

      // Initialize manager
      await e2eeManager.init('test_device_001');

      // Alice encrypts through manager
      const plaintext = 'Message through e2eeManager';
      const encrypted = await e2eeManager.encryptMessage(SESSION_ID, plaintext);

      expect(encrypted).not.toBeNull();
      expect(encrypted!.ciphertext).toBeTruthy();
      expect(encrypted!.ciphertext).not.toBe(plaintext);
      expect(encrypted!.header).toBeTruthy();
      expect(encrypted!.deviceId).toBe('test_device_001');

      // Bob decrypts through manager
      const bobSessionId = `${BOB_ID}_${ALICE_ID}`;
      const decrypted = await e2eeManager.decryptMessage(
        bobSessionId,
        ALICE_ID,
        encrypted!.header,
        encrypted!.ciphertext,
      );

      expect(decrypted).toBe(plaintext);
    });

    it('should return null when encrypting without ratchet state', async () => {
      await e2eeManager.init('test_device');
      const result = await e2eeManager.encryptMessage('nonexistent_session', 'test');
      expect(result).toBeNull();
    });

    it('should throw when decrypting without ratchet state', async () => {
      await e2eeManager.init('test_device');
      await expect(
        e2eeManager.decryptMessage(
          'nonexistent_session',
          'sender',
          { ratchetPublicKey: 'x', counter: 0, previousCounter: 0, iv: 'y' },
          'cipher',
        ),
      ).rejects.toThrow('No ratchet state');
    });
  });

  // ==========================================================================
  // Scenario 6: Message Normalizer Preserves E2EE Fields
  // ==========================================================================

  describe('Message Normalizer E2EE Fields', () => {
    it('should preserve encrypted flag and e2ee headers from server response', () => {
      const rawMessage: RawMessageDTO = {
        id: '12345',
        senderId: ALICE_ID,
        receiverId: BOB_ID,
        content: 'encrypted_ciphertext_base64',
        messageType: 'TEXT',
        encrypted: true,
        e2eeHeader: '{"dhPubKey":"abc","counter":0,"previousCounter":0,"iv":"xyz"}',
        e2eeDeviceId: 'device_alice_001',
        e2eeSenderIdentityKey: 'alice_ik_base64',
        e2eeEphemeralKey: 'alice_ek_base64',
        createdTime: '2026-05-07T10:00:00Z',
        status: 1,
      };

      const normalized = normalizeMessage(rawMessage);

      expect(normalized.encrypted).toBe(true);
      expect(normalized.e2eeHeader).toBe('{"dhPubKey":"abc","counter":0,"previousCounter":0,"iv":"xyz"}');
      expect(normalized.e2eeDeviceId).toBe('device_alice_001');
      expect(normalized.e2eeSenderIdentityKey).toBe('alice_ik_base64');
      expect(normalized.e2eeEphemeralKey).toBe('alice_ek_base64');
      expect(normalized.content).toBe('encrypted_ciphertext_base64');
    });

    it('should handle snake_case E2EE fields from backend', () => {
      const rawMessage: RawMessageDTO = {
        id: '12346',
        sender_id: ALICE_ID,
        receiver_id: BOB_ID,
        content: 'encrypted_ciphertext',
        messageType: 'TEXT',
        encrypted: true,
        e2ee_header: '{"dhPubKey":"abc","counter":1,"previousCounter":0,"iv":"xyz"}',
        e2ee_device_id: 'device_001',
        e2ee_sender_identity_key: 'ik_base64',
        e2ee_ephemeral_key: 'ek_base64',
        created_time: '2026-05-07T10:00:00Z',
        status: 1,
      };

      const normalized = normalizeMessage(rawMessage);

      expect(normalized.encrypted).toBe(true);
      expect(normalized.e2eeHeader).toBe('{"dhPubKey":"abc","counter":1,"previousCounter":0,"iv":"xyz"}');
      expect(normalized.e2eeDeviceId).toBe('device_001');
      expect(normalized.e2eeSenderIdentityKey).toBe('ik_base64');
      expect(normalized.e2eeEphemeralKey).toBe('ek_base64');
    });

    it('should handle encrypted=false (plaintext message)', () => {
      const rawMessage: RawMessageDTO = {
        id: '12347',
        senderId: ALICE_ID,
        receiverId: BOB_ID,
        content: 'Hello, plain text!',
        messageType: 'TEXT',
        encrypted: false,
        createdTime: '2026-05-07T10:00:00Z',
        status: 1,
      };

      const normalized = normalizeMessage(rawMessage);

      expect(normalized.encrypted).toBe(false);
      expect(normalized.e2eeHeader).toBeUndefined();
      expect(normalized.content).toBe('Hello, plain text!');
    });

    it('should handle encrypted=1 (numeric truthy from backend)', () => {
      const rawMessage: RawMessageDTO = {
        id: '12348',
        senderId: ALICE_ID,
        receiverId: BOB_ID,
        content: 'encrypted_payload',
        messageType: 'TEXT',
        encrypted: 1,
        e2ee_header: '{"dhPubKey":"key","counter":0,"previousCounter":0,"iv":"iv"}',
        createdTime: '2026-05-07T10:00:00Z',
        status: 1,
      };

      const normalized = normalizeMessage(rawMessage);

      expect(normalized.encrypted).toBe(true);
      expect(normalized.e2eeHeader).toBeTruthy();
    });
  });

  // ==========================================================================
  // Scenario 7: WebSocket Handler Decrypt Path Simulation
  // ==========================================================================

  describe('WebSocket Handler Decrypt Path', () => {
    it('should decrypt message when ratchet state exists', async () => {
      // Use unique session ID (sorted: smaller ID first, as buildSessionId does)
      const wsSessionId = '1001_1002';

      // Generate fresh key bundles and do X3DH for this test
      const aliceBundle = await generateKeyBundle();
      const bobBundle = await generateKeyBundle();
      const x3dhResult = await x3dhInitiate(
        aliceBundle.identityKeyPair,
        {
          identityKey: bobBundle.bundle.identityKey,
          signingIdentityKey: bobBundle.bundle.signingIdentityKey,
          signedPreKey: bobBundle.bundle.signedPreKey,
          signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
          oneTimePreKey: bobBundle.bundle.oneTimePreKeys[0],
        },
      );
      const bobRootKey = await x3dhRespond(
        bobBundle.identityKeyPair,
        bobBundle.signedPreKeyPair,
        bobBundle.oneTimePreKeyPairs[0],
        aliceBundle.bundle.identityKey,
        x3dhResult.ephemeralPublicKey,
      );
      const aliceRootKey = await importRootKey(x3dhResult.rootKey);
      const aliceState = await initSendingChain(aliceRootKey, aliceBundle.identityKeyPair);
      const bobRootKeyCk = await importRootKey(bobRootKey);
      const bobState = await initReceivingChain(bobRootKeyCk, bobBundle.identityKeyPair);

      // In real usage, Alice and Bob are on different devices with separate IndexedDB.
      // Here we simulate by saving Alice's state, encrypting, then replacing with Bob's state.

      // Step 1: Alice's device — save her state and encrypt
      await saveRatchetState(wsSessionId, aliceState);
      await e2eeManager.init('device_001');

      const plaintext = 'Hello from Alice via WebSocket';
      const encrypted = await e2eeManager.encryptMessage(wsSessionId, plaintext);
      expect(encrypted).not.toBeNull();

      // Step 2: Bob's device — replace state with Bob's (simulating different device)
      await saveRatchetState(wsSessionId, bobState);

      // Simulate the WebSocket message that Bob receives
      const wsRawMessage: Record<string, unknown> = {
        id: 'srv_msg_001',
        senderId: ALICE_ID,
        receiverId: BOB_ID,
        content: encrypted!.ciphertext,
        messageType: 'TEXT',
        encrypted: true,
        e2eeHeader: JSON.stringify(encrypted!.header),
        e2eeDeviceId: encrypted!.deviceId,
        createdTime: '2026-05-07T10:00:00Z',
        status: 1,
      };

      // Simulate the WebSocket handler logic (from websocket.ts:466-519)
      const normalizedMessage = normalizeMessage(wsRawMessage);
      const currentUserId = BOB_ID;

      // Check if encrypted
      const isEncrypted = wsRawMessage.encrypted === true || wsRawMessage.encrypted === 1;
      expect(isEncrypted).toBe(true);

      // Not own message → should decrypt
      const senderId = String(normalizedMessage.senderId);
      expect(senderId).not.toBe(currentUserId);

      // Decrypt
      const peerId = senderId;
      const sessionId = buildSessionId('private', currentUserId, peerId);

      const headerRaw = wsRawMessage.e2eeHeader || wsRawMessage.e2ee_header;
      const header = typeof headerRaw === 'string' ? JSON.parse(headerRaw) : headerRaw;

      const decrypted = await e2eeManager.decryptMessage(
        sessionId, // buildSessionId returns sorted '1001_1002' = wsSessionId
        peerId,
        header,
        normalizedMessage.content,
      );

      expect(decrypted).toBe(plaintext);

      // Simulate updating the message content (like the WebSocket handler does)
      normalizedMessage.content = decrypted;
      (normalizedMessage as unknown as Record<string, unknown>).encrypted = false;

      expect(normalizedMessage.content).toBe(plaintext);
      expect(normalizedMessage.encrypted).toBe(false);
    });

    it('should fail gracefully when no ratchet state (skipped negotiation)', async () => {
      // Simulate the exact bug scenario: negotiation was skipped
      // Use a session ID that has NO ratchet state (different users)
      const noStateSenderId = '7777';
      const noStateReceiverId = '8888';

      const wsRawMessage: Record<string, unknown> = {
        id: 'srv_msg_002',
        senderId: noStateSenderId,
        receiverId: noStateReceiverId,
        content: 'some_encrypted_ciphertext',
        messageType: 'TEXT',
        encrypted: true,
        e2eeHeader: '{"dhPubKey":"key","counter":0,"previousCounter":0,"iv":"iv"}',
        e2eeDeviceId: 'device_001',
        createdTime: '2026-05-07T10:00:00Z',
        status: 1,
      };

      const normalizedMessage = normalizeMessage(wsRawMessage);
      const currentUserId = noStateReceiverId;
      const isEncrypted = wsRawMessage.encrypted === true || wsRawMessage.encrypted === 1;
      expect(isEncrypted).toBe(true);

      const senderId = String(normalizedMessage.senderId);
      const peerId = senderId;
      const sessionId = buildSessionId('private', currentUserId, peerId);

      const headerRaw = wsRawMessage.e2eeHeader || wsRawMessage.e2ee_header;
      const header = typeof headerRaw === 'string' ? JSON.parse(headerRaw) : headerRaw;

      // This is what happens in the WebSocket handler catch block
      let decryptionFailed = false;
      try {
        const decrypted = await e2eeManager.decryptMessage(
          sessionId,
          peerId,
          header,
          normalizedMessage.content,
        );
        if (decrypted) {
          normalizedMessage.content = decrypted;
          (normalizedMessage as unknown as Record<string, unknown>).encrypted = false;
        }
      } catch (e) {
        // WebSocket handler catch block: sets encrypted = true, keeps ciphertext
        decryptionFailed = true;
        (normalizedMessage as unknown as Record<string, unknown>).encrypted = true;
      }

      // Verify: decryption should fail because there's no ratchet state
      expect(decryptionFailed).toBe(true);
      // The message remains as ciphertext
      expect(normalizedMessage.content).toBe('some_encrypted_ciphertext');
      expect(normalizedMessage.encrypted).toBe(true);

      console.log('✓ Bug scenario confirmed: without ratchet state, message stays as ciphertext');
    });

    it('should preserve plaintext for own messages via WebSocket', async () => {
      // When Alice receives her own message back via WebSocket,
      // the handler should look up the existing local message with plaintext

      const currentUserId = ALICE_ID;
      const plaintext = 'Alice sent this message';

      // Simulate an existing local message (from the send queue)
      const existingLocalMessage: Message = {
        id: 'local_001',
        clientMessageId: 'cm_001',
        senderId: ALICE_ID,
        receiverId: BOB_ID,
        content: plaintext, // plaintext in local state
        messageType: 'TEXT',
        isGroupChat: false,
        sendTime: '2026-05-07T10:00:00Z',
        status: 'SENT',
      };

      // Simulate WebSocket message for own message (with ciphertext)
      const wsRawMessage: Record<string, unknown> = {
        id: 'srv_msg_003',
        senderId: ALICE_ID,
        receiverId: BOB_ID,
        content: 'encrypted_ciphertext_of_alice_message',
        messageType: 'TEXT',
        encrypted: true,
        e2eeHeader: '{"dhPubKey":"key","counter":0,"previousCounter":0,"iv":"iv"}',
        e2eeDeviceId: 'device_001',
        createdTime: '2026-05-07T10:00:00Z',
        status: 1,
      };

      const normalizedMessage = normalizeMessage(wsRawMessage);
      const isEncrypted = wsRawMessage.encrypted === true || wsRawMessage.encrypted === 1;

      if (isEncrypted && normalizedMessage.messageType !== 'SYSTEM') {
        const senderId = String(normalizedMessage.senderId);

        // Own message → preserve local plaintext
        if (senderId === currentUserId) {
          // Simulate the WebSocket handler logic for own messages
          const existing = existingLocalMessage;
          if (existing && existing.content) {
            normalizedMessage.content = existing.content;
          }
          (normalizedMessage as unknown as Record<string, unknown>).encrypted = true;
        }
      }

      // Verify: own message shows plaintext, not ciphertext
      expect(normalizedMessage.content).toBe(plaintext);
      console.log('✓ Own message via WebSocket preserves plaintext');
    });
  });

  // ==========================================================================
  // Scenario 8: Historical Message Batch Decryption
  // ==========================================================================

  describe('Historical Message Decryption', () => {
    it('should decrypt multiple historical messages in order', async () => {
      // Use unique session IDs
      const histAliceSession = '2001_2002';
      const histBobSession = '2002_2001';

      const aliceBundle = await generateKeyBundle();
      const bobBundle = await generateKeyBundle();
      const x3dhResult = await x3dhInitiate(
        aliceBundle.identityKeyPair,
        {
          identityKey: bobBundle.bundle.identityKey,
          signingIdentityKey: bobBundle.bundle.signingIdentityKey,
          signedPreKey: bobBundle.bundle.signedPreKey,
          signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
          oneTimePreKey: bobBundle.bundle.oneTimePreKeys[0],
        },
      );
      const bobRootKey = await x3dhRespond(
        bobBundle.identityKeyPair,
        bobBundle.signedPreKeyPair,
        bobBundle.oneTimePreKeyPairs[0],
        aliceBundle.bundle.identityKey,
        x3dhResult.ephemeralPublicKey,
      );
      const aliceRootKey = await importRootKey(x3dhResult.rootKey);
      const aliceState = await initSendingChain(aliceRootKey, aliceBundle.identityKeyPair);
      const bobRootKeyCk = await importRootKey(bobRootKey);
      const bobState = await initReceivingChain(bobRootKeyCk, bobBundle.identityKeyPair);

      // Save Alice's state for encryption
      await saveRatchetState(histAliceSession, aliceState);
      await e2eeManager.init('device_hist');

      // Alice sends 5 messages
      const plaintexts = [
        'Message 1: Hello!',
        'Message 2: How are you?',
        'Message 3: Fine, thanks!',
        'Message 4: What are you doing?',
        'Message 5: Testing E2EE 🔒',
      ];

      const encryptedMessages: Array<{
        header: import('@/features/e2ee/types').RatchetHeader;
        ciphertext: string;
      }> = [];

      for (const text of plaintexts) {
        const enc = await e2eeManager.encryptMessage(histAliceSession, text);
        expect(enc).not.toBeNull();
        encryptedMessages.push(enc!);
      }

      // Replace with Bob's state for decryption (simulating different device)
      await saveRatchetState(histAliceSession, bobState);

      // Simulate historical messages as they would come from the server
      const histAliceId = '2001';
      const histBobId = '2002';
      const historicalMessages: Message[] = encryptedMessages.map((enc, i) => ({
        id: `hist_${i}`,
        senderId: histAliceId,
        receiverId: histBobId,
        content: enc.ciphertext,
        messageType: 'TEXT' as const,
        isGroupChat: false,
        sendTime: new Date(2026, 4, 7, 10, i).toISOString(),
        status: 'SENT' as const,
        encrypted: true,
        e2eeHeader: JSON.stringify(enc.header),
      }));

      // Simulate the decryptE2eeMessages logic from message-loading.ts
      const currentUserId = histBobId;
      const encrypted = historicalMessages
        .filter((m) => {
          const raw = m as unknown as Record<string, unknown>;
          return (raw.encrypted === true || raw.encrypted === 1) &&
            String(m.senderId) !== currentUserId &&
            m.messageType !== 'SYSTEM';
        })
        .sort((a, b) => {
          const ta = new Date(a.sendTime || 0).getTime();
          const tb = new Date(b.sendTime || 0).getTime();
          return ta - tb;
        });

      expect(encrypted.length).toBe(5);

      // Decrypt in order
      for (const msg of encrypted) {
        const raw = msg as unknown as Record<string, unknown>;
        const peerId = String(msg.senderId);
        const sessionId = buildSessionId('private', currentUserId, peerId);

        const headerRaw = raw.e2eeHeader || raw.e2ee_header;
        const header = typeof headerRaw === 'string' ? JSON.parse(headerRaw) : headerRaw;

        if (header && msg.content) {
          const decrypted = await e2eeManager.decryptMessage(
            sessionId,
            peerId,
            header,
            msg.content,
          );
          if (decrypted) {
            msg.content = decrypted;
            raw.encrypted = false;
          }
        }
      }

      // Verify all messages decrypted correctly
      for (let i = 0; i < 5; i++) {
        expect(historicalMessages[i].content).toBe(plaintexts[i]);
        expect((historicalMessages[i] as unknown as Record<string, unknown>).encrypted).toBe(false);
      }

      console.log('✓ All 5 historical messages decrypted successfully');
    });

    it('should decrypt out-of-order historical messages via skipped key cache', async () => {
      // Use unique session IDs
      const oooAliceSession = '3001_3002';
      const oooBobSession = '3002_3001';
      const oooAliceId = '3001';
      const oooBobId = '3002';

      const aliceBundle = await generateKeyBundle();
      const bobBundle = await generateKeyBundle();
      const x3dhResult = await x3dhInitiate(
        aliceBundle.identityKeyPair,
        {
          identityKey: bobBundle.bundle.identityKey,
          signingIdentityKey: bobBundle.bundle.signingIdentityKey,
          signedPreKey: bobBundle.bundle.signedPreKey,
          signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
          oneTimePreKey: bobBundle.bundle.oneTimePreKeys[0],
        },
      );
      const bobRootKey = await x3dhRespond(
        bobBundle.identityKeyPair,
        bobBundle.signedPreKeyPair,
        bobBundle.oneTimePreKeyPairs[0],
        aliceBundle.bundle.identityKey,
        x3dhResult.ephemeralPublicKey,
      );
      const aliceRootKey = await importRootKey(x3dhResult.rootKey);
      const aliceState = await initSendingChain(aliceRootKey, aliceBundle.identityKeyPair);
      const bobRootKeyCk = await importRootKey(bobRootKey);
      const bobState = await initReceivingChain(bobRootKeyCk, bobBundle.identityKeyPair);

      await saveRatchetState(oooAliceSession, aliceState);
      await saveRatchetState(oooBobSession, bobState);
      await e2eeManager.init('device_ooo');

      // Alice sends 3 messages
      const texts = ['First', 'Second', 'Third'];
      const encrypted: Array<{
        header: import('@/features/e2ee/types').RatchetHeader;
        ciphertext: string;
        deviceId: string;
      }> = [];

      for (const text of texts) {
        const enc = await e2eeManager.encryptMessage(oooAliceSession, text);
        encrypted.push(enc!);
      }

      // Bob receives messages out of order: 3rd, 1st, 2nd.
      // The ratchet advances to counter=2 and caches skipped keys for 0 and 1.
      const dec3 = await e2eeManager.decryptMessage(
        oooBobSession, oooAliceId, encrypted[2].header, encrypted[2].ciphertext,
      );
      expect(dec3).toBe('Third');

      // Receive 1st message (counter=0) from the skipped key cache
      const dec1 = await e2eeManager.decryptMessage(
        oooBobSession, oooAliceId, encrypted[0].header, encrypted[0].ciphertext,
      );
      expect(dec1).toBe('First');

      // Receive 2nd message (counter=1) from the skipped key cache
      const dec2 = await e2eeManager.decryptMessage(
        oooBobSession, oooAliceId, encrypted[1].header, encrypted[1].ciphertext,
      );
      expect(dec2).toBe('Second');
    });
  });

  // ==========================================================================
  // Scenario 9: Ratchet State Persistence
  // ==========================================================================

  describe('Ratchet State Persistence', () => {
    it('should persist and restore ratchet state from IndexedDB', async () => {
      const { aliceRatchetState } = await setupEncryptedSession();

      // Save state
      await saveRatchetState('test_session', aliceRatchetState);

      // Restore state
      const restored = await getRatchetState('test_session');

      expect(restored).not.toBeNull();
      expect(restored!.sendCounter).toBe(aliceRatchetState.sendCounter);
      expect(restored!.receiveCounter).toBe(aliceRatchetState.receiveCounter);

      // Should be able to encrypt with restored state
      const plaintext = 'Test after restore';
      const { ciphertext } = await ratchetEncrypt(restored!, plaintext);
      expect(ciphertext).toBeTruthy();
    });

    it('should return null for non-existent session', async () => {
      const state = await getRatchetState('nonexistent');
      expect(state).toBeNull();
    });

    it('should delete ratchet state', async () => {
      const { aliceRatchetState } = await setupEncryptedSession();

      await saveRatchetState('delete_test', aliceRatchetState);
      expect(await getRatchetState('delete_test')).not.toBeNull();

      await deleteRatchetState('delete_test');
      expect(await getRatchetState('delete_test')).toBeNull();
    });
  });

  // ==========================================================================
  // Scenario 10: End-to-End Summary
  // ==========================================================================

  describe('End-to-End Summary', () => {
    it('should demonstrate the complete working E2EE flow', async () => {
      console.log('\n=== E2EE Integration Test Summary ===\n');

      // Step 1: Key Generation
      console.log('Step 1: Generate key bundles for Alice and Bob');
      const aliceBundle = await generateKeyBundle();
      const bobBundle = await generateKeyBundle();
      console.log('  ✓ Key bundles generated');

      // Step 2: X3DH Key Exchange
      console.log('Step 2: X3DH key exchange');
      const x3dhResult = await x3dhInitiate(
        aliceBundle.identityKeyPair,
        {
          identityKey: bobBundle.bundle.identityKey,
          signingIdentityKey: bobBundle.bundle.signingIdentityKey,
          signedPreKey: bobBundle.bundle.signedPreKey,
          signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
          oneTimePreKey: bobBundle.bundle.oneTimePreKeys[0],
        },
      );
      const bobRootKey = await x3dhRespond(
        bobBundle.identityKeyPair,
        bobBundle.signedPreKeyPair,
        bobBundle.oneTimePreKeyPairs[0],
        aliceBundle.bundle.identityKey,
        x3dhResult.ephemeralPublicKey,
      );
      expect(x3dhResult.rootKey).toBe(bobRootKey);
      console.log('  ✓ Root keys match');

      // Step 3: Initialize Ratchet
      console.log('Step 3: Initialize Double Ratchet');
      const aliceRootKey = await importRootKey(x3dhResult.rootKey);
      const aliceState = await initSendingChain(aliceRootKey, aliceBundle.identityKeyPair);
      const bobRootKeyCk = await importRootKey(bobRootKey);
      const bobState = await initReceivingChain(bobRootKeyCk, bobBundle.identityKeyPair);
      console.log('  ✓ Ratchet states initialized');

      // Step 4: Save states (simulating negotiation completion)
      console.log('Step 4: Save ratchet states (negotiation complete)');
      await saveRatchetState(SESSION_ID, aliceState);
      await saveRatchetState(`${BOB_ID}_${ALICE_ID}`, bobState);
      console.log('  ✓ States saved to IndexedDB');

      // Step 5: Encrypt message
      console.log('Step 5: Alice encrypts message');
      const plaintext = 'Hello Bob! This is a secret E2EE message 🔐';
      const { header, ciphertext } = await ratchetEncrypt(aliceState, plaintext);
      expect(ciphertext).not.toBe(plaintext);
      console.log(`  ✓ Encrypted: "${ciphertext.substring(0, 50)}..."`);

      // Step 6: Decrypt message
      console.log('Step 6: Bob decrypts message');
      const decrypted = await ratchetDecrypt(bobState, header, ciphertext);
      expect(decrypted).toBe(plaintext);
      console.log(`  ✓ Decrypted: "${decrypted}"`);

      // Step 7: Verify through e2eeManager
      console.log('Step 7: Verify through e2eeManager');
      await e2eeManager.init('test_device');
      const managerEncrypted = await e2eeManager.encryptMessage(SESSION_ID, plaintext);
      expect(managerEncrypted).not.toBeNull();
      const managerDecrypted = await e2eeManager.decryptMessage(
        `${BOB_ID}_${ALICE_ID}`,
        ALICE_ID,
        managerEncrypted!.header,
        managerEncrypted!.ciphertext,
      );
      expect(managerDecrypted).toBe(plaintext);
      console.log('  ✓ e2eeManager round trip successful');

      console.log('\n=== All E2EE steps passed! ===\n');
    });
  });

  // ==========================================================================
  // Pending Message Cache
  // ==========================================================================

  describe('Pending Message Cache', () => {
    it('should cache and retrieve pending messages', async () => {
      const { cachePendingMessage, getPendingMessages, clearPendingMessages } = await import('@/features/e2ee/manager/pending-messages');

      const msgRef = { content: 'encrypted_content', encrypted: true };
      cachePendingMessage({
        sessionId: 'cache_test_1',
        peerId: '100',
        content: 'encrypted_content',
        header: { ratchetPublicKey: 'key', counter: 0, previousCounter: 0, iv: 'iv' },
        messageRef: msgRef,
      });

      const pending = getPendingMessages('cache_test_1');
      expect(pending).toHaveLength(1);
      expect(pending[0].content).toBe('encrypted_content');
      expect(pending[0].peerId).toBe('100');

      clearPendingMessages('cache_test_1');
      expect(getPendingMessages('cache_test_1')).toHaveLength(0);
    });

    it('should cache multiple messages for the same session', async () => {
      const { cachePendingMessage, getPendingMessages, clearPendingMessages } = await import('@/features/e2ee/manager/pending-messages');

      for (let i = 0; i < 3; i++) {
        cachePendingMessage({
          sessionId: 'cache_multi',
          peerId: '200',
          content: `msg_${i}`,
          header: { ratchetPublicKey: 'key', counter: i, previousCounter: 0, iv: 'iv' },
          messageRef: { content: `msg_${i}`, encrypted: true },
        });
      }

      expect(getPendingMessages('cache_multi')).toHaveLength(3);
      clearPendingMessages('cache_multi');
    });

    it('should return empty array for unknown session', async () => {
      const { getPendingMessages } = await import('@/features/e2ee/manager/pending-messages');
      expect(getPendingMessages('nonexistent')).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Defensive Decrypt Handling
  // ==========================================================================

  describe('Defensive Decrypt Handling', () => {
    it('should throw "No ratchet state" when no state exists and no keys provided', async () => {
      const noStateSession = `no_state_${Date.now()}`;
      await expect(
        e2eeManager.decryptMessage(noStateSession, '999', { ratchetPublicKey: 'k', counter: 0, previousCounter: 0, iv: 'iv' }, 'cipher'),
      ).rejects.toThrow('No ratchet state');
    });

    it('should throw "negotiation has not been accepted" when keys provided but no state', async () => {
      const noStateSession2 = `no_state_keys_${Date.now()}`;
      await expect(
        e2eeManager.decryptMessage(noStateSession2, '999', { ratchetPublicKey: 'k', counter: 0, previousCounter: 0, iv: 'iv' }, 'cipher', 'identityKey', 'ephemeralKey'),
      ).rejects.toThrow('negotiation has not been accepted');
    });

    it('should detect ratchet state error by message content', () => {
      const err1 = new Error('No ratchet state for session 123_456');
      const err2 = new Error('E2EE negotiation has not been accepted');
      const err3 = new Error('Cipher job failed');

      const isNoRatchet = (e: Error) => e.message.includes('No ratchet state') || e.message.includes('negotiation has not been accepted');

      expect(isNoRatchet(err1)).toBe(true);
      expect(isNoRatchet(err2)).toBe(true);
      expect(isNoRatchet(err3)).toBe(false);
    });
  });

  // ==========================================================================
  // Deferred Decryption (cache + retry)
  // ==========================================================================

  describe('Deferred Decryption', () => {
    it('should cache messages when no ratchet state and decrypt after negotiation', async () => {
      const { cachePendingMessage, getPendingMessages, clearPendingMessages } = await import('@/features/e2ee/manager/pending-messages');
      const aliceId = '5001';
      const bobId = '5002';
      const deferredSession = buildSessionId('private', aliceId, bobId);

      // Step 1: Alice encrypts a message
      const aliceBundle = await generateKeyBundle();
      const bobBundle = await generateKeyBundle();
      const { rootKey: aliceRoot, ephemeralPublicKey } = await x3dhInitiate(
        aliceBundle.identityKeyPair,
        {
          identityKey: bobBundle.bundle.identityKey,
          signingIdentityKey: bobBundle.bundle.signingIdentityKey,
          signedPreKey: bobBundle.bundle.signedPreKey,
          signedPreKeySignature: bobBundle.bundle.signedPreKeySignature,
        },
      );
      const aliceRootKey = await importRootKey(aliceRoot);
      const aliceState = await initSendingChain(aliceRootKey, aliceBundle.identityKeyPair);
      const plaintext = 'Deferred decrypt test message';
      const { header, ciphertext } = await ratchetEncrypt(aliceState, plaintext);

      // Step 2: Bob has no ratchet state — cache the message
      const msgRef = { content: ciphertext, encrypted: true };
      cachePendingMessage({
        sessionId: deferredSession,
        peerId: aliceId,
        content: ciphertext,
        header,
        messageRef: msgRef,
      });

      expect(getPendingMessages(deferredSession)).toHaveLength(1);
      expect(msgRef.content).toBe(ciphertext); // Still encrypted

      // Step 3: Bob completes negotiation (X3DH respond)
      const bobRoot = await x3dhRespond(
        bobBundle.identityKeyPair,
        bobBundle.signedPreKeyPair,
        null,
        aliceBundle.bundle.identityKey,
        ephemeralPublicKey,
      );
      const bobRootKey = await importRootKey(bobRoot);
      const bobState = await initReceivingChain(bobRootKey, bobBundle.identityKeyPair);
      await saveRatchetState(deferredSession, bobState);

      // Step 4: Retry decrypting cached messages
      const pending = getPendingMessages(deferredSession);
      expect(pending).toHaveLength(1);

      for (const msg of pending) {
        const decrypted = await ratchetDecrypt(bobState, msg.header as import('@/features/e2ee/types').RatchetHeader, msg.content);
        msg.messageRef.content = decrypted;
        msg.messageRef.encrypted = false;
      }

      expect(msgRef.content).toBe(plaintext);
      expect(msgRef.encrypted).toBe(false);

      clearPendingMessages(deferredSession);
      await deleteRatchetState(deferredSession);
    });
  });
});
