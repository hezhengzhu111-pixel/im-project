import type { ChatSession } from '@im/shared-types';
import type { RustE2eeEnvelope } from '@im/shared-e2ee-core';
import { sanitizeE2eeLogValue } from '@im/shared-e2ee-core';
import { createNextRetryAt, shouldStopRetry } from '@im/shared-im-core';
import { RETRY_CONFIG } from '@/constants/config';
import { e2eeManager } from '@/e2ee/manager/e2eeManager';
import { e2eeSecureStorage } from '@/e2ee/storage/secureE2eeStorage';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/utils/logger';
import type { MobileMessage, PendingMessage } from '@/types/models';
import type { SendMessagePayload } from '@/services/chat/messageService';

/**
 * E2EE-wait metadata persisted inside pending payloadJson.
 *
 * The plaintext is stored in the device Keychain (via e2eeSecureStorage),
 * not in the SQLite pending row. The `plaintextRef` field is the localId
 * used to retrieve the plaintext from secure storage.
 */
export interface E2eePendingMeta {
  requiresE2ee?: boolean;
  e2eeWaitReason?: 'negotiation' | 'prekey' | 'state';
  /** localId reference to retrieve plaintext from e2eeSecureStorage */
  plaintextRef?: string;
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
 * send queue.
 *
 * SECURITY: The plaintext is saved to the device Keychain (via
 * e2eeSecureStorage) keyed by userId + deviceId + localId. The pending
 * payloadJson only stores a `plaintextRef` (the localId), never the
 * plaintext itself. The message will NOT be sent as plaintext; it stays
 * pending until the session E2EE status becomes `encrypted`.
 *
 * Requires a logged-in user with a provisioned deviceId. Throws if either
 * is missing — we must not silently write plaintext to SQLite.
 */
export async function enqueuePendingE2eeText(
  session: ChatSession,
  message: MobileMessage,
  plaintext: string,
  reason: 'negotiation' | 'prekey' | 'state',
): Promise<void> {
  const userId = useAuthStore.getState().currentUser?.id;
  if (!userId) {
    throw new Error('E2EE pending send requires an authenticated user');
  }

  const deviceId = await e2eeSecureStorage.getDeviceId(userId);
  if (!deviceId) {
    throw new Error('E2EE pending send requires a provisioned device');
  }

  // Save plaintext to encrypted Keychain, NOT to SQLite payload.
  await e2eeSecureStorage.savePendingPlaintext(userId, deviceId, message.id, plaintext);

  const now = Date.now();
  const payload: PendingSendPayload = {
    sendType: 'private',
    requiresE2ee: true,
    e2eeWaitReason: reason,
    plaintextRef: message.id,
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
 * Reads the plaintext from e2eeSecureStorage (Keychain), NOT from the
 * SQLite pending payload. On success the plaintext is deleted from
 * secure storage and the pending payload is rewritten from `requiresE2ee`
 * to `encrypted` + `e2eeEnvelope` + `e2eeDeviceId`.
 *
 * On retryable failure the plaintext is kept in secure storage for the
 * next attempt. On exhausted failure the plaintext is deleted.
 *
 * This function does NOT import from messageStore, so it can be used
 * freely without creating import cycles.
 */
export async function encryptPendingE2eePayload(item: PendingMessage): Promise<EncryptPendingE2eeResult> {
  const base = { localId: item.localId, conversationId: item.conversationId, ok: false };

  try {
    const parsed = JSON.parse(item.payloadJson) as PendingSendPayload;
    if (!parsed.requiresE2ee) {
      return { ...base, error: 'not an E2EE-waiting pending' };
    }

    const localId = parsed.plaintextRef || item.localId;
    if (!localId) {
      return { ...base, error: 'not an E2EE-waiting pending (missing plaintextRef)' };
    }

    const receiverId = parsed.data.receiverId || '';
    if (!receiverId) {
      markPendingE2eeRetryableFailure(item, 'missing receiver id for E2EE send');
      return { ...base, error: 'missing receiver id' };
    }

    const userId = useAuthStore.getState().currentUser?.id;
    if (!userId) {
      return { ...base, error: 'cannot encrypt pending E2EE payload without authenticated user' };
    }

    const deviceId = await e2eeSecureStorage.getDeviceId(userId);
    if (!deviceId) {
      return { ...base, error: 'cannot encrypt pending E2EE payload without provisioned device' };
    }

    const plaintext = await e2eeSecureStorage.getPendingPlaintext(userId, deviceId, localId);
    if (!plaintext) {
      // The secure stored plaintext is missing — this pending cannot be
      // recovered. Exhaust it immediately.
      await e2eeSecureStorage.removePendingPlaintext(userId, deviceId, localId).catch(() => {});
      markPendingE2eeExhausted(item, 'pending plaintext missing from secure storage');
      return { ...base, error: 'pending plaintext missing from secure storage' };
    }

    const envelope = await e2eeManager.encryptToEnvelope({
      sessionId: item.conversationId,
      plaintext,
      recipientUserId: receiverId,
    });

    // Encryption succeeded — delete the plaintext from secure storage
    // and rewrite the pending payload as encrypted.
    await e2eeSecureStorage.removePendingPlaintext(userId, deviceId, localId).catch(() => {});

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
      // Exhausted — clean up secure storage plaintext
      try {
        const parsed = JSON.parse(item.payloadJson) as PendingSendPayload;
        const localId = parsed.plaintextRef || item.localId;
        const userId = useAuthStore.getState().currentUser?.id;
        if (userId && localId) {
          const deviceId = await e2eeSecureStorage.getDeviceId(userId).catch(() => '');
          if (deviceId) {
            await e2eeSecureStorage.removePendingPlaintext(userId, deviceId, localId).catch(() => {});
          }
        }
      } catch {
        // Best-effort cleanup
      }
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
    // Strip E2EE metadata from the exhausted pending — never persist
    // plaintextRef or other E2EE negotiation data in a terminal payload.
    payloadJson: JSON.stringify({
      sendType: item.sendType,
      data: { clientMessageId: '', messageType: 'TEXT' },
      encrypted: true,
    }),
  });
}

/**
 * Best-effort helper to remove pending E2EE plaintext from secure storage
 * by localId. Safe to call even when userId/deviceId are unavailable.
 * Used by deleteLocalMessage / clear / clearRuntime paths.
 */
export async function cleanupPendingE2eePlaintext(localId: string): Promise<void> {
  try {
    const userId = useAuthStore.getState().currentUser?.id;
    if (!userId || !localId) return;
    const deviceId = await e2eeSecureStorage.getDeviceId(userId).catch(() => '');
    if (!deviceId) return;
    await e2eeSecureStorage.removePendingPlaintext(userId, deviceId, localId).catch(() => {});
  } catch {
    // Best-effort cleanup — never throw
  }
}
