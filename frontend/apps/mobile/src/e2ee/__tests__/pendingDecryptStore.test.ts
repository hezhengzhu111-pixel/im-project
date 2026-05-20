import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import {
  cachePendingEncryptedMessage,
  clearAllPendingEncryptedMessages,
  configurePendingDecryptQueue,
  getPendingEncryptedMessages,
  restorePendingEncryptedMessagesFromRepository,
  retryDecryptPendingMessages,
} from '@/e2ee/store/pendingDecryptStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { __resetForTests as resetMessageDatabaseForTests } from '@/services/storage/messageDatabase';
import { clearCurrentE2eeAccountState } from '@/e2ee/clearE2eeState';
import type { MobileMessage } from '@/types/models';

const envelope = {
  version: 2 as const,
  algorithm: 'rust-x25519-x3dh-dr-v1' as const,
  senderDeviceId: 'device-200',
  recipientDeviceId: 'device-100',
  sessionId: '100_200',
  handshake: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  wire: 'AQID',
};

const encryptedMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'msg-pending-1',
  messageId: 'msg-pending-1',
  conversationId: '100_200',
  senderId: '200',
  receiverId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'ciphertext-or-plaintext-must-not-leak',
  encrypted: true,
  e2eeEnvelope: envelope,
  decryptStatus: 'pending',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

describe('pending decrypt runtime queue recovery', () => {
  beforeEach(() => {
    resetMessageDatabaseForTests();
    clearAllPendingEncryptedMessages();
    configurePendingDecryptQueue({
      retryPendingMessages: async () => 0,
      retryVisibleMessages: async () => 0,
    });
  });

  it('restores pending encrypted messages from messageRepository after runtime queue reset', () => {
    messageRepository.upsertMessages('100_200', [encryptedMessage()]);
    clearAllPendingEncryptedMessages();

    expect(restorePendingEncryptedMessagesFromRepository()).toBe(1);

    const restored = getPendingEncryptedMessages('100_200');
    expect(restored).toHaveLength(1);
    expect(restored[0]?.e2eeEnvelope).toMatchObject({ wire: 'AQID' });
  });

  it('clears runtime pending entry after successful decrypt retry', async () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());
    configurePendingDecryptQueue({
      retryPendingMessages: async () => {
        clearAllPendingEncryptedMessages();
        return 1;
      },
      retryVisibleMessages: async () => 0,
    });

    await expect(retryDecryptPendingMessages('100_200')).resolves.toBe(1);
    expect(getPendingEncryptedMessages('100_200')).toHaveLength(0);
  });

  it('clear session cleanup removes current runtime pending entries', async () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage());

    await clearCurrentE2eeAccountState();

    expect(getPendingEncryptedMessages('100_200')).toHaveLength(0);
  });

  it('does not retain plaintext content in pending encrypted rawJson', () => {
    cachePendingEncryptedMessage('100_200', encryptedMessage({ content: 'local plaintext secret' }));

    const [pending] = getPendingEncryptedMessages('100_200');

    expect(pending?.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(pending?.rawJson).not.toContain('local plaintext secret');
    expect(pending?.rawJson).toContain('e2eeEnvelope');
  });
});
