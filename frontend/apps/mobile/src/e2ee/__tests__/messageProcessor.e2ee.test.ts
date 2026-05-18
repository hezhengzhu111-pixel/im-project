import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { processE2eeMessage, processE2eeMessages } from '@/e2ee/messageProcessor';
import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import type { MobileMessage } from '@/types/models';

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const header = (counter: number): string =>
  JSON.stringify({
    ratchetPublicKey: `ratchet-public-${counter}`,
    counter,
    previousCounter: 0,
    iv: `iv-${counter}`,
  });

const encryptedMessage = (counter: number, overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: `msg-${counter}`,
  messageId: `msg-${counter}`,
  conversationId: '100_200',
  senderId: '200',
  receiverId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: `ciphertext-${counter}`,
  encrypted: true,
  e2eeHeader: header(counter),
  e2eeDeviceId: 'device-200',
  sendTime: `2024-06-01T10:00:0${counter}.000Z`,
  status: 'SENT',
  ...overrides,
});

describe('mobile E2EE message processing', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('decrypts remote private encrypted text in stable ratchet order while preserving UI order', async () => {
    const decryptOrder: number[] = [];
    jest.spyOn(e2eeManager, 'decryptMessage').mockImplementation(async (_sessionId, _senderId, ratchetHeader) => {
      decryptOrder.push(ratchetHeader.counter);
      return `plaintext-${ratchetHeader.counter}`;
    });

    const input = [encryptedMessage(2), encryptedMessage(0), encryptedMessage(1)];
    const processed = await processE2eeMessages(input, {
      currentUserId: '100',
      sessionId: '100_200',
      concurrency: 8,
    });

    expect(decryptOrder).toEqual([0, 1, 2]);
    expect(processed.map((item) => item.displayMessage.content)).toEqual([
      'plaintext-2',
      'plaintext-0',
      'plaintext-1',
    ]);
    expect(processed.every((item) => item.displayMessage.isE2eeDisplayDecrypted)).toBe(true);
  });

  it('keeps raw encrypted payload when ratchet state is not ready', async () => {
    jest.spyOn(e2eeManager, 'decryptMessage').mockRejectedValueOnce(new Error('No ratchet state for session'));
    const rawJson = JSON.stringify({
      encrypted: true,
      content: 'raw-ciphertext',
      e2eeHeader: header(0),
      e2eeDeviceId: 'device-200',
    });

    const processed = await processE2eeMessage(encryptedMessage(0, { rawJson }), {
      currentUserId: '100',
      sessionId: '100_200',
    });

    expect(processed.decryptStatus).toBe('pending');
    expect(processed.rawMessage.rawJson).toBe(rawJson);
    expect(processed.displayMessage.rawJson).toBe(rawJson);
    expect(processed.displayMessage.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(processed.displayMessage.content).not.toContain('raw-ciphertext');
  });
});
