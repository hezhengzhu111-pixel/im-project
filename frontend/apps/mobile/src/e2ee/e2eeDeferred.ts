import type { ChatSession } from '@im/shared-types';
import { isEncryptedValue } from '@im/shared-e2ee-core';
import type { MobileMessage } from '@/types/models';

export const E2EE_UNSUPPORTED_TEXT =
  '此端到端加密消息暂不能在移动端查看，请在 Web 端查看。';

export const E2EE_SEND_DISABLED_TEXT =
  '移动端暂不支持端到端加密会话发送，不会自动改为明文发送，请切换到 Web 端或关闭加密通道。';

type EncryptedMarker = {
  encrypted?: unknown;
};

export const isEncryptedMessage = (message: EncryptedMarker): boolean =>
  isEncryptedValue(message.encrypted);

export const isEncryptedSession = (
  session?: Pick<ChatSession, 'encrypted' | 'lastMessage'> | null,
): boolean =>
  isEncryptedValue(session?.encrypted) || Boolean(session?.lastMessage && isEncryptedMessage(session.lastMessage));

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
  if (isEncryptedSession(session)) {
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
  return hasEncryptedMarker(payload);
};
