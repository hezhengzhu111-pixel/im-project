import {
  E2EE_UNSUPPORTED_TEXT,
  E2EE_SEND_DISABLED_TEXT,
  isEncryptedMessage,
  isEncryptedSession,
  maskEncryptedMessage,
  assertPlaintextSendAllowed,
  blockEncryptedPendingPayload,
} from '../e2eeDeferred';
import type { MobileMessage } from '@/types/models';
import type { ChatSession } from '@im/shared-types';

const baseMessage: MobileMessage = {
  id: 'msg-1',
  messageId: 'server-1',
  clientMessageId: 'client-1',
  conversationId: 'conv-1',
  senderId: 'user-1',
  senderName: 'Alice',
  messageType: 'TEXT',
  content: 'hello',
  sendTime: new Date().toISOString(),
  status: 'SENT',
  isGroupChat: false,
  mediaUrl: 'https://example.com/img.jpg',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  mediaName: 'photo.jpg',
  mediaSize: 1024,
  duration: 30,
};

const baseSession: ChatSession = {
  id: 'conv-1',
  type: 'private',
  targetId: 'user-2',
  targetName: 'Bob',
  unreadCount: 0,
};

describe('isEncryptedMessage', () => {
  test('encrypted true is recognized', () => {
    expect(isEncryptedMessage({ encrypted: true })).toBe(true);
  });

  test('encrypted 1 is recognized', () => {
    expect(isEncryptedMessage({ encrypted: 1 })).toBe(true);
  });

  test('encrypted false is not recognized', () => {
    expect(isEncryptedMessage({ encrypted: false })).toBe(false);
  });

  test('encrypted 0 is not recognized', () => {
    expect(isEncryptedMessage({ encrypted: 0 })).toBe(false);
  });

  test('encrypted undefined is not recognized', () => {
    expect(isEncryptedMessage({})).toBe(false);
  });
});

describe('isEncryptedSession', () => {
  test('encrypted true session is recognized', () => {
    expect(isEncryptedSession({ ...baseSession, encrypted: true })).toBe(true);
  });

  test('plaintext session is not recognized', () => {
    expect(isEncryptedSession(baseSession)).toBe(false);
  });

  test('null session is not recognized', () => {
    expect(isEncryptedSession(null)).toBe(false);
  });

  test('undefined session is not recognized', () => {
    expect(isEncryptedSession(undefined)).toBe(false);
  });
});

describe('maskEncryptedMessage', () => {
  test('clears content, mediaUrl, thumbnailUrl, mediaName, mediaSize, duration for encrypted message', () => {
    const masked = maskEncryptedMessage({ ...baseMessage, encrypted: true });
    expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(masked.mediaUrl).toBeUndefined();
    expect(masked.thumbnailUrl).toBeUndefined();
    expect(masked.mediaName).toBeUndefined();
    expect(masked.mediaSize).toBeUndefined();
    expect(masked.duration).toBeUndefined();
  });

  test('preserves non-media fields for encrypted message', () => {
    const masked = maskEncryptedMessage({ ...baseMessage, encrypted: true });
    expect(masked.id).toBe('msg-1');
    expect(masked.senderId).toBe('user-1');
    expect(masked.messageType).toBe('TEXT');
  });

  test('returns plaintext message unchanged', () => {
    const original = { ...baseMessage, encrypted: false };
    const result = maskEncryptedMessage(original);
    expect(result).toBe(original);
    expect(result.content).toBe('hello');
    expect(result.mediaUrl).toBe('https://example.com/img.jpg');
  });
});

describe('assertPlaintextSendAllowed', () => {
  test('throws for encrypted session', () => {
    const encryptedSession = { ...baseSession, encrypted: true };
    expect(() => assertPlaintextSendAllowed(encryptedSession)).toThrow(E2EE_SEND_DISABLED_TEXT);
  });

  test('does not throw for plaintext session', () => {
    expect(() => assertPlaintextSendAllowed(baseSession)).not.toThrow();
  });

  test('does not throw for null session', () => {
    expect(() => assertPlaintextSendAllowed(null)).not.toThrow();
  });

  test('does not throw for undefined session', () => {
    expect(() => assertPlaintextSendAllowed(undefined)).not.toThrow();
  });
});

describe('blockEncryptedPendingPayload', () => {
  test('blocks top-level encrypted true', () => {
    expect(blockEncryptedPendingPayload({ encrypted: true, data: {} })).toBe(true);
  });

  test('blocks data.encrypted true', () => {
    expect(blockEncryptedPendingPayload({ data: { encrypted: true } })).toBe(true);
  });

  test('does not block plaintext payload', () => {
    expect(blockEncryptedPendingPayload({ data: { content: 'hello' } })).toBe(false);
  });

  test('does not block encrypted false', () => {
    expect(blockEncryptedPendingPayload({ encrypted: false, data: {} })).toBe(false);
  });

  test('does not block null payload', () => {
    expect(blockEncryptedPendingPayload(null)).toBe(false);
  });

  test('does not block non-object payload', () => {
    expect(blockEncryptedPendingPayload('string')).toBe(false);
    expect(blockEncryptedPendingPayload(42)).toBe(false);
    expect(blockEncryptedPendingPayload(undefined)).toBe(false);
  });
});

describe('maskEncryptedMessage — per message type coverage', () => {
  test('encrypted text message: content replaced with unsupported text', () => {
    const msg: MobileMessage = {
      ...baseMessage,
      messageType: 'TEXT',
      content: 'secret text',
      encrypted: true,
      mediaUrl: undefined,
      thumbnailUrl: undefined,
      mediaName: undefined,
      mediaSize: undefined,
      duration: undefined,
    };
    const masked = maskEncryptedMessage(msg);
    expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(masked.content).not.toContain('secret');
  });

  test('encrypted image message: mediaUrl, thumbnailUrl, mediaName, mediaSize cleared', () => {
    const msg: MobileMessage = {
      ...baseMessage,
      messageType: 'IMAGE',
      content: 'sent an image',
      mediaUrl: 'https://files.example.com/img/abc.jpg',
      thumbnailUrl: 'https://files.example.com/thumb/abc.jpg',
      mediaName: 'photo.jpg',
      mediaSize: 204800,
      encrypted: true,
    };
    const masked = maskEncryptedMessage(msg);
    expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(masked.mediaUrl).toBeUndefined();
    expect(masked.thumbnailUrl).toBeUndefined();
    expect(masked.mediaName).toBeUndefined();
    expect(masked.mediaSize).toBeUndefined();
  });

  test('encrypted video message: mediaUrl, thumbnailUrl, mediaName, mediaSize, duration cleared', () => {
    const msg: MobileMessage = {
      ...baseMessage,
      messageType: 'VIDEO',
      content: 'sent a video',
      mediaUrl: 'https://files.example.com/video/abc.mp4',
      thumbnailUrl: 'https://files.example.com/thumb/abc.jpg',
      mediaName: 'clip.mp4',
      mediaSize: 5242880,
      duration: 120,
      encrypted: true,
    };
    const masked = maskEncryptedMessage(msg);
    expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(masked.mediaUrl).toBeUndefined();
    expect(masked.thumbnailUrl).toBeUndefined();
    expect(masked.mediaName).toBeUndefined();
    expect(masked.mediaSize).toBeUndefined();
    expect(masked.duration).toBeUndefined();
  });

  test('encrypted file message: mediaUrl, mediaName, mediaSize cleared', () => {
    const msg: MobileMessage = {
      ...baseMessage,
      messageType: 'FILE',
      content: 'sent a file',
      mediaUrl: 'https://files.example.com/doc/abc.pdf',
      mediaName: 'report.pdf',
      mediaSize: 1048576,
      encrypted: true,
    };
    const masked = maskEncryptedMessage(msg);
    expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(masked.mediaUrl).toBeUndefined();
    expect(masked.mediaName).toBeUndefined();
    expect(masked.mediaSize).toBeUndefined();
  });

  test('encrypted voice message: mediaUrl, duration, mediaName cleared', () => {
    const msg: MobileMessage = {
      ...baseMessage,
      messageType: 'VOICE',
      content: '',
      mediaUrl: 'https://files.example.com/audio/abc.opus',
      mediaName: 'voice.opus',
      duration: 15,
      encrypted: true,
    };
    const masked = maskEncryptedMessage(msg);
    expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(masked.mediaUrl).toBeUndefined();
    expect(masked.mediaName).toBeUndefined();
    expect(masked.duration).toBeUndefined();
  });
});

describe('maskEncryptedMessage — plaintext not modified', () => {
  test('plaintext message retains all fields intact', () => {
    const msg: MobileMessage = {
      ...baseMessage,
      messageType: 'IMAGE',
      content: 'look at this',
      mediaUrl: 'https://files.example.com/img/safe.jpg',
      thumbnailUrl: 'https://files.example.com/thumb/safe.jpg',
      mediaName: 'photo.jpg',
      mediaSize: 512000,
      encrypted: false,
    };
    const result = maskEncryptedMessage(msg);
    expect(result.content).toBe('look at this');
    expect(result.mediaUrl).toBe('https://files.example.com/img/safe.jpg');
    expect(result.thumbnailUrl).toBe('https://files.example.com/thumb/safe.jpg');
    expect(result.mediaName).toBe('photo.jpg');
    expect(result.mediaSize).toBe(512000);
  });

  test('message without encrypted field is not masked', () => {
    const msg: MobileMessage = { ...baseMessage };
    delete (msg as unknown as Record<string, unknown>).encrypted;
    const result = maskEncryptedMessage(msg);
    expect(result.content).toBe('hello');
    expect(result.mediaUrl).toBe('https://example.com/img.jpg');
  });
});

describe('maskEncryptedMessage — input immutability', () => {
  test('does not mutate the input object', () => {
    const msg: MobileMessage = {
      ...baseMessage,
      encrypted: true,
      content: 'secret content',
      mediaUrl: 'https://files.example.com/img.jpg',
      thumbnailUrl: 'https://files.example.com/thumb.jpg',
      mediaName: 'photo.jpg',
      mediaSize: 1024,
      duration: 30,
    };
    const originalContent = msg.content;
    const originalMediaUrl = msg.mediaUrl;
    const originalThumbnailUrl = msg.thumbnailUrl;
    const originalMediaName = msg.mediaName;
    const originalMediaSize = msg.mediaSize;
    const originalDuration = msg.duration;

    maskEncryptedMessage(msg);

    expect(msg.content).toBe(originalContent);
    expect(msg.mediaUrl).toBe(originalMediaUrl);
    expect(msg.thumbnailUrl).toBe(originalThumbnailUrl);
    expect(msg.mediaName).toBe(originalMediaName);
    expect(msg.mediaSize).toBe(originalMediaSize);
    expect(msg.duration).toBe(originalDuration);
  });

  test('returns a new object reference for encrypted messages', () => {
    const msg: MobileMessage = { ...baseMessage, encrypted: true };
    const result = maskEncryptedMessage(msg);
    expect(result).not.toBe(msg);
  });

  test('returns same object reference for plaintext messages', () => {
    const msg: MobileMessage = { ...baseMessage, encrypted: false };
    const result = maskEncryptedMessage(msg);
    expect(result).toBe(msg);
  });
});

describe('E2EE copy text (E26 compliance)', () => {
  test('E2EE_UNSUPPORTED_TEXT indicates mobile is waiting for decrypt state and hides ciphertext', () => {
    expect(E2EE_UNSUPPORTED_TEXT).toContain('移动端');
    expect(E2EE_UNSUPPORTED_TEXT).toContain('密文');
    expect(E2EE_UNSUPPORTED_TEXT).toContain('等待加密通道');
    expect(E2EE_UNSUPPORTED_TEXT).toContain('移动端');
  });

  test('E2EE_SEND_DISABLED_TEXT indicates no automatic plaintext fallback', () => {
    expect(E2EE_SEND_DISABLED_TEXT).toContain('不会自动降级为明文');
  });

  test('E2EE_SEND_DISABLED_TEXT directs to negotiation recovery', () => {
    expect(E2EE_SEND_DISABLED_TEXT).toContain('重新建立加密通道');
  });
});
