import type {
  MobileMessage,
  PendingMessage,
  SendPipelineStage,
  UploadTask,
} from '../types/models';

/**
 * Derive the unified send pipeline stage from the three data sources.
 * All parameters are optional — missing pieces are treated as absent.
 *
 * Priority (highest → lowest):
 *  1. Server-confirmed message  → SENT
 *  2. PendingMessage.blocked    → BLOCKED
 *  3. UploadTask lifecycle      → UPLOAD_*
 *  4. PendingMessage lifecycle  → SEND_*
 *  5. Upload done, no pending   → UPLOAD_DONE
 *  6. Message FAILED fallback   → SEND_FAILED
 *  7. Message SENDING fallback  → SENDING
 *  8. Local message only        → LOCAL_CREATED
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
      default:
        // 'blocked' or future statuses
        return 'BLOCKED';
    }
  }

  // 5. Upload done but no pending row yet → upload complete, awaiting send
  if (uploadTask?.status === 'uploaded') {
    return 'UPLOAD_DONE';
  }

  // 6. Fallback: message has local FAILED status but pending record missing
  if (message?.status === 'FAILED') {
    return 'SEND_FAILED';
  }

  // 7. Fallback: message has local SENDING status but pending not yet persisted
  if (message?.status === 'SENDING') {
    return 'SENDING';
  }

  // 8. Local message exists with no pending/upload state
  if (message) {
    return 'LOCAL_CREATED';
  }

  return 'LOCAL_CREATED';
}
