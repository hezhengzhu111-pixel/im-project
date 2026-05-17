import { E2EE_ENCRYPTED_MEDIA_UNSUPPORTED_TEXT, E2EE_SEND_DISABLED_TEXT, E2EE_UNSUPPORTED_TEXT, blockEncryptedPendingPayload, maskEncryptedMessage } from '../e2eeDeferred';
import { getMobileE2eeCapability } from '../e2eeCapability';
import { useAuthStore } from '@/stores/authStore';

describe('mobile E2EE full-mode safety', () => {
  beforeEach(() => {
    useAuthStore.setState({
      currentUser: { id: '100', username: 'alice', nickname: 'Alice', status: 'online' },
      authReady: true,
    });
  });

  it('enables full capability when runtime and account namespace are available', () => {
    const cap = getMobileE2eeCapability();
    expect(cap.mode).toBe('full');
    expect(cap.canSendEncrypted).toBe(true);
    expect(cap.canDecryptEncrypted).toBe(true);
  });

  it('keeps failed capability safe when account namespace is unavailable', () => {
    useAuthStore.setState({ currentUser: null });
    const cap = getMobileE2eeCapability();
    expect(cap.mode).toBe('failed');
    expect(cap.canSendEncrypted).toBe(false);
    expect(cap.canDecryptEncrypted).toBe(false);
  });

  it('masks encrypted messages without leaking ciphertext', () => {
    const masked = maskEncryptedMessage({
      id: 'msg-1',
      senderId: '200',
      messageType: 'TEXT',
      content: 'ciphertext-secret',
      sendTime: new Date().toISOString(),
      status: 'SENT',
      encrypted: true,
      isGroupChat: false,
      mediaUrl: 'https://files.example.com/x.png',
    });
    expect(masked.content).toBe(E2EE_UNSUPPORTED_TEXT);
    expect(masked.content).not.toContain('ciphertext-secret');
    expect(masked.mediaUrl).toBeUndefined();
  });

  it('allows retry for complete encrypted private payloads only', () => {
    expect(blockEncryptedPendingPayload({
      sendType: 'private',
      encrypted: true,
      data: {
        receiverId: '200',
        clientMessageId: 'client-1',
        messageType: 'TEXT',
        content: 'ciphertext',
        encrypted: true,
        e2eeHeader: '{"counter":0}',
        e2eeDeviceId: 'device-1',
      },
    })).toBe(false);

    expect(blockEncryptedPendingPayload({
      sendType: 'private',
      encrypted: true,
      data: {
        clientMessageId: 'client-1',
        messageType: 'TEXT',
        content: 'plaintext',
      },
    })).toBe(true);
  });

  it('keeps no-plaintext-downgrade copy explicit', () => {
    expect(E2EE_SEND_DISABLED_TEXT).toContain('不会自动降级为明文');
  });

  it('keeps encrypted media explicitly out of mobile full-mode scope', () => {
    expect(E2EE_ENCRYPTED_MEDIA_UNSUPPORTED_TEXT).toContain('仅支持文字消息');
  });
});