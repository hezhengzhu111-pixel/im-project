import type { ChatSession } from '@im/shared-types';
import type { RustE2eeEnvelope } from '@im/shared-e2ee-core';
import { sanitizeE2eeLogValue } from '@im/shared-e2ee-core';
import { createNextRetryAt, shouldStopRetry } from '@im/shared-im-core';
import { RETRY_CONFIG } from '@/constants/config';
import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { logger } from '@/utils/logger';
import type { MobileMessage, PendingMessage } from '@/types/models';
import type { SendMessagePayload } from '@/services/chat/messageService';

/**
 * Extends the standard PendingSendPayload with E2EE-wait metadata.
 *
 * These fields are persisted inside the pending payloadJson so that the
 * retry pipeline can distinguish "waiting for E2EE negotiation" from
 * normal plaintext sends and encrypted retries.
 *
 * SECURITY NOTE: The `plaintext` field stores the user's message content
 * in plaintext inside the local pending store. This is consistent with
 * the existing mobile pending send persistence model, where
 * `data.content` already carries plaintext for non-encrypted sends.
 * The pending store is local SQLite and is never transmitted over the
 * network — plaintext is cleared from the payload (replaced by
 * e2eeEnvelope) before the actual encrypted send.
 */
export interface E2eePendingMeta {
  requiresE2ee?: boolean;
  e2eeWaitReason?: 'negotiation' | 'prekey' | 'state';
  plaintext?: string;
}

export interface PendingSendPayload extends E2eePendingMeta {
  sendType: 'private' | 'group';
  data: SendMessagePayload;
  encrypted?: boolean;
  uploadTaskId?: string;
}

const hasE2eePendingMeta = (payload: unknown): payload is PendingSendPayload & Required<Pick<E2eePendingMeta, 'requiresE2ee'>> => {
  if (!payload || typeof payload !== 'object') return false;
  return (payload as Record<string, unknown>).requiresE2ee === true;
};

/**
 * Enqueue a text message as "waiting for E2EE negotiation" in the pending
 * send queue. The message will NOT be sent as plaintext; it stays pending
 * until the session E2EE status becomes `encrypted` and the caller
 * triggers `retryMessage`.
 */
export function enqueuePendingE2eeText(
  session: ChatSession,
  message: MobileMessage,
  plaintext: string,
  reason: 'negotiation' | 'prekey' | 'state',
): void {
  const now = Date.now();
  const payload: PendingSendPayload = {
    sendType: 'private',
    requiresE2ee: true,
    e2eeWaitReason: reason,
    plaintext,
    data: {
      receiverId: session.targetId,
      clientMessageId: message.clientMessageId || '',
      messageType: 'TEXT',
    },
  };

  const pending: PendingMessage = {
    localId: message.id,
    conversationId: session.id,
    sendType: 'private',
    payloadJson: JSON.stringify(payload),
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  pendingMessageRepository.enqueue(pending);
}

/**
 * Find all pending messages for a session that are waiting for E2EE
 * negotiation to complete before they can be encrypted and sent.
 */
export function findPendingE2eeSends(sessionId: string): PendingMessage[] {
  const all = pendingMessageRepository.listByConversation(sessionId);
  return all.filter((item) => {
    if (item.status !== 'pending') return false;
    try {
      const payload = JSON.parse(item.payloadJson) as Record<string, unknown>;
      return payload.requiresE2ee === true;
    } catch {
      return false;
    }
  });
}

/**
 * Check whether a parsed pending payload is waiting for E2EE negotiation.
 * Used by retryMessage to skip these items until the session is encrypted.
 */
export function isE2eePendingPayload(payload: unknown): boolean {
  return hasE2eePendingMeta(payload);
}

export interface EncryptPendingE2eeResult {
  localId: string;
  conversationId: string;
  ok: boolean;
  envelope?: RustE2eeEnvelope;
  error?: string;
}

/**
 * Encrypt a single E2EE-waiting pending message and update its payload
 * with the Rust v2 envelope.
 *
 * On success the pending payload is rewritten from `requiresE2ee` +
 * `plaintext` to `encrypted` + `e2eeEnvelope` + `e2eeDeviceId`, ready
 * for the standard retry pipeline.
 *
 * On failure the pending is kept with an incremented retry count and an
 * error annotation — no plaintext is ever sent.
 *
 * This function does NOT import from messageStore, so it can be used
 * freely without creating import cycles.
 */
export async function encryptPendingE2eePayload(item: PendingMessage): Promise<EncryptPendingE2eeResult> {
  const base = { localId: item.localId, conversationId: item.conversationId, ok: false };

  try {
    const parsed = JSON.parse(item.payloadJson) as PendingSendPayload;
    if (!parsed.requiresE2ee || !parsed.plaintext) {
      return { ...base, error: 'not an E2EE-waiting pending' };
    }

    const receiverId = parsed.data.receiverId || '';
    if (!receiverId) {
      markPendingE2eeRetryableFailure(item, 'missing receiver id for E2EE send');
      return { ...base, error: 'missing receiver id' };
    }

    const envelope = await e2eeManager.encryptToEnvelope({
      sessionId: item.conversationId,
      plaintext: parsed.plaintext,
      recipientUserId: receiverId,
    });

    const updatedPayload: PendingSendPayload = {
      sendType: parsed.sendType,
      encrypted: true,
      data: {
        ...parsed.data,
        encrypted: true,
        e2eeEnvelope: envelope,
        e2eeDeviceId: envelope.senderDeviceId,
        content: undefined,
      },
    };

    pendingMessageRepository.update({
      ...item,
      payloadJson: JSON.stringify(updatedPayload),
      status: 'pending',
      lastError: undefined,
    });

    return { ...base, ok: true, envelope };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('e2ee', 'encrypt pending E2EE payload failed', sanitizeE2eeLogValue({
      localId: item.localId,
      conversationId: item.conversationId,
      error: message,
    }));
    const nextRetryCount = item.retryCount + 1;
    if (shouldStopRetry(nextRetryCount, RETRY_CONFIG.maxRetryCount)) {
      markPendingE2eeExhausted(item, `encrypt failed: ${message}`);
    } else {
      markPendingE2eeRetryableFailure(item, `encrypt failed: ${message}`);
    }
    return { ...base, error: message };
  }
}

function markPendingE2eeRetryableFailure(item: PendingMessage, reason: string): void {
  const nextRetryCount = item.retryCount + 1;
  const nextRetryAt = createNextRetryAt(nextRetryCount, Date.now(), {
    baseDelayMs: RETRY_CONFIG.baseDelayMs,
    maxDelayMs: RETRY_CONFIG.maxDelayMs,
  });
  pendingMessageRepository.update({
    ...item,
    status: 'pending',
    retryCount: nextRetryCount,
    nextRetryAt,
    lastError: `e2ee: ${reason}`,
  });
}

function markPendingE2eeExhausted(item: PendingMessage, reason: string): void {
  pendingMessageRepository.update({
    ...item,
    status: 'failed',
    retryCount: item.retryCount + 1,
    lastError: `e2ee encrypt exhausted: ${reason}`,
    // Strip plaintext from the exhausted failed pending — never persist
    // plaintext in a terminal failed payload.
    payloadJson: JSON.stringify({
      sendType: item.sendType,
      data: { clientMessageId: '', messageType: 'TEXT' },
      encrypted: true,
    }),
  });
}
