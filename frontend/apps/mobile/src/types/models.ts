import type { ChatSessionType, Message, MessageType } from '@im/shared-types';

// React Navigation params are mobile-only route payloads.
export interface ChatRouteParams {
  route?: string;
  conversationId?: string;
  sessionId?: string;
  senderId?: string;
  receiverId?: string;
  groupId?: string;
  targetId?: string;
  targetName?: string;
  groupName?: string;
  senderName?: string;
}

// Mobile cache/display message. Core IM fields come from shared Message; the
// extra fields below are React Native storage and routing metadata.
export type MobileMessage = Message & {
  // Local legacy alias for Message.messageId used by the mobile SQLite cache.
  serverId?: Message['messageId'];
  // Mobile conversation key used for local routing and offline cache buckets.
  conversationId?: string;
  // Server/raw encrypted payload snapshot. UI content may intentionally be
  // local plaintext while rawJson keeps the original ciphertext and metadata.
  rawJson?: string;
  // Local-only E2EE display metadata. These fields are never required by the
  // server contract and are used to keep decrypted/known plaintext from being
  // masked again while retaining the encrypted marker for audit/history.
  isE2eeDisplayDecrypted?: boolean;
  decryptStatus?: 'decrypted' | 'pending' | 'failed' | 'own-echo-preserved' | 'plaintext';
};

// Local offline-send queue row persisted by the mobile storage layer.
export interface PendingMessage {
  localId: string;
  conversationId: string;
  sendType: ChatSessionType;
  payloadJson: string;
  clientMessageId?: string;
  status: 'pending' | 'sending' | 'failed' | 'sent' | 'blocked';
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  nextRetryAt?: number;
}

// Unified send pipeline stage — derived from PendingMessage + UploadTask + MobileMessage.
// Not persisted directly; computed by deriveSendStage().
export type SendPipelineStage =
  | 'LOCAL_CREATED'    // local message exists, no pending row yet
  | 'UPLOAD_PENDING'   // upload task queued but not started
  | 'UPLOADING'        // upload in progress
  | 'UPLOAD_FAILED'    // upload failed (may be retried)
  | 'UPLOAD_DONE'      // upload completed, ready for message send
  | 'SEND_PENDING'     // message queued in pending, waiting for nextRetryAt or slot
  | 'SENDING'          // message send in progress
  | 'SEND_FAILED'      // message send failed (may be retried)
  | 'SENT'             // message confirmed by server
  | 'BLOCKED';         // blocked by E2EE or policy

// Local upload queue row for React Native file/media uploads.
export interface UploadTask {
  taskId: string;
  conversationId?: string;
  localMessageId?: string;
  fileUri: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  uploadType: MessageType;
  status: 'pending' | 'uploading' | 'failed' | 'uploaded';
  progress: number;
  retryCount: number;
  remoteUrl?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  // Retry/reconcile metadata for upload state machine (V3)
  nextRetryAt?: number;
  maxRetryCount?: number;
  checksum?: string;
  remoteFileId?: string;
  lastAttemptAt?: number;
}

// Per-session pagination state for incremental message loading.
export interface MessagePaginationState {
  loadingInitial: boolean;
  loadingOlder: boolean;
  refreshingLatest: boolean;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestMessageId?: string;
  oldestMessageTime?: string;
  newestMessageId?: string;
  newestMessageTime?: string;
  lastError?: string;
  initialized: boolean;
}

// ─── Message Action Model ────────────────────────────────────────────────

export type MessageActionId =
  | 'copy'
  | 'retry'
  | 'deleteLocal'
  | 'recall'
  | 'saveMedia'
  | 'openFile'
  | 'readDetail'
  | 'forward';

export interface MessageActionItem {
  id: MessageActionId;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  reason?: string;
}

export interface MessageActionContext {
  currentUserId: string;
  isGroupSession: boolean;
  now: number;
  recallWindowMs: number;
  sendStage?: SendPipelineStage;
  /** Raw message status (fallback when sendStage is not available). */
  messageStatus?: import('@im/shared-types').MessageStatus;
  hasMediaUri: boolean;
  hasRemoteMediaUri: boolean;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────

// In-memory diagnostics entry generated only inside the mobile app.
export interface LocalLogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
  createdAt: number;
  detail?: string;
}
