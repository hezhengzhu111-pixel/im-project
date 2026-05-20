import {
  classifyE2eeError,
  isEncryptedValue,
  isRustE2eeEnvelope,
  normalizeEnvelope,
  sanitizeE2eeLogValue,
  type E2eeErrorClassification,
  type RustE2eeEnvelope,
} from '@im/shared-e2ee-core';
import {
  E2EE_OWN_PLAINTEXT_UNAVAILABLE_TEXT,
  E2EE_UNSUPPORTED_TEXT,
  hasKnownE2eeDisplayPlaintext,
  markE2eeDisplayDecrypted,
} from '@/e2ee/e2eeDeferred';
import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { logger } from '@/utils/logger';
import { resolveMessageSessionId } from '@/utils/normalizers';
import type { MobileMessage } from '@/types/models';

export type E2eeDecryptStatus = 'decrypted' | 'pending' | 'failed' | 'own-echo-preserved' | 'plaintext';

export interface ProcessedE2eeMessage {
  rawMessage: MobileMessage;
  displayMessage: MobileMessage;
  decryptStatus: E2eeDecryptStatus;
  errorClassification?: E2eeErrorClassification;
}

export interface ProcessMessageOptions {
  sessionId?: string;
  currentUserId: string;
  findOptimisticMessage?: (clientMessageId: string) => MobileMessage | undefined;
}

const legacyE2eeFieldNames = [
  'e2eeHeader',
  'e2ee_header',
  'e2eeSenderIdentityKey',
  'e2ee_sender_identity_key',
  'e2eeEphemeralKey',
  'e2ee_ephemeral_key',
];

const safePlaceholder = (
  message: MobileMessage,
  decryptStatus: Extract<E2eeDecryptStatus, 'pending' | 'failed'> = 'pending',
  content = E2EE_UNSUPPORTED_TEXT,
): MobileMessage => ({
  ...message,
  content,
  isE2eeDisplayDecrypted: false,
  decryptStatus,
  mediaUrl: undefined,
  thumbnailUrl: undefined,
  mediaName: undefined,
  mediaSize: undefined,
  duration: undefined,
});

const readNumberField = (message: MobileMessage, camelKey: keyof MobileMessage, snakeKey: string): number | undefined => {
  const camelValue = message[camelKey];
  if (typeof camelValue === 'number' && Number.isFinite(camelValue)) {
    return camelValue;
  }
  if (typeof camelValue === 'string' && camelValue.trim()) {
    const parsed = Number(camelValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const record = message as unknown as Record<string, unknown>;
  const snakeValue = record[snakeKey];
  if (typeof snakeValue === 'number' && Number.isFinite(snakeValue)) {
    return snakeValue;
  }
  if (typeof snakeValue === 'string' && snakeValue.trim()) {
    const parsed = Number(snakeValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const readEnvelope = (value: unknown): RustE2eeEnvelope | undefined => {
  const normalized = normalizeEnvelope(value);
  return normalized ?? undefined;
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
      e2eeDeviceId:
        typeof raw.e2eeDeviceId === 'string'
          ? raw.e2eeDeviceId
          : typeof raw.e2ee_device_id === 'string'
            ? raw.e2ee_device_id
            : message.e2eeDeviceId,
      e2eeEnvelope: readEnvelope(raw.e2eeEnvelope ?? raw.e2ee_envelope) ?? message.e2eeEnvelope,
      rawJson: message.rawJson,
    } as MobileMessage;
  } catch {
    return message;
  }
};

export const compareE2eeDecryptOrder = (left: MobileMessage, right: MobileMessage): number => {
  const leftTime = new Date(left.sendTime || 0).getTime();
  const rightTime = new Date(right.sendTime || 0).getTime();
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  const leftSeq = readNumberField(left, 'conversationSeq', 'conversation_seq');
  const rightSeq = readNumberField(right, 'conversationSeq', 'conversation_seq');
  if (leftSeq != null && rightSeq != null && leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }
  return (left.messageId || left.serverId || left.id || left.clientMessageId || '').localeCompare(
    right.messageId || right.serverId || right.id || right.clientMessageId || '',
  );
};

const hasLegacyEncryptedPayload = (message: MobileMessage): boolean => {
  const record = message as unknown as Record<string, unknown>;
  return legacyE2eeFieldNames.some((field) => typeof record[field] === 'string' && String(record[field]).length > 0);
};

const isRemotePrivateEncryptedText = (message: MobileMessage, currentUserId: string): boolean => {
  const raw = parseRawMessage(message);
  return (
    (isEncryptedValue(message.encrypted) || isEncryptedValue(raw.encrypted)) &&
    !raw.isGroupChat &&
    !raw.groupId &&
    !message.isGroupChat &&
    !message.groupId &&
    (raw.messageType || message.messageType) === 'TEXT' &&
    raw.senderId !== currentUserId
  );
};

const shouldKeepPending = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    message.includes('session state unavailable') ||
    message.includes('no handshake') ||
    message.includes('not been accepted')
  );
};

export const hasE2eeHandshake = (message: MobileMessage | undefined): boolean => {
  if (!message) return false;
  const envelope = message.e2eeEnvelope;
  if (!envelope || typeof envelope !== 'object') return false;
  return Boolean('handshake' in envelope && (envelope as unknown as Record<string, unknown>).handshake);
};

export const shouldDrainPendingAfterDecrypt = (processed: ProcessedE2eeMessage): boolean => {
  if (processed.decryptStatus !== 'decrypted') return false;
  return hasE2eeHandshake(processed.rawMessage) || hasE2eeHandshake(processed.displayMessage);
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
  if (hasKnownE2eeDisplayPlaintext(message)) {
    return {
      rawMessage,
      displayMessage: markE2eeDisplayDecrypted(baseDisplay, 'decrypted'),
      decryptStatus: 'decrypted',
    };
  }

  if (rawMessage.isGroupChat || rawMessage.groupId || message.isGroupChat || message.groupId) {
    return { rawMessage, displayMessage: safePlaceholder(baseDisplay, 'failed'), decryptStatus: 'failed' };
  }

  const isOwnEcho = Boolean(options.currentUserId && rawMessage.senderId === options.currentUserId);
  if (isOwnEcho) {
    const optimistic = rawMessage.clientMessageId ? options.findOptimisticMessage?.(rawMessage.clientMessageId) : undefined;
    if (optimistic?.content) {
      return {
        rawMessage,
        displayMessage: markE2eeDisplayDecrypted({
          ...baseDisplay,
          content: optimistic.content,
          status: message.status || optimistic.status,
        }, 'own-echo-preserved'),
        decryptStatus: 'own-echo-preserved',
      };
    }
    return {
      rawMessage,
      displayMessage: safePlaceholder(baseDisplay, 'pending', E2EE_OWN_PLAINTEXT_UNAVAILABLE_TEXT),
      decryptStatus: 'pending',
    };
  }

  const envelope = readEnvelope(rawMessage.e2eeEnvelope);
  if (!envelope || !isRustE2eeEnvelope(envelope)) {
    return {
      rawMessage,
      displayMessage: safePlaceholder(baseDisplay, 'failed', E2EE_UNSUPPORTED_TEXT),
      decryptStatus: hasLegacyEncryptedPayload(rawMessage) ? 'failed' : 'failed',
    };
  }

  try {
    const plaintext = await e2eeManager.decryptEnvelope(envelope, rawMessage.senderId || message.senderId || '');
    return {
      rawMessage,
      displayMessage: markE2eeDisplayDecrypted({
        ...baseDisplay,
        e2eeEnvelope: envelope,
        content: plaintext,
      }, 'decrypted'),
      decryptStatus: 'decrypted',
    };
  } catch (error) {
    const classification = classifyE2eeError(error);
    logger.warn('e2ee', 'encrypted message could not be displayed', sanitizeE2eeLogValue({
      sessionId,
      code: classification.code,
      category: classification.category,
      senderDeviceId: envelope.senderDeviceId,
      recipientDeviceId: envelope.recipientDeviceId,
      hasHandshake: Boolean(envelope.handshake),
    }));
    const pending = shouldKeepPending(error) || classification.retryable;
    return {
      rawMessage,
      displayMessage: safePlaceholder(baseDisplay, pending ? 'pending' : 'failed'),
      decryptStatus: pending ? 'pending' : 'failed',
      errorClassification: pending && !classification.retryable
        ? { ...classification, retryable: true }
        : classification,
    };
  }
};

export const processE2eeMessages = async (
  messages: MobileMessage[],
  options: ProcessMessageOptions & { concurrency?: number },
): Promise<ProcessedE2eeMessage[]> => {
  const results: ProcessedE2eeMessage[] = new Array(messages.length);
  const remoteBySession = new Map<string, Array<{ index: number; message: MobileMessage }>>();
  const independentWork: Array<Promise<void>> = [];

  messages.forEach((message, index) => {
    if (isRemotePrivateEncryptedText(message, options.currentUserId)) {
      const parsed = parseRawMessage(message);
      const sessionId = options.sessionId || resolveMessageSessionId(parsed, options.currentUserId) || parsed.conversationId || message.conversationId || '';
      const bucket = remoteBySession.get(sessionId) || [];
      bucket.push({ index, message });
      remoteBySession.set(sessionId, bucket);
      return;
    }
    independentWork.push(
      processE2eeMessage(message, options).then((processed) => {
        results[index] = processed;
      }),
    );
  });

  await Promise.all(independentWork);
  await Promise.all([...remoteBySession.entries()].map(async ([sessionId, items]) => {
    items.sort((left, right) => compareE2eeDecryptOrder(left.message, right.message));
    for (const item of items) {
      results[item.index] = await processE2eeMessage(item.message, { ...options, sessionId });
    }
  }));

  return results;
};
