import { e2eeManager, E2eeEnvelopeRecipientMismatchError } from '@/e2ee/manager/e2eeManager';
import { processE2eeMessage, processE2eeMessages, compareE2eeDecryptOrder, hasE2eeHandshake, shouldDrainPendingAfterDecrypt, E2EE_NOT_FOR_THIS_DEVICE_TEXT } from '@/e2ee/messageProcessor';
import { E2EE_OWN_PLAINTEXT_UNAVAILABLE_TEXT, E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import { logger } from '@/utils/logger';
import type { MobileMessage } from '@/types/models';

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const envelope = (index: number) => ({
  version: 2 as const,
  algorithm: 'rust-x25519-x3dh-dr-v1' as const,
  senderDeviceId: 'device-200',
  recipientDeviceId: 'device-100',
  sessionId: '100_200',
  handshake: index === 0 ? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==' : undefined,
  wire: `AAAA${index}`,
});

const encryptedMessage = (counter: number, overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: `msg-${counter}`,
  messageId: `msg-${counter}`,
  conversationId: '100_200',
  senderId: '200',
  receiverId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: '',
  encrypted: true,
  e2eeEnvelope: envelope(counter),
  e2eeDeviceId: 'device-200',
  sendTime: `2024-06-01T10:00:0${counter}.000Z`,
  status: 'SENT',
  ...overrides,
});

describe('mobile E2EE message processing', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('decrypts Web-style Rust v2 envelopes in stable session order while preserving UI order', async () => {
    const decryptOrder: string[] = [];
    jest.spyOn(e2eeManager, 'decryptEnvelope').mockImplementation(async (rustEnvelope) => {
      decryptOrder.push(rustEnvelope.wire);
      return `plaintext-${rustEnvelope.wire.slice(-1)}`;
    });

    const input = [encryptedMessage(2), encryptedMessage(0), encryptedMessage(1)];
    const processed = await processE2eeMessages(input, {
      currentUserId: '100',
      sessionId: '100_200',
      concurrency: 8,
    });

    expect(decryptOrder).toEqual(['AAAA0', 'AAAA1', 'AAAA2']);
    expect(processed.map((item) => item.displayMessage.content)).toEqual([
      'plaintext-2',
      'plaintext-0',
      'plaintext-1',
    ]);
    expect(processed.every((item) => item.displayMessage.isE2eeDisplayDecrypted)).toBe(true);
  });

  it('shows unsupported for legacy header/content ciphertext without decrypting', async () => {
    const decryptSpy = jest.spyOn(e2eeManager, 'decryptEnvelope');
    const rawJson = JSON.stringify({
      encrypted: true,
      content: 'raw-ciphertext',
      e2eeHeader: '{"counter":0}',
      e2eeDeviceId: 'device-200',
    });

    const processed = await processE2eeMessage(encryptedMessage(0, {
      rawJson,
      e2eeEnvelope: undefined,
      content: 'raw-ciphertext',
    }), {
      currentUserId: '100',
      sessionId: '100_200',
    });

    expect(decryptSpy).not.toHaveBeenCalled();
    expect(processed.decryptStatus).toBe('failed');
    expect(processed.rawMessage.rawJson).toBe(rawJson);
    expect(processed.displayMessage.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(processed.displayMessage.content).not.toContain('raw-ciphertext');
  });

  it('preserves own echo optimistic plaintext and falls back when it is missing', async () => {
    const own = encryptedMessage(0, { senderId: '100', clientMessageId: 'cm-own' });
    const withOptimistic = await processE2eeMessage(own, {
      currentUserId: '100',
      sessionId: '100_200',
      findOptimisticMessage: () => ({ ...own, content: 'local plain' }),
    });
    expect(withOptimistic.decryptStatus).toBe('own-echo-preserved');
    expect(withOptimistic.displayMessage.content).toBe('local plain');

    const withoutOptimistic = await processE2eeMessage(own, {
      currentUserId: '100',
      sessionId: '100_200',
    });
    expect(withoutOptimistic.decryptStatus).toBe('pending');
    expect(withoutOptimistic.displayMessage.content).toBe(E2EE_OWN_PLAINTEXT_UNAVAILABLE_TEXT);
  });

  it('keeps encrypted marker and failed status when Rust decrypt fails', async () => {
    jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(new Error('decrypt failed'));

    const processed = await processE2eeMessage(encryptedMessage(0), {
      currentUserId: '100',
      sessionId: '100_200',
    });

    expect(processed.decryptStatus).toBe('failed');
    expect(processed.displayMessage.encrypted).toBe(true);
    expect(processed.displayMessage.content).toBe(E2EE_UNSUPPORTED_TEXT);
  });

  it('keeps message pending when decrypt succeeds but session state persistence fails', async () => {
    jest.spyOn(e2eeManager, 'decryptEnvelope')
      .mockRejectedValueOnce(new Error('E2EE session state storage persist failed for session 100_200'));

    const processed = await processE2eeMessage(encryptedMessage(0), {
      currentUserId: '100',
      sessionId: '100_200',
    });

    expect(processed.decryptStatus).toBe('pending');
    expect(processed.rawMessage.rawJson).toContain('e2eeEnvelope');
    expect(processed.displayMessage.content).toBe(E2EE_UNSUPPORTED_TEXT);
  });

  it('keeps no-state no-handshake encrypted message pending for later retry', async () => {
    jest.spyOn(e2eeManager, 'decryptEnvelope')
      .mockRejectedValueOnce(new Error('Rust E2EE session state unavailable and envelope has no handshake'));

    const processed = await processE2eeMessage(encryptedMessage(1), {
      currentUserId: '100',
      sessionId: '100_200',
    });

    expect(processed.decryptStatus).toBe('pending');
    expect(processed.rawMessage.e2eeEnvelope?.handshake).toBeUndefined();
  });

  // ─── recipient device mismatch ────────────────────────────────────

  describe('recipient device mismatch', () => {
    it('marks message as failed with not-for-this-device text when recipientDeviceId does not match', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new E2eeEnvelopeRecipientMismatchError('device-100', 'device-999', '100_200'),
      );

      const processed = await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      expect(processed.decryptStatus).toBe('failed');
      expect(processed.displayMessage.content).toBe(E2EE_NOT_FOR_THIS_DEVICE_TEXT);
      expect(processed.errorClassification?.retryable).toBe(false);
      expect(processed.errorClassification?.code).toBe('E2EE_RECIPIENT_DEVICE_MISMATCH');
    });

    it('does not mark as pending when recipientDeviceId does not match', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new E2eeEnvelopeRecipientMismatchError('device-100', 'device-999', '100_200'),
      );

      const processed = await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      expect(processed.decryptStatus).not.toBe('pending');
    });

    it('still decrypts normally when recipientDeviceId matches local device', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockResolvedValueOnce('hello-plaintext');

      const processed = await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      expect(processed.decryptStatus).toBe('decrypted');
      expect(processed.displayMessage.content).toBe('hello-plaintext');
    });

    it('handles plain Error with E2EE_RECIPIENT_DEVICE_MISMATCH code', async () => {
      const mismatchError = new Error('E2EE envelope is not addressed to this device');
      (mismatchError as any).code = 'E2EE_RECIPIENT_DEVICE_MISMATCH';
      (mismatchError as any).nonRetryable = true;
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(mismatchError);

      const processed = await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      expect(processed.decryptStatus).toBe('failed');
      expect(processed.displayMessage.content).toBe(E2EE_NOT_FOR_THIS_DEVICE_TEXT);
      expect(processed.errorClassification?.retryable).toBe(false);
    });
  });

  // ─── hasE2eeHandshake / shouldDrainPendingAfterDecrypt ─────────────

  describe('hasE2eeHandshake', () => {
    it('returns true when envelope has a truthy handshake string', () => {
      const msg = encryptedMessage(0, { e2eeEnvelope: envelope(0) });
      expect(hasE2eeHandshake(msg)).toBe(true);
    });

    it('returns false when envelope has no handshake', () => {
      const msg = encryptedMessage(1, { e2eeEnvelope: envelope(1) });
      expect(hasE2eeHandshake(msg)).toBe(false);
    });

    it('returns false when message is undefined', () => {
      expect(hasE2eeHandshake(undefined)).toBe(false);
    });

    it('returns false when envelope is undefined', () => {
      const msg = encryptedMessage(0, { e2eeEnvelope: undefined });
      expect(hasE2eeHandshake(msg)).toBe(false);
    });

    it('returns false when envelope is a plain object without handshake', () => {
      const msg = encryptedMessage(0, { e2eeEnvelope: { version: 2 } as unknown as MobileMessage['e2eeEnvelope'] });
      expect(hasE2eeHandshake(msg)).toBe(false);
    });

    it('returns false when handshake is an empty string', () => {
      const msg = encryptedMessage(0, {
        e2eeEnvelope: { ...envelope(0), handshake: '' },
      });
      expect(hasE2eeHandshake(msg)).toBe(false);
    });
  });

  // ─── compareE2eeDecryptOrder ──────────────────────────────────────

  const makeMsg = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
    id: 'id-0',
    messageId: 'msg-0',
    senderId: '200',
    isGroupChat: false,
    messageType: 'TEXT',
    content: '',
    sendTime: '2024-06-01T10:00:00.000Z',
    status: 'SENT',
    ...overrides,
  });

  describe('compareE2eeDecryptOrder', () => {
    it('sorts by conversationSeq even when sendTime is opposite', () => {
      const left = makeMsg({ id: 'left', messageId: 'left', conversationSeq: 1, sendTime: '2024-06-01T10:00:02.000Z' });
      const right = makeMsg({ id: 'right', messageId: 'right', conversationSeq: 0, sendTime: '2024-06-01T10:00:01.000Z' });
      // left has higher seq → should come after right, even though left has later time
      expect(compareE2eeDecryptOrder(left, right)).toBeGreaterThan(0);
      expect(compareE2eeDecryptOrder(right, left)).toBeLessThan(0);
    });

    it('puts message with conversationSeq before message without it', () => {
      const withSeq = makeMsg({ id: 'a', messageId: 'a', conversationSeq: 5 });
      const withoutSeq = makeMsg({ id: 'b', messageId: 'b', conversationSeq: undefined });
      expect(compareE2eeDecryptOrder(withSeq, withoutSeq)).toBe(-1);
      expect(compareE2eeDecryptOrder(withoutSeq, withSeq)).toBe(1);
    });

    it('returns 0 when both have same conversationSeq and same sendTime and same id', () => {
      const msg = makeMsg({ id: 'x', messageId: 'x', conversationSeq: 3, sendTime: '2024-06-01T10:00:00.000Z' });
      expect(compareE2eeDecryptOrder(msg, { ...msg })).toBe(0);
    });

    it('falls back to sendTime when both have valid sendTime and no seq', () => {
      const earlier = makeMsg({ id: 'a', messageId: 'a', sendTime: '2024-06-01T10:00:01.000Z' });
      const later = makeMsg({ id: 'b', messageId: 'b', sendTime: '2024-06-01T10:00:02.000Z' });
      expect(compareE2eeDecryptOrder(earlier, later)).toBeLessThan(0);
      expect(compareE2eeDecryptOrder(later, earlier)).toBeGreaterThan(0);
    });

    it('puts message with valid sendTime before message without sendTime when no seq', () => {
      const withTime = makeMsg({ id: 'a', messageId: 'a', sendTime: '2024-06-01T10:00:00.000Z' });
      const withoutTime = makeMsg({ id: 'b', messageId: 'b', sendTime: undefined as unknown as string });
      expect(compareE2eeDecryptOrder(withTime, withoutTime)).toBe(-1);
      expect(compareE2eeDecryptOrder(withoutTime, withTime)).toBe(1);
    });

    it('does not return NaN when sendTime is invalid', () => {
      const a = makeMsg({ id: 'a', messageId: 'a', sendTime: 'not-a-date' });
      const b = makeMsg({ id: 'b', messageId: 'b', sendTime: 'also-invalid' });
      const result = compareE2eeDecryptOrder(a, b);
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('does not return NaN when one sendTime is invalid and the other is valid', () => {
      const valid = makeMsg({ id: 'a', messageId: 'a', sendTime: '2024-06-01T10:00:00.000Z' });
      const invalid = makeMsg({ id: 'b', messageId: 'b', sendTime: 'not-a-date' });
      const r1 = compareE2eeDecryptOrder(valid, invalid);
      const r2 = compareE2eeDecryptOrder(invalid, valid);
      expect(Number.isFinite(r1)).toBe(true);
      expect(Number.isNaN(r1)).toBe(false);
      expect(Number.isFinite(r2)).toBe(true);
      expect(Number.isNaN(r2)).toBe(false);
    });

    it('does not treat missing sendTime as 1970-01-01', () => {
      const withZeroTime = makeMsg({ id: 'a', messageId: 'a', sendTime: '1970-01-01T00:00:00.000Z' });
      const withMissingTime = makeMsg({ id: 'b', messageId: 'b', sendTime: undefined as unknown as string });
      // Missing sendTime (undefined) should NOT sort as 1970-01-01
      // It should fall back to stable ID comparison
      const result = compareE2eeDecryptOrder(withZeroTime, withMissingTime);
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('falls back to stableMessageKey when sendTime is same', () => {
      const a = makeMsg({ id: 'a', messageId: 'z', sendTime: '2024-06-01T10:00:00.000Z' });
      const b = makeMsg({ id: 'b', messageId: 'a', sendTime: '2024-06-01T10:00:00.000Z' });
      // Same time, no seq → fallback to messageId comparison: 'a' < 'z'
      expect(compareE2eeDecryptOrder(a, b)).toBeGreaterThan(0); // 'z' > 'a'
    });

    it('uses serverId as fallback key when messageId is absent', () => {
      const a = makeMsg({ id: 'a', messageId: undefined, serverId: 'z' });
      const b = makeMsg({ id: 'b', messageId: undefined, serverId: 'a' });
      expect(compareE2eeDecryptOrder(a, b)).toBeGreaterThan(0);
    });

    it('uses id as fallback key when messageId and serverId are absent', () => {
      const a = makeMsg({ id: 'z', messageId: undefined, serverId: undefined });
      const b = makeMsg({ id: 'a', messageId: undefined, serverId: undefined });
      expect(compareE2eeDecryptOrder(a, b)).toBeGreaterThan(0);
    });

    it('uses clientMessageId as last fallback key', () => {
      const a = makeMsg({ id: '', messageId: undefined, serverId: undefined, clientMessageId: 'z' });
      const b = makeMsg({ id: '', messageId: undefined, serverId: undefined, clientMessageId: 'a' });
      expect(compareE2eeDecryptOrder(a, b)).toBeGreaterThan(0);
    });

    it('parses string-number conversationSeq correctly', () => {
      // conversationSeq as string should be parsed to number via readNumberField
      const left = makeMsg({ id: 'left', messageId: 'left', conversationSeq: '5' as unknown as number });
      const right = makeMsg({ id: 'right', messageId: 'right', conversationSeq: '10' as unknown as number });
      expect(compareE2eeDecryptOrder(left, right)).toBeLessThan(0);
    });

    it('ignores invalid-string conversationSeq and falls back to time/ID', () => {
      const a = makeMsg({ id: 'a', messageId: 'a', conversationSeq: 'abc' as unknown as number, sendTime: '2024-06-01T10:00:01.000Z' });
      const b = makeMsg({ id: 'b', messageId: 'b', conversationSeq: 'xyz' as unknown as number, sendTime: '2024-06-01T10:00:02.000Z' });
      // Both seq are invalid → should fall back to sendTime
      expect(compareE2eeDecryptOrder(a, b)).toBeLessThan(0);
      // Verify no NaN
      expect(Number.isNaN(compareE2eeDecryptOrder(a, b))).toBe(false);
    });

    it('conversationSeq 0 is treated as valid (not falsy)', () => {
      const left = makeMsg({ id: 'left', messageId: 'left', conversationSeq: 0 });
      const right = makeMsg({ id: 'right', messageId: 'right', conversationSeq: 1 });
      expect(compareE2eeDecryptOrder(left, right)).toBeLessThan(0);
    });

    it('produces stable sort for array with mixed valid/invalid fields', () => {
      const messages = [
        makeMsg({ id: '3', messageId: '3', conversationSeq: undefined, sendTime: 'invalid' }),
        makeMsg({ id: '1', messageId: '1', conversationSeq: 2, sendTime: '2024-06-01T10:00:00.000Z' }),
        makeMsg({ id: '2', messageId: '2', conversationSeq: 1, sendTime: '2024-06-01T10:00:03.000Z' }),
      ];
      const sorted = [...messages].sort(compareE2eeDecryptOrder);
      // Should be ordered by conversationSeq: seq=1 then seq=2 then no-seq
      expect(sorted.map((m) => m.id)).toEqual(['2', '1', '3']);
      // All comparisons must be finite
      sorted.forEach((_, i) => {
        if (i > 0) {
          const cmp = compareE2eeDecryptOrder(sorted[i - 1], sorted[i]);
          expect(Number.isFinite(cmp)).toBe(true);
          expect(cmp).toBeLessThanOrEqual(0);
        }
      });
    });

    it('never returns NaN for any pairwise combination of edge-case messages', () => {
      const edgeCases: MobileMessage[] = [
        makeMsg({ id: 'a', messageId: 'a', conversationSeq: 1, sendTime: '2024-06-01T10:00:00.000Z' }),
        makeMsg({ id: 'b', messageId: 'b', conversationSeq: undefined, sendTime: undefined as unknown as string }),
        makeMsg({ id: 'c', messageId: 'c', conversationSeq: undefined, sendTime: 'not-a-date' }),
        makeMsg({ id: 'd', messageId: 'd', conversationSeq: NaN, sendTime: '2024-06-01T10:00:00.000Z' }),
        makeMsg({ id: 'e', messageId: 'e', conversationSeq: 0, sendTime: '1970-01-01T00:00:00.000Z' }),
        makeMsg({ id: 'f', messageId: 'f', conversationSeq: undefined, sendTime: '1970-01-01T00:00:00.000Z' }),
        makeMsg({ id: 'g', messageId: 'g', conversationSeq: 'abc' as unknown as number, sendTime: 'invalid' }),
        makeMsg({ id: '', messageId: undefined, serverId: undefined, clientMessageId: undefined, conversationSeq: undefined, sendTime: undefined as unknown as string }),
      ];
      for (const left of edgeCases) {
        for (const right of edgeCases) {
          const result = compareE2eeDecryptOrder(left, right);
          expect(Number.isFinite(result)).toBe(true);
          expect(Number.isNaN(result)).toBe(false);
        }
      }
    });
  });

  // ─── processE2eeMessages ordering ─────────────────────────────────

  describe('processE2eeMessages ordering', () => {
    it('decrypts same-session remote encrypted messages in conversationSeq order', async () => {
      const decryptOrder: string[] = [];
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockImplementation(async (rustEnvelope) => {
        decryptOrder.push(rustEnvelope.wire);
        return `plaintext-${rustEnvelope.wire.slice(-1)}`;
      });

      // conversationSeq 2, 0, 1 — should decrypt as 0, 1, 2
      const input = [
        encryptedMessage(0, { conversationSeq: 2 }),
        encryptedMessage(1, { conversationSeq: 0 }),
        encryptedMessage(2, { conversationSeq: 1 }),
      ];

      await processE2eeMessages(input, {
        currentUserId: '100',
        sessionId: '100_200',
        concurrency: 8,
      });

      expect(decryptOrder).toEqual(['AAAA1', 'AAAA2', 'AAAA0']);
    });

    it('decrypts same-session messages in conversationSeq order regardless of sendTime', async () => {
      const decryptOrder: string[] = [];
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockImplementation(async (rustEnvelope) => {
        decryptOrder.push(rustEnvelope.wire);
        return `plaintext-${rustEnvelope.wire.slice(-1)}`;
      });

      const input = [
        encryptedMessage(0, { conversationSeq: 1, sendTime: '2024-06-01T10:00:05.000Z' }),
        encryptedMessage(1, { conversationSeq: 0, sendTime: '2024-06-01T10:00:01.000Z' }),
      ];

      await processE2eeMessages(input, {
        currentUserId: '100',
        sessionId: '100_200',
        concurrency: 8,
      });

      // seq 0 before seq 1, even though seq 1 has later sendTime
      expect(decryptOrder).toEqual(['AAAA1', 'AAAA0']);
    });

    it('groups different sessions independently', async () => {
      const decryptCalls: Array<{ sessionId: string; wire: string }> = [];
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockImplementation(async (rustEnvelope) => {
        decryptCalls.push({ sessionId: rustEnvelope.sessionId, wire: rustEnvelope.wire });
        return `plaintext-${rustEnvelope.wire.slice(-1)}`;
      });

      const msgA = encryptedMessage(0, { e2eeEnvelope: { ...envelope(0), sessionId: 'session-A' }, conversationSeq: 1 });
      const msgB = encryptedMessage(1, { e2eeEnvelope: { ...envelope(1), sessionId: 'session-B' }, conversationSeq: 0 });
      const msgC = encryptedMessage(2, { e2eeEnvelope: { ...envelope(2), sessionId: 'session-A' }, conversationSeq: 0 });

      await processE2eeMessages([msgA, msgB, msgC], {
        currentUserId: '100',
        concurrency: 8,
      });

      // Within session-A: seq 0 (msgC) before seq 1 (msgA)
      const sessionAOrder = decryptCalls.filter((c) => c.sessionId === 'session-A').map((c) => c.wire);
      expect(sessionAOrder).toEqual(['AAAA2', 'AAAA0']);
    });
  });

  describe('shouldDrainPendingAfterDecrypt', () => {
    it('returns true when decryptStatus is decrypted and rawMessage has handshake', () => {
      const msg = encryptedMessage(0, { e2eeEnvelope: envelope(0) });
      expect(shouldDrainPendingAfterDecrypt({
        rawMessage: msg,
        displayMessage: msg,
        decryptStatus: 'decrypted',
      })).toBe(true);
    });

    it('returns true when decryptStatus is decrypted and displayMessage has handshake', () => {
      const msgWithHandshake = encryptedMessage(0, { e2eeEnvelope: envelope(0) });
      const msgWithoutHandshake = encryptedMessage(1, { e2eeEnvelope: envelope(1) });
      expect(shouldDrainPendingAfterDecrypt({
        rawMessage: msgWithoutHandshake,
        displayMessage: msgWithHandshake,
        decryptStatus: 'decrypted',
      })).toBe(true);
    });

    it('returns false when decryptStatus is not decrypted', () => {
      const msg = encryptedMessage(0, { e2eeEnvelope: envelope(0) });
      expect(shouldDrainPendingAfterDecrypt({
        rawMessage: msg,
        displayMessage: msg,
        decryptStatus: 'pending',
      })).toBe(false);
      expect(shouldDrainPendingAfterDecrypt({
        rawMessage: msg,
        displayMessage: msg,
        decryptStatus: 'failed',
      })).toBe(false);
      expect(shouldDrainPendingAfterDecrypt({
        rawMessage: msg,
        displayMessage: msg,
        decryptStatus: 'own-echo-preserved',
      })).toBe(false);
    });

    it('returns false when no message has handshake', () => {
      const msg = encryptedMessage(1, { e2eeEnvelope: envelope(1) });
      expect(shouldDrainPendingAfterDecrypt({
        rawMessage: msg,
        displayMessage: msg,
        decryptStatus: 'decrypted',
      })).toBe(false);
    });
  });

  // ─── OTK missing handling ──────────────────────────────────────────

  describe('one-time pre-key missing errors', () => {
    it('marks message as failed (not pending) when OTK is missing during handshake', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE handshake references missing one-time pre-key: 7'),
      );

      const processed = await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      expect(processed.decryptStatus).toBe('failed');
    });

    it('displays the safe placeholder message for OTK missing errors', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE handshake references missing one-time pre-key: 7'),
      );

      const processed = await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      expect(processed.displayMessage.content).toBe('加密会话状态不完整，请重新协商');
    });

    it('classifies OTK missing error as protocol/not retryable', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE handshake references missing one-time pre-key: 7'),
      );

      const processed = await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      expect(processed.errorClassification?.code).toBe('E2EE_ONE_TIME_PREKEY_MISSING');
      expect(processed.errorClassification?.category).toBe('protocol');
      expect(processed.errorClassification?.retryable).toBe(false);
    });

    it('does not log key material or plaintext in OTK missing warnings', async () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE handshake references missing one-time pre-key: 7'),
      );

      await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      // messageProcessor logs a warning via logger.warn
      expect(warnSpy).toHaveBeenCalled();

      // Collect all warn calls and join their stringified args
      const allWarnData = warnSpy.mock.calls
        .map((call) => JSON.stringify(call).toLowerCase())
        .join(' ');

      // Must contain safe fields
      expect(allWarnData).toMatch(/senderdeviceid/);
      expect(allWarnData).toMatch(/recipientdeviceid/);
      expect(allWarnData).toMatch(/hashandshake/);

      // Must NOT expose key material or plaintext
      expect(allWarnData).not.toMatch(/privatekey/);
      expect(allWarnData).not.toMatch(/plaintext/);
      expect(allWarnData).not.toMatch(/onetimeprekeypairbincode/);
      expect(allWarnData).not.toMatch(/identitykeypairbincode/);
      expect(allWarnData).not.toMatch(/signedprekeypairbincode/);
    });

    it('does not retry or stay pending — always marks as failed', async () => {
      jest.spyOn(e2eeManager, 'decryptEnvelope').mockRejectedValueOnce(
        new Error('Rust E2EE handshake references missing one-time pre-key: 7'),
      );

      const processed = await processE2eeMessage(encryptedMessage(0), {
        currentUserId: '100',
        sessionId: '100_200',
      });

      expect(processed.decryptStatus).not.toBe('pending');
      expect(processed.decryptStatus).toBe('failed');
      expect(processed.errorClassification?.retryable).toBe(false);
    });
  });
});
