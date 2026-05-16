import { normalizeMobileSession, createSessionFromMessage } from '../sessionAdapter';
import {
  E2EE_UNSUPPORTED_TEXT,
  assertPlaintextSendAllowed,
  blockEncryptedPendingPayload,
} from '@/e2ee/e2eeDeferred';
import type { MobileMessage } from '@/types/models';

const CURRENT_USER = '100';

const baseMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: '1',
  messageId: '1',
  senderId: 'u1',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'hello',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

describe('sessionAdapter E2EE encrypted field', () => {
  describe('normalizeMobileSession encrypted mapping', () => {
    it('maps raw encrypted=true to session.encrypted=true', () => {
      const raw = {
        conversationId: '100_200',
        targetId: '200',
        conversationType: 'PRIVATE',
        targetName: 'Alice',
        encrypted: true,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.encrypted).toBe(true);
    });

    it('maps raw encrypted=1 to session.encrypted=true', () => {
      const raw = {
        conversationId: '100_200',
        targetId: '200',
        conversationType: 'PRIVATE',
        targetName: 'Alice',
        encrypted: 1,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.encrypted).toBe(true);
    });

    it('maps raw encrypted=false to session.encrypted=false', () => {
      const raw = {
        conversationId: '100_200',
        targetId: '200',
        conversationType: 'PRIVATE',
        targetName: 'Alice',
        encrypted: false,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.encrypted).toBe(false);
    });

    it('maps raw encrypted=0 to session.encrypted=false', () => {
      const raw = {
        conversationId: '100_200',
        targetId: '200',
        conversationType: 'PRIVATE',
        targetName: 'Alice',
        encrypted: 0,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.encrypted).toBe(false);
    });

    it('defaults to encrypted=false when field is missing', () => {
      const raw = {
        conversationId: '100_200',
        targetId: '200',
        conversationType: 'PRIVATE',
        targetName: 'Alice',
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.encrypted).toBe(false);
    });

    it('handles snake_case encrypted field from backend DTO', () => {
      const raw = {
        conversation_id: '100_200',
        target_id: '200',
        conversation_type: 'PRIVATE',
        target_name: 'Alice',
        encrypted: true,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.encrypted).toBe(true);
    });

    it('preserves encrypted=true in fallback minimal construction', () => {
      const raw = {
        type: 'private',
        targetId: '500',
        targetName: 'Charlie',
        encrypted: true,
      };
      const session = normalizeMobileSession(raw, CURRENT_USER);
      expect(session.encrypted).toBe(true);
    });

    it('masks encrypted lastMessage and treats the session as encrypted', () => {
      const raw = {
        conversationId: '100_200',
        targetId: '200',
        conversationType: 'PRIVATE',
        targetName: 'Alice',
        encrypted: false,
        lastMessage: baseMessage({
          encrypted: true,
          content: 'ciphertext-should-not-render',
          mediaUrl: 'https://cdn.example/encrypted.jpg',
          mediaName: 'secret.jpg',
          mediaSize: 123,
          duration: 9,
        }),
      };

      const session = normalizeMobileSession(raw, CURRENT_USER);

      expect(session.encrypted).toBe(true);
      expect(session.lastMessage?.content).toBe(E2EE_UNSUPPORTED_TEXT);
      expect(session.lastMessage?.mediaUrl).toBeUndefined();
      expect(session.lastMessage?.mediaName).toBeUndefined();
      expect(session.lastMessage?.mediaSize).toBeUndefined();
      expect(session.lastMessage?.duration).toBeUndefined();
    });
  });

  describe('createSessionFromMessage encrypted propagation', () => {
    it('propagates encrypted=true from message to session', () => {
      const msg = baseMessage({ encrypted: true, receiverId: '200' });
      const session = createSessionFromMessage(msg, '100');
      expect(session).not.toBeNull();
      expect(session!.encrypted).toBe(true);
      expect(session!.lastMessage?.content).toBe(E2EE_UNSUPPORTED_TEXT);
    });

    it('propagates encrypted=1 from message to session as true', () => {
      const msg = baseMessage({ encrypted: 1, receiverId: '200' });
      const session = createSessionFromMessage(msg, '100');
      expect(session).not.toBeNull();
      expect(session!.encrypted).toBe(true);
    });

    it('sets encrypted=false when message has no encrypted field', () => {
      const msg = baseMessage({ receiverId: '200' });
      const session = createSessionFromMessage(msg, '100');
      expect(session).not.toBeNull();
      expect(session!.encrypted).toBe(false);
    });

    it('sets encrypted=false when message has encrypted=false', () => {
      const msg = baseMessage({ encrypted: false, receiverId: '200' });
      const session = createSessionFromMessage(msg, '100');
      expect(session).not.toBeNull();
      expect(session!.encrypted).toBe(false);
    });
  });
});

describe('encrypted session send blocking', () => {
  it('blocks plaintext send for encrypted session', () => {
    const raw = {
      conversationId: '100_200',
      targetId: '200',
      conversationType: 'PRIVATE',
      targetName: 'Alice',
      encrypted: true,
    };
    const session = normalizeMobileSession(raw, CURRENT_USER);
    expect(() => assertPlaintextSendAllowed(session)).toThrow(/端到端加密/);
  });

  it('allows plaintext send for non-encrypted session', () => {
    const raw = {
      conversationId: '100_200',
      targetId: '200',
      conversationType: 'PRIVATE',
      targetName: 'Alice',
      encrypted: false,
    };
    const session = normalizeMobileSession(raw, CURRENT_USER);
    expect(() => assertPlaintextSendAllowed(session)).not.toThrow();
  });

  it('allows plaintext send when encrypted field is missing', () => {
    const raw = {
      conversationId: '100_200',
      targetId: '200',
      conversationType: 'PRIVATE',
      targetName: 'Alice',
    };
    const session = normalizeMobileSession(raw, CURRENT_USER);
    expect(() => assertPlaintextSendAllowed(session)).not.toThrow();
  });
});

describe('blockEncryptedPendingPayload', () => {
  it('blocks payload with encrypted=true in outer record', () => {
    expect(blockEncryptedPendingPayload({ encrypted: true, data: {} })).toBe(true);
  });

  it('blocks payload with encrypted=1 in outer record', () => {
    expect(blockEncryptedPendingPayload({ encrypted: 1, data: {} })).toBe(true);
  });

  it('blocks payload with encrypted=true in nested data', () => {
    expect(blockEncryptedPendingPayload({ data: { encrypted: true } })).toBe(true);
  });

  it('blocks payload with encrypted=true in deeper nested data', () => {
    expect(blockEncryptedPendingPayload({ data: { retry: { payload: { encrypted: true } } } })).toBe(true);
  });

  it('blocks payload with encrypted=1 in nested data', () => {
    expect(blockEncryptedPendingPayload({ data: { encrypted: 1 } })).toBe(true);
  });

  it('does not block payload without encrypted field', () => {
    expect(blockEncryptedPendingPayload({ data: { content: 'hello' } })).toBe(false);
  });

  it('does not block payload with encrypted=false', () => {
    expect(blockEncryptedPendingPayload({ encrypted: false, data: {} })).toBe(false);
  });

  it('does not block null or undefined payload', () => {
    expect(blockEncryptedPendingPayload(null)).toBe(false);
    expect(blockEncryptedPendingPayload(undefined)).toBe(false);
  });
});
