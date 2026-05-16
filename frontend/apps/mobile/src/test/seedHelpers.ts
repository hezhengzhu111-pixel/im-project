import type { PendingMessage, UploadTask } from '@/types/models';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';

let pendingCounter = 0;
let uploadCounter = 0;

/** Reset internal counters (call in beforeEach for deterministic IDs). */
export function resetSeedCounters(): void {
  pendingCounter = 0;
  uploadCounter = 0;
}

export interface SeedPendingMessageOptions {
  localId?: string;
  conversationId?: string;
  sendType?: 'private' | 'group';
  payloadJson?: string;
  clientMessageId?: string;
  status?: PendingMessage['status'];
  retryCount?: number;
  lastError?: string;
  createdAt?: number;
  updatedAt?: number;
  nextRetryAt?: number;
}

/**
 * Insert a PendingMessage into the repository with sensible defaults.
 * Returns the fully-formed PendingMessage that was persisted.
 */
export function seedPendingMessage(
  overrides?: SeedPendingMessageOptions,
): PendingMessage {
  pendingCounter++;
  const now = Date.now();
  const localId = overrides?.localId ?? `seed-pending-${pendingCounter}`;
  const item: PendingMessage = {
    localId,
    conversationId: overrides?.conversationId ?? 'conv-seed-1',
    sendType: overrides?.sendType ?? 'private',
    payloadJson: overrides?.payloadJson ?? JSON.stringify({
      data: {
        clientMessageId: overrides?.clientMessageId ?? `seed-cmid-${pendingCounter}`,
        content: `seed message ${pendingCounter}`,
        messageType: 'TEXT',
      },
    }),
    clientMessageId: overrides?.clientMessageId ?? `seed-cmid-${pendingCounter}`,
    status: overrides?.status ?? 'pending',
    retryCount: overrides?.retryCount ?? 0,
    lastError: overrides?.lastError,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    nextRetryAt: overrides?.nextRetryAt,
  };
  pendingMessageRepository.enqueue(item);
  return item;
}

export interface SeedUploadTaskOptions {
  taskId?: string;
  conversationId?: string;
  localMessageId?: string;
  fileUri?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  uploadType?: string;
  status?: UploadTask['status'];
  progress?: number;
  retryCount?: number;
  remoteUrl?: string;
  lastError?: string;
  createdAt?: number;
  updatedAt?: number;
  nextRetryAt?: number;
  maxRetryCount?: number;
  checksum?: string;
  remoteFileId?: string;
  lastAttemptAt?: number;
}

/**
 * Insert an UploadTask into the repository with sensible defaults.
 * Returns the fully-formed UploadTask that was persisted.
 */
export function seedUploadTask(
  overrides?: SeedUploadTaskOptions,
): UploadTask {
  uploadCounter++;
  const now = Date.now();
  const task: UploadTask = {
    taskId: overrides?.taskId ?? `seed-upload-${uploadCounter}`,
    conversationId: overrides?.conversationId ?? 'conv-seed-1',
    localMessageId: overrides?.localMessageId ?? `seed-local-msg-${uploadCounter}`,
    fileUri: overrides?.fileUri ?? 'file:///seed-photo.jpg',
    fileName: overrides?.fileName ?? 'seed-photo.jpg',
    mimeType: overrides?.mimeType ?? 'image/jpeg',
    fileSize: overrides?.fileSize ?? 2048,
    uploadType: (overrides?.uploadType ?? 'IMAGE') as UploadTask['uploadType'],
    status: overrides?.status ?? 'pending',
    progress: overrides?.progress ?? 0,
    retryCount: overrides?.retryCount ?? 0,
    remoteUrl: overrides?.remoteUrl,
    lastError: overrides?.lastError,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    nextRetryAt: overrides?.nextRetryAt,
    maxRetryCount: overrides?.maxRetryCount,
    checksum: overrides?.checksum,
    remoteFileId: overrides?.remoteFileId,
    lastAttemptAt: overrides?.lastAttemptAt,
  };
  uploadTaskRepository.upsert(task);
  return task;
}
