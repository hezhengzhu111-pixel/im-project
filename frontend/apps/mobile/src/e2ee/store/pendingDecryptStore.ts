import { isEncryptedValue } from '@im/shared-e2ee-core';
import { E2EE_DECRYPT_RETRY_CONFIG } from '@/constants/config';
import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import { messageRepository } from '@/services/storage/messageRepository';
import type { MobileMessage } from '@/types/models';

export interface PendingEncryptedMessageEntry {
  sessionId: string;
  message: MobileMessage;
  cachedAt: number;
  retryCount: number;
  nextRetryAt?: number;
  lastError?: string;
  lastTriedAt?: number;
}

interface PendingDecryptHandlers {
  retryPendingMessages: (sessionId: string, entries: PendingEncryptedMessageEntry[]) => Promise<PendingEncryptedMessageEntry[]>;
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
  const existingIndex = list.findIndex((entry) => identityFor(entry.message) === key);

  if (existingIndex >= 0) {
    // Preserve retry metadata when message hasn't changed meaningfully.
    // Only reset retryCount if the envelope content has changed (e.g. re-sent with handshake).
    const existing = list[existingIndex];
    const existingEnvelope = JSON.stringify(existing.message.e2eeEnvelope ?? '');
    const newEnvelope = JSON.stringify(message.e2eeEnvelope ?? '');
    const envelopeChanged = existingEnvelope !== newEnvelope;
    const next = list.slice();
    next[existingIndex] = {
      ...existing,
      message: withRawJson({ ...message, conversationId: sessionId }),
      cachedAt: Date.now(),
      retryCount: envelopeChanged ? 0 : existing.retryCount,
      nextRetryAt: envelopeChanged ? undefined : existing.nextRetryAt,
      lastError: envelopeChanged ? undefined : existing.lastError,
      lastTriedAt: envelopeChanged ? undefined : existing.lastTriedAt,
    };
    pendingBySession.set(sessionId, next);
    return;
  }

  const nextEntry: PendingEncryptedMessageEntry = {
    sessionId,
    message: withRawJson({ ...message, conversationId: sessionId }),
    cachedAt: Date.now(),
    retryCount: 0,
  };
  pendingBySession.set(sessionId, [...list, nextEntry]);
};

export const getPendingEncryptedMessages = (sessionId: string): MobileMessage[] =>
  (pendingBySession.get(sessionId) || []).map((entry) => entry.message);

export const getReadyPendingEncryptedMessages = (
  sessionId: string,
  now = Date.now(),
): PendingEncryptedMessageEntry[] => {
  const list = pendingBySession.get(sessionId) || [];
  return list.filter((entry) => entry.nextRetryAt == null || entry.nextRetryAt <= now);
};

export const setPendingEntries = (sessionId: string, entries: PendingEncryptedMessageEntry[]): void => {
  if (entries.length === 0) {
    pendingBySession.delete(sessionId);
    return;
  }
  pendingBySession.set(sessionId, entries);
};

export const replacePendingEncryptedMessages = (sessionId: string, messages: MobileMessage[]): void => {
  if (messages.length === 0) {
    pendingBySession.delete(sessionId);
    return;
  }
  const existingList = pendingBySession.get(sessionId) || [];
  const existingByKey = new Map<string, PendingEncryptedMessageEntry>();
  for (const entry of existingList) {
    existingByKey.set(identityFor(entry.message), entry);
  }

  pendingBySession.set(
    sessionId,
    messages.map((message) => {
      const key = identityFor(message);
      const existing = existingByKey.get(key);
      return {
        sessionId,
        message: withRawJson({ ...message, conversationId: sessionId }),
        cachedAt: existing?.cachedAt ?? Date.now(),
        retryCount: existing?.retryCount ?? 0,
        nextRetryAt: existing?.nextRetryAt,
        lastError: existing?.lastError,
        lastTriedAt: existing?.lastTriedAt,
      };
    }),
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
      // messageRepository.listPendingEncryptedMessages already filters out
      // decryptStatus='failed', so we can safely create entries with retryCount=0.
      cachePendingEncryptedMessage(targetSessionId, message);
    }
  });
  return messages.length;
};

/**
 * Retry all ready pending encrypted messages across every session.
 *
 * Returns the total number of entries resolved this round.  "Resolved"
 * means removed from the runtime pending queue — this includes both
 * successfully decrypted messages and dead-letter / failed entries that
 * the handler chose not to return.  It is NOT a count of decrypted messages.
 */
export const retryAllPendingEncryptedMessages = async (): Promise<number> => {
  if (!handlers) {
    return 0;
  }
  const config = E2EE_DECRYPT_RETRY_CONFIG;
  let totalResolved = 0;
  let globalProcessed = 0;

  for (const sessionId of listPendingEncryptedSessionIds()) {
    if (globalProcessed >= config.maxGlobal) {
      break;
    }
    const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
    if (ready.length === 0) {
      continue;
    }
    const remainingGlobal = config.maxGlobal - globalProcessed;
    const batch = ready.slice(0, Math.min(config.maxPerSession, remainingGlobal));
    globalProcessed += batch.length;

    const batchKeys = new Set(batch.map((e) => identityFor(e.message)));
    const remaining = await handlers.retryPendingMessages(sessionId, batch);

    const allEntries = pendingBySession.get(sessionId) || [];
    const merged = [
      ...allEntries.filter((e) => !batchKeys.has(identityFor(e.message))),
      ...remaining,
    ];
    setPendingEntries(sessionId, merged);

    totalResolved += batch.length - remaining.length;
  }
  return totalResolved;
};

const inflightRetries = new Set<string>();

/**
 * Retry ready pending encrypted messages for a single session.
 *
 * Returns the number of entries resolved this round (removed from the
 * runtime queue).  Like retryAllPendingEncryptedMessages, "resolved"
 * includes both successfully decrypted messages and dead-letter / failed
 * entries that the handler chose not to return.
 */
export const retryDecryptPendingMessages = async (sessionId: string): Promise<number> => {
  if (inflightRetries.has(sessionId)) {
    return 0;
  }
  const ready = getReadyPendingEncryptedMessages(sessionId, Date.now());
  if (!handlers || ready.length === 0) {
    return 0;
  }
  const batch = ready.slice(0, E2EE_DECRYPT_RETRY_CONFIG.maxPerSession);
  const batchKeys = new Set(batch.map((e) => identityFor(e.message)));

  inflightRetries.add(sessionId);
  try {
    const remaining = await handlers.retryPendingMessages(sessionId, batch);

    const allEntries = pendingBySession.get(sessionId) || [];
    const merged = [
      ...allEntries.filter((e) => !batchKeys.has(identityFor(e.message))),
      ...remaining,
    ];
    setPendingEntries(sessionId, merged);

    return batch.length - remaining.length;
  } finally {
    inflightRetries.delete(sessionId);
  }
};

export const retryDecryptVisibleEncryptedMessages = async (sessionId: string): Promise<number> => {
  if (!handlers) {
    return 0;
  }
  return handlers.retryVisibleMessages(sessionId);
};
