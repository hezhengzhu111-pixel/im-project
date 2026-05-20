import { isEncryptedValue } from '@im/shared-e2ee-core';
import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import { messageRepository } from '@/services/storage/messageRepository';
import type { MobileMessage } from '@/types/models';

export interface PendingEncryptedMessageEntry {
  sessionId: string;
  message: MobileMessage;
  cachedAt: number;
}

interface PendingDecryptHandlers {
  retryPendingMessages: (sessionId: string, messages: MobileMessage[]) => Promise<number>;
  retryVisibleMessages: (sessionId: string) => Promise<number>;
}

const pendingBySession = new Map<string, PendingEncryptedMessageEntry[]>();
let handlers: PendingDecryptHandlers | null = null;

const identityFor = (message: MobileMessage): string =>
  message.messageId || message.serverId || message.clientMessageId || message.id || `${message.senderId}:${message.sendTime}`;

const pendingSafeMessage = (message: MobileMessage): MobileMessage => {
  if (!isEncryptedValue(message.encrypted)) {
    return message;
  }
  const raw = (() => {
    if (!message.rawJson) {
      return { ...message };
    }
    try {
      return JSON.parse(message.rawJson) as Record<string, unknown>;
    } catch {
      return { ...message };
    }
  })();
  const rawJson = JSON.stringify({
    ...raw,
    content: E2EE_UNSUPPORTED_TEXT,
    mediaUrl: undefined,
    media_url: undefined,
    thumbnailUrl: undefined,
    thumbnail_url: undefined,
    mediaName: undefined,
    media_name: undefined,
    mediaSize: undefined,
    media_size: undefined,
    duration: undefined,
    encrypted: true,
    e2eeEnvelope: message.e2eeEnvelope ?? raw.e2eeEnvelope ?? raw.e2ee_envelope,
  });
  return {
    ...message,
    content: E2EE_UNSUPPORTED_TEXT,
    rawJson,
    mediaUrl: undefined,
    thumbnailUrl: undefined,
    mediaName: undefined,
    mediaSize: undefined,
    duration: undefined,
  };
};

const withRawJson = (message: MobileMessage): MobileMessage => {
  const safeMessage = pendingSafeMessage(message);
  return {
    ...safeMessage,
    rawJson: safeMessage.rawJson || JSON.stringify(safeMessage),
  };
};

export const configurePendingDecryptQueue = (nextHandlers: PendingDecryptHandlers): void => {
  handlers = nextHandlers;
};

export const cachePendingEncryptedMessage = (sessionId: string, message: MobileMessage): void => {
  if (!sessionId) {
    return;
  }
  const key = identityFor(message);
  const list = pendingBySession.get(sessionId) || [];
  const nextEntry: PendingEncryptedMessageEntry = {
    sessionId,
    message: withRawJson({ ...message, conversationId: sessionId }),
    cachedAt: Date.now(),
  };
  const existingIndex = list.findIndex((entry) => identityFor(entry.message) === key);
  if (existingIndex >= 0) {
    const next = list.slice();
    next[existingIndex] = nextEntry;
    pendingBySession.set(sessionId, next);
    return;
  }
  pendingBySession.set(sessionId, [...list, nextEntry]);
};

export const getPendingEncryptedMessages = (sessionId: string): MobileMessage[] =>
  (pendingBySession.get(sessionId) || []).map((entry) => entry.message);

export const replacePendingEncryptedMessages = (sessionId: string, messages: MobileMessage[]): void => {
  if (messages.length === 0) {
    pendingBySession.delete(sessionId);
    return;
  }
  pendingBySession.set(
    sessionId,
    messages.map((message) => ({
      sessionId,
      message: withRawJson({ ...message, conversationId: sessionId }),
      cachedAt: Date.now(),
    })),
  );
};

export const clearPendingEncryptedMessages = (sessionId: string): void => {
  pendingBySession.delete(sessionId);
};

export const clearAllPendingEncryptedMessages = (): void => {
  pendingBySession.clear();
};

export const listPendingEncryptedSessionIds = (): string[] => [...pendingBySession.keys()];

export const restorePendingEncryptedMessagesFromRepository = (sessionId?: string): number => {
  const messages = messageRepository.listPendingEncryptedMessages(sessionId);
  messages.forEach((message) => {
    const targetSessionId = sessionId || message.conversationId || '';
    if (targetSessionId) {
      cachePendingEncryptedMessage(targetSessionId, message);
    }
  });
  return messages.length;
};

export const retryAllPendingEncryptedMessages = async (): Promise<number> => {
  if (!handlers) {
    return 0;
  }
  let decrypted = 0;
  for (const sessionId of listPendingEncryptedSessionIds()) {
    decrypted += await retryDecryptPendingMessages(sessionId);
  }
  return decrypted;
};

export const retryDecryptPendingMessages = async (sessionId: string): Promise<number> => {
  const messages = getPendingEncryptedMessages(sessionId);
  if (!handlers || messages.length === 0) {
    return 0;
  }
  return handlers.retryPendingMessages(sessionId, messages);
};

export const retryDecryptVisibleEncryptedMessages = async (sessionId: string): Promise<number> => {
  if (!handlers) {
    return 0;
  }
  return handlers.retryVisibleMessages(sessionId);
};
