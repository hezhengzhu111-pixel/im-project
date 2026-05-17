import type { UploadTask } from '@/types/models';
import { messageDatabase } from './messageDatabase';

const normalize = (row: Record<string, unknown>): UploadTask => ({
  taskId: String(row.taskId || ''),
  conversationId: row.conversationId ? String(row.conversationId) : undefined,
  localMessageId: row.localMessageId ? String(row.localMessageId) : undefined,
  fileUri: String(row.fileUri || ''),
  fileName: String(row.fileName || ''),
  mimeType: row.mimeType ? String(row.mimeType) : undefined,
  fileSize: row.fileSize ? Number(row.fileSize) : undefined,
  uploadType: String(row.uploadType || 'FILE') as UploadTask['uploadType'],
  status: String(row.status || 'pending') as UploadTask['status'],
  progress: Number(row.progress || 0),
  retryCount: Number(row.retryCount || 0),
  remoteUrl: row.remoteUrl ? String(row.remoteUrl) : undefined,
  lastError: row.lastError ? String(row.lastError) : undefined,
  createdAt: Number(row.createdAt || Date.now()),
  updatedAt: Number(row.updatedAt || Date.now()),
  nextRetryAt: row.nextRetryAt != null ? Number(row.nextRetryAt) : undefined,
  maxRetryCount: row.maxRetryCount != null ? Number(row.maxRetryCount) : undefined,
  checksum: row.checksum ? String(row.checksum) : undefined,
  remoteFileId: row.remoteFileId ? String(row.remoteFileId) : undefined,
  lastAttemptAt: row.lastAttemptAt != null ? Number(row.lastAttemptAt) : undefined,
});

export const uploadTaskRepository = {
  upsert(task: UploadTask): void {
    messageDatabase.memoryUpsert('mobile_upload_tasks', task.taskId, { ...task });
    messageDatabase.execute(
      `INSERT OR REPLACE INTO mobile_upload_tasks
      (taskId, conversationId, localMessageId, fileUri, fileName, mimeType, fileSize, uploadType, status,
       progress, retryCount, remoteUrl, lastError, createdAt, updatedAt,
       nextRetryAt, maxRetryCount, checksum, remoteFileId, lastAttemptAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.taskId,
        task.conversationId,
        task.localMessageId,
        task.fileUri,
        task.fileName,
        task.mimeType,
        task.fileSize,
        task.uploadType,
        task.status,
        task.progress,
        task.retryCount,
        task.remoteUrl,
        task.lastError,
        task.createdAt,
        task.updatedAt,
        task.nextRetryAt ?? null,
        task.maxRetryCount ?? null,
        task.checksum ?? null,
        task.remoteFileId ?? null,
        task.lastAttemptAt ?? null,
      ],
    );
  },

  get(taskId: string): UploadTask | undefined {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase.memoryList('mobile_upload_tasks').filter((row) => row.taskId === taskId)
      : messageDatabase.query('SELECT * FROM mobile_upload_tasks WHERE taskId = ? LIMIT 1', [taskId]);
    const row = rows[0];
    return row ? normalize(row) : undefined;
  },

  findByLocalMessageId(localMessageId: string): UploadTask | undefined {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase
          .memoryList('mobile_upload_tasks')
          .filter((row) => row.localMessageId === localMessageId)
          .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      : messageDatabase.query(
          'SELECT * FROM mobile_upload_tasks WHERE localMessageId = ? ORDER BY updatedAt DESC LIMIT 1',
          [localMessageId],
        );
    const row = rows[0];
    return row ? normalize(row) : undefined;
  },

  listPending(): UploadTask[] {
    const now = Date.now();
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase
          .memoryList('mobile_upload_tasks')
          .filter((row) => {
            if (!['pending', 'failed'].includes(String(row.status || ''))) {
              return false;
            }
            // Skip tasks with nextRetryAt in the future
            const nextRetryAt = row.nextRetryAt != null ? Number(row.nextRetryAt) : undefined;
            if (nextRetryAt != null && nextRetryAt > now) {
              return false;
            }
            return true;
          })
          .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      : messageDatabase.query(
          `SELECT * FROM mobile_upload_tasks
           WHERE status IN ('pending', 'failed')
             AND (nextRetryAt IS NULL OR nextRetryAt <= ?)
           ORDER BY createdAt ASC`,
          [now],
        );
    return rows.map(normalize);
  },

  listAll(): UploadTask[] {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase
          .memoryList('mobile_upload_tasks')
          .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      : messageDatabase.query('SELECT * FROM mobile_upload_tasks ORDER BY createdAt ASC');
    return rows.map(normalize);
  },

  remove(taskId: string): void {
    messageDatabase.memoryDelete('mobile_upload_tasks', taskId);
    messageDatabase.execute('DELETE FROM mobile_upload_tasks WHERE taskId = ?', [taskId]);
  },

  /** 清理 mobile_upload_tasks 表（内存缓存 + SQLite）。 */
  clear(): void {
    messageDatabase.memoryClear('mobile_upload_tasks');
    messageDatabase.execute('DELETE FROM mobile_upload_tasks');
  },
};
