import type { ChatSession } from '@im/shared-types';
import { isEncryptedValue } from '@im/shared-e2ee-core';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import type { MobileMessage } from '@/types/models';

export const E2EE_UNSUPPORTED_TEXT = '端到端加密消息暂无法显示。正在等待加密通道或本机密钥恢复；移动端不会显示密文。';

export const E2EE_SEND_DISABLED_TEXT = '当前会话受端到端加密保护，不会自动降级为明文；请等待协商完成或重新建立加密通道。';

export const E2EE_WAITING_TEXT = '等待对方确认端到端加密请求';

export const E2EE_ENCRYPTED_MEDIA_UNSUPPORTED_TEXT = '当前移动端加密会话仅支持文字消息，暂不支持加密媒体。';

export const E2EE_OWN_PLAINTEXT_UNAVAILABLE_TEXT = '此设备未保存该端到端加密消息的明文，移动端不会显示密文。';

type EncryptedMarker = {
  encrypted?: unknown;
};

export const isEncryptedMessage = (message: EncryptedMarker): boolean =>
  isEncryptedValue(message.encrypted);

const safeEncryptedDisplayStatuses = new Set(['decrypted', 'own-echo-preserved']);

export const hasKnownE2eeDisplayPlaintext = (message: MobileMessage): boolean => {
  if (!isEncryptedMessage(message)) {
    return false;
  }
  if (message.isE2eeDisplayDecrypted || safeEncryptedDisplayStatuses.has(String(message.decryptStatus || ''))) {
    return Boolean(message.content && message.content !== E2EE_UNSUPPORTED_TEXT);
  }
  return false;
};

export const markE2eeDisplayDecrypted = (
  message: MobileMessage,
  decryptStatus: MobileMessage['decryptStatus'] = 'decrypted',
): MobileMessage => ({
  ...message,
  isE2eeDisplayDecrypted: true,
  decryptStatus,
  mediaUrl: undefined,
  thumbnailUrl: undefined,
  mediaName: undefined,
  mediaSize: undefined,
  duration: undefined,
});

export const isEncryptedSession = (
  session?: Pick<ChatSession, 'encrypted' | 'lastMessage'> | null,
): boolean =>
  isEncryptedValue(session?.encrypted) || Boolean(session?.lastMessage && isEncryptedMessage(session.lastMessage));

export const getSessionE2eeStatus = (
  session?: Pick<ChatSession, 'id' | 'encrypted' | 'lastMessage'> | null,
) => {
  if (!session?.id) {
    return 'plaintext' as const;
  }
  const localStatus = e2eeSessionStore.getCachedStatus(session.id);
  if (localStatus !== 'plaintext') {
    return localStatus;
  }
  return isEncryptedSession(session) ? 'failed' : 'plaintext';
};

export const maskEncryptedMessage = (message: MobileMessage): MobileMessage => {
  if (!isEncryptedMessage(message)) {
    return message;
  }
  if (hasKnownE2eeDisplayPlaintext(message)) {
    return markE2eeDisplayDecrypted(
      message,
      safeEncryptedDisplayStatuses.has(String(message.decryptStatus || ''))
        ? message.decryptStatus
        : 'decrypted',
    );
  }
  return {
    ...message,
    content: E2EE_UNSUPPORTED_TEXT,
    isE2eeDisplayDecrypted: false,
    decryptStatus: message.decryptStatus === 'plaintext' ? 'pending' : message.decryptStatus || 'pending',
    mediaUrl: undefined,
    thumbnailUrl: undefined,
    mediaName: undefined,
    mediaSize: undefined,
    duration: undefined,
  };
};

export const assertPlaintextSendAllowed = (session?: ChatSession | null): void => {
  const status = getSessionE2eeStatus(session);
  if (status === 'negotiating' || status === 'encrypted' || status === 'failed') {
    throw new Error(E2EE_SEND_DISABLED_TEXT);
  }
};

export const blockEncryptedPendingPayload = (payload: unknown): boolean => {
  const hasEncryptedMarker = (value: unknown, depth = 0): boolean => {
    if (!value || typeof value !== 'object' || depth > 6) {
      return false;
    }
    const record = value as Record<string, unknown>;
    if (isEncryptedValue(record.encrypted)) {
      return true;
    }
    return Object.values(record).some((child) => hasEncryptedMarker(child, depth + 1));
  };

  if (!payload || typeof payload !== 'object') {
    return false;
  }
  if (!hasEncryptedMarker(payload)) {
    return false;
  }
  const record = payload as { sendType?: unknown; data?: Record<string, unknown> };
  const data = record.data;
  if (record.sendType !== 'private' || !data) {
    return true;
  }
  return !(
    typeof data.clientMessageId === 'string' &&
    typeof data.receiverId === 'string' &&
    typeof data.content === 'string' &&
    isEncryptedValue(data.encrypted) &&
    typeof data.e2eeHeader === 'string' &&
    typeof data.e2eeDeviceId === 'string'
  );
};
