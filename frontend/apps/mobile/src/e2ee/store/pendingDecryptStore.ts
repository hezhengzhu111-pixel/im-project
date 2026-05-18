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

const withRawJson = (message: MobileMessage): MobileMessage => ({
  ...message,
  rawJson: message.rawJson || JSON.stringify(message),
});

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

