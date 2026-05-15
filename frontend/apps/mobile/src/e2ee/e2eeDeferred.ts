import type { ChatSession } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';

export const E2EE_UNSUPPORTED_TEXT =
  '此端到端加密消息暂不能在移动端查看，请在 Web 端查看。';

export const E2EE_SEND_DISABLED_TEXT =
  '移动端暂不支持端到端加密会话发送，请切换到 Web 端或关闭加密通道。';

export const isEncryptedMessage = (message: Pick<MobileMessage, 'encrypted'>): boolean =>
  message.encrypted === true || message.encrypted === 1;

export const isEncryptedSession = (session?: Pick<ChatSession, 'encrypted'> | null): boolean =>
  Boolean(session?.encrypted);

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
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const nested = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : {};
  return record.encrypted === true || nested.encrypted === true;
};
