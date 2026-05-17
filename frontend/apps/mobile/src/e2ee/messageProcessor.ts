import { classifyE2eeError, isEncryptedValue, sanitizeE2eeLogValue, type RatchetHeader } from '@im/shared-e2ee-core';
import { E2EE_UNSUPPORTED_TEXT } from '@/e2ee/e2eeDeferred';
import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { logger } from '@/utils/logger';
import { resolveMessageSessionId } from '@/utils/normalizers';
import type { MobileMessage } from '@/types/models';

export type E2eeDecryptStatus = 'decrypted' | 'pending' | 'failed' | 'own-echo-preserved' | 'plaintext';

export interface ProcessedE2eeMessage {
  rawMessage: MobileMessage;
  displayMessage: MobileMessage;
  decryptStatus: E2eeDecryptStatus;
}

export interface ProcessMessageOptions {
  sessionId?: string;
  currentUserId: string;
  findOptimisticMessage?: (clientMessageId: string) => MobileMessage | undefined;
}

const safePlaceholder = (message: MobileMessage): MobileMessage => ({
  ...message,
  content: E2EE_UNSUPPORTED_TEXT,
  mediaUrl: undefined,
  thumbnailUrl: undefined,
  mediaName: undefined,
  mediaSize: undefined,
  duration: undefined,
});

const parseRawMessage = (message: MobileMessage): MobileMessage => {
  if (!message.rawJson) {
    return message;
  }
  try {
    return { ...message, ...(JSON.parse(message.rawJson) as MobileMessage), rawJson: message.rawJson };
  } catch {
    return message;
  }
};

const parseHeader = (message: MobileMessage): RatchetHeader => {
  if (!message.e2eeHeader || typeof message.e2eeHeader !== 'string') {
    throw new Error('E2EE message header unavailable');
  }
  const parsed = JSON.parse(message.e2eeHeader) as Partial<RatchetHeader>;
  if (
    typeof parsed.ratchetPublicKey !== 'string' ||
    typeof parsed.counter !== 'number' ||
    typeof parsed.previousCounter !== 'number' ||
    typeof parsed.iv !== 'string'
  ) {
    throw new Error('E2EE message header invalid');
  }
  return {
    ratchetPublicKey: parsed.ratchetPublicKey,
    counter: parsed.counter,
    previousCounter: parsed.previousCounter,
    iv: parsed.iv,
  };
};

export const processE2eeMessage = async (
  message: MobileMessage,
  options: ProcessMessageOptions,
): Promise<ProcessedE2eeMessage> => {
  const rawMessage: MobileMessage = {
    ...parseRawMessage(message),
    rawJson: message.rawJson || JSON.stringify(message),
  };
  if (!isEncryptedValue(message.encrypted)) {
    return { rawMessage, displayMessage: message, decryptStatus: 'plaintext' };
  }

  const sessionId = options.sessionId || resolveMessageSessionId(message, options.currentUserId) || message.conversationId || '';
  const baseDisplay = { ...message, conversationId: sessionId || message.conversationId, rawJson: rawMessage.rawJson };
  if (
    message.rawJson &&
    message.content &&
    rawMessage.content &&
    message.content !== rawMessage.content &&
    message.content !== E2EE_UNSUPPORTED_TEXT
  ) {
    return { rawMessage, displayMessage: baseDisplay, decryptStatus: 'decrypted' };
  }

  if (message.isGroupChat || message.groupId) {
    return { rawMessage, displayMessage: safePlaceholder(baseDisplay), decryptStatus: 'failed' };
  }

  const isOwnEcho = Boolean(options.currentUserId && message.senderId === options.currentUserId);
  if (isOwnEcho) {
    const optimistic = message.clientMessageId ? options.findOptimisticMessage?.(message.clientMessageId) : undefined;
    if (optimistic?.content) {
      return {
        rawMessage,
        displayMessage: {
          ...baseDisplay,
          content: optimistic.content,
          status: message.status || optimistic.status,
        },
        decryptStatus: 'own-echo-preserved',
      };
    }
    return { rawMessage, displayMessage: safePlaceholder(baseDisplay), decryptStatus: 'pending' };
  }

  try {
    const header = parseHeader(message);
    const plaintext = await e2eeManager.decryptMessage(sessionId, message.senderId || '', header, rawMessage.content || message.content || '');
    return {
      rawMessage,
      displayMessage: {
        ...baseDisplay,
        content: plaintext,
      },
      decryptStatus: 'decrypted',
    };
  } catch (error) {
    const classification = classifyE2eeError(error);
    logger.warn('e2ee', 'encrypted message could not be displayed', sanitizeE2eeLogValue({
      sessionId,
      code: classification.code,
      category: classification.category,
    }));
    return {
      rawMessage,
      displayMessage: safePlaceholder(baseDisplay),
      decryptStatus: classification.code === 'NO_RATCHET_STATE' || classification.code === 'NEGOTIATION_NOT_ACCEPTED'
        ? 'pending'
        : 'failed',
    };
  }
};

export const processE2eeMessages = async (
  messages: MobileMessage[],
  options: ProcessMessageOptions & { concurrency?: number },
): Promise<ProcessedE2eeMessage[]> => {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  const results: ProcessedE2eeMessage[] = new Array(messages.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, messages.length) }, async () => {
    while (cursor < messages.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await processE2eeMessage(messages[index], options);
    }
  });
  await Promise.all(workers);
  return results;
};
