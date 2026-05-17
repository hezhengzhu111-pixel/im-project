import type { ChatSession } from '@im/shared-types';
import { isEncryptedValue } from '@im/shared-e2ee-core';
import { e2eeSessionStore } from '@/e2ee/store/sessionStore';
import type { MobileMessage } from '@/types/models';

export const E2EE_UNSUPPORTED_TEXT = '端到端加密消息暂无法显示。正在等待加密通道或本机密钥恢复；移动端不会显示密文。';

export const E2EE_SEND_DISABLED_TEXT = '当前会话受端到端加密保护，不会自动降级为明文；请等待协商完成或重新建立加密通道。';

export const E2EE_WAITING_TEXT = '等待对方确认端到端加密请求';

export const E2EE_ENCRYPTED_MEDIA_UNSUPPORTED_TEXT = '当前移动端加密会话仅支持文字消息，暂不支持加密媒体。';

type EncryptedMarker = {
  encrypted?: unknown;
};

export const isEncryptedMessage = (message: EncryptedMarker): boolean =>
  isEncryptedValue(message.encrypted);

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
  return {
    ...message,
    content: E2EE_UNSUPPORTED_TEXT,
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
