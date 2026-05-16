import {
  createNextRetryAt,
  shouldStopRetry,
} from '@im/shared-im-core';
import type { MessageType } from '@im/shared-types';
import type {
  MobileMessage,
  PendingMessage,
  SendPipelineRetryConfig,
  SendPipelineStage,
  UploadTask,
} from '../types/models';

/** Message types that require a file upload step before sending. */
const MEDIA_MESSAGE_TYPES: ReadonlySet<MessageType> = new Set([
  'IMAGE',
  'FILE',
  'VIDEO',
  'VOICE',
]);

export function isMediaMessageType(type: MessageType): boolean {
  return MEDIA_MESSAGE_TYPES.has(type);
}

/**
 * Derive the unified send pipeline stage from the three data sources.
 * All parameters are optional — missing pieces are treated as absent.
 *
 * Priority (highest → lowest):
 *  1. Server-confirmed message  → SENT
 *  2. PendingMessage.blocked    → BLOCKED
 *  3. UploadTask lifecycle      → UPLOAD_*
 *  4. PendingMessage lifecycle  → SEND_*
 *  5. Local message only        → LOCAL_CREATED
 */
export function deriveSendStage(
  pending?: PendingMessage | null,
  uploadTask?: UploadTask | null,
  message?: MobileMessage | null,
): SendPipelineStage {
  // 1. Server confirmed
  if (message?.status === 'SENT' || message?.status === 'DELIVERED' || message?.status === 'READ') {
    return 'SENT';
  }

  // 2. Blocked by E2EE or policy
  if (pending?.status === 'blocked') {
    return 'BLOCKED';
  }

  // 3. Upload lifecycle (only relevant for media messages)
  if (uploadTask) {
    switch (uploadTask.status) {
      case 'pending':
        return 'UPLOAD_PENDING';
      case 'uploading':
        return 'UPLOADING';
      case 'failed':
        return 'UPLOAD_FAILED';
      case 'uploaded':
        // Upload done — fall through to check pending send status
        break;
    }
  }

  // 4. Pending message lifecycle
  if (pending) {
    switch (pending.status) {
      case 'pending':
        return 'SEND_PENDING';
      case 'sending':
        return 'SENDING';
      case 'failed':
        return 'SEND_FAILED';
      case 'sent':
        return 'SENT';
      case 'blocked':
        return 'BLOCKED';
    }
  }

  // 5. Upload done but no pending row yet → upload complete, awaiting send
  if (uploadTask?.status === 'uploaded') {
    return 'UPLOAD_DONE';
  }

  // 6. Local message exists with no pending/upload state
  if (message) {
    return 'LOCAL_CREATED';
  }

  return 'LOCAL_CREATED';
}

/**
 * Whether an upload task is eligible for retry right now.
 * Returns false if: already uploaded, currently uploading, retry limit reached,
 * or backoff window has not elapsed.
 */
export function shouldRetryUpload(
  task: UploadTask,
  now: number,
  config: SendPipelineRetryConfig,
): boolean {
  if (task.status !== 'failed') {
    return false;
  }
  const maxRetry = task.maxRetryCount ?? config.uploadMaxRetryCount;
  if (shouldStopRetry(task.retryCount, maxRetry)) {
    return false;
  }
  if (task.nextRetryAt != null && task.nextRetryAt > now) {
    return false;
  }
  return true;
}

/**
 * Whether a pending message is eligible for retry right now.
 * Returns false if: already sent/blocked/sending, retry limit reached,
 * or backoff window has not elapsed.
 */
export function shouldRetryPendingMessage(
  pending: PendingMessage,
  now: number,
  config: SendPipelineRetryConfig,
): boolean {
  if (pending.status !== 'failed' && pending.status !== 'pending') {
    return false;
  }
  if (shouldStopRetry(pending.retryCount, config.maxRetryCount)) {
    return false;
  }
  if (pending.nextRetryAt != null && pending.nextRetryAt > now) {
    return false;
  }
  return true;
}

/** Compute next retry timestamp for an upload task. */
export function createUploadNextRetryAt(
  retryCount: number,
  now: number,
  config: SendPipelineRetryConfig,
): number {
  return createNextRetryAt(retryCount, now, {
    baseDelayMs: config.baseDelayMs,
    maxDelayMs: config.maxDelayMs,
  });
}

/** Compute next retry timestamp for a pending message send. */
export function createSendNextRetryAt(
  retryCount: number,
  now: number,
  config: SendPipelineRetryConfig,
): number {
  return createNextRetryAt(retryCount, now, {
    baseDelayMs: config.baseDelayMs,
    maxDelayMs: config.maxDelayMs,
  });
}
