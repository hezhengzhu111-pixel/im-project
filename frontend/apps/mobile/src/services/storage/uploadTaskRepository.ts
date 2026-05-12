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
});

export const uploadTaskRepository = {
  upsert(task: UploadTask): void {
    messageDatabase.memoryUpsert('mobile_upload_tasks', task.taskId, { ...task });
    messageDatabase.execute(
      `INSERT OR REPLACE INTO mobile_upload_tasks
      (taskId, conversationId, localMessageId, fileUri, fileName, mimeType, fileSize, uploadType, status,
       progress, retryCount, remoteUrl, lastError, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
    );
  },

  listPending(): UploadTask[] {
    const rows = messageDatabase.isMemoryFallback()
      ? messageDatabase.memoryList('mobile_upload_tasks')
      : messageDatabase.query("SELECT * FROM mobile_upload_tasks WHERE status IN ('pending', 'failed') ORDER BY createdAt ASC");
    return rows.map(normalize);
  },

  remove(taskId: string): void {
    messageDatabase.memoryDelete('mobile_upload_tasks', taskId);
    messageDatabase.execute('DELETE FROM mobile_upload_tasks WHERE taskId = ?', [taskId]);
  },

  clear(): void {
    messageDatabase.memoryClear('mobile_upload_tasks');
    messageDatabase.execute('DELETE FROM mobile_upload_tasks');
  },
};
