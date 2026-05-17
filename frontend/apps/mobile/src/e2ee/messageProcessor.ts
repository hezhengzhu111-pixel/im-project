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

const readStringField = (message: MobileMessage, camelKey: keyof MobileMessage, snakeKey: string): string => {
  const camelValue = message[camelKey];
  if (typeof camelValue === 'string' && camelValue) {
    return camelValue;
  }
  const record = message as Record<string, unknown>;
  const snakeValue = record[snakeKey];
  return typeof snakeValue === 'string' ? snakeValue : '';
};

const parseRawMessage = (message: MobileMessage): MobileMessage => {
  if (!message.rawJson) {
    return message;
  }
  try {
    const raw = JSON.parse(message.rawJson) as Record<string, unknown>;
    return {
      ...message,
      ...raw,
      encrypted: raw.encrypted ?? message.encrypted,
      e2eeHeader: readStringField(raw as MobileMessage, 'e2eeHeader', 'e2ee_header') || message.e2eeHeader,
      e2eeDeviceId: readStringField(raw as MobileMessage, 'e2eeDeviceId', 'e2ee_device_id') || message.e2eeDeviceId,
      e2eeSenderIdentityKey:
        readStringField(raw as MobileMessage, 'e2eeSenderIdentityKey', 'e2ee_sender_identity_key') ||
        message.e2eeSenderIdentityKey,
      e2eeEphemeralKey:
        readStringField(raw as MobileMessage, 'e2eeEphemeralKey', 'e2ee_ephemeral_key') ||
        message.e2eeEphemeralKey,
      rawJson: message.rawJson,
    } as MobileMessage;
  } catch {
    return message;
  }
};

const parseHeader = (message: MobileMessage): RatchetHeader => {
  const headerJson = readStringField(message, 'e2eeHeader', 'e2ee_header');
  if (!headerJson) {
    throw new Error('E2EE message header unavailable');
  }
  const parsed = JSON.parse(headerJson) as Partial<RatchetHeader>;
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
  if (!isEncryptedValue(message.encrypted) && !isEncryptedValue(rawMessage.encrypted)) {
    return { rawMessage, displayMessage: message, decryptStatus: 'plaintext' };
  }

  const sessionId = options.sessionId || resolveMessageSessionId(rawMessage, options.currentUserId) || rawMessage.conversationId || message.conversationId || '';
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

  if (rawMessage.isGroupChat || rawMessage.groupId || message.isGroupChat || message.groupId) {
    return { rawMessage, displayMessage: safePlaceholder(baseDisplay), decryptStatus: 'failed' };
  }

  const isOwnEcho = Boolean(options.currentUserId && rawMessage.senderId === options.currentUserId);
  if (isOwnEcho) {
    const optimistic = rawMessage.clientMessageId ? options.findOptimisticMessage?.(rawMessage.clientMessageId) : undefined;
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
    const header = parseHeader(rawMessage);
    const ciphertext = rawMessage.content || message.content || '';
    if (!ciphertext || ciphertext === E2EE_UNSUPPORTED_TEXT) {
      throw new Error('E2EE ciphertext unavailable');
    }
    const plaintext = await e2eeManager.decryptMessage(sessionId, rawMessage.senderId || message.senderId || '', header, ciphertext);
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
      hasHeader: Boolean(readStringField(rawMessage, 'e2eeHeader', 'e2ee_header')),
      hasCiphertext: Boolean(rawMessage.content && rawMessage.content !== E2EE_UNSUPPORTED_TEXT),
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