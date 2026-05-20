import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { processE2eeMessage, processE2eeMessages } from '@/e2ee/messageProcessor';
import { E2EE_OWN_PLAINTEXT_UNAVAILABLE_TEXT, E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
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
});
