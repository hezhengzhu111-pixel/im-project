import { fileService, normalizeUploadFile, type FileUploadResponse, type MobileFile } from '@/services/file/fileService';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import type { MessageType, UploadTask } from '@/types/models';

const createTaskId = () => `upload_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const stableTaskId = (localMessageId?: string) => (localMessageId ? `upload_${localMessageId}` : createTaskId());

export const uploadService = {
  createTask(
    file: MobileFile,
    uploadType: MessageType,
    context?: { conversationId?: string; localMessageId?: string },
  ): UploadTask {
    const normalizedFile = normalizeUploadFile(file, uploadType);
    const existing = context?.localMessageId
      ? uploadTaskRepository.findByLocalMessageId(context.localMessageId)
      : undefined;
    if (existing) {
      const merged = {
        ...existing,
        fileUri: normalizedFile.uri || existing.fileUri,
        fileName: normalizedFile.name || existing.fileName,
        mimeType: normalizedFile.type || existing.mimeType,
        fileSize: normalizedFile.size || existing.fileSize,
        updatedAt: Date.now(),
      };
      uploadTaskRepository.upsert(merged);
      return merged;
    }
    const now = Date.now();
    const task: UploadTask = {
      taskId: stableTaskId(context?.localMessageId),
      conversationId: context?.conversationId,
      localMessageId: context?.localMessageId,
      fileUri: normalizedFile.uri,
      fileName: normalizedFile.name,
      mimeType: normalizedFile.type,
      fileSize: normalizedFile.size,
      uploadType,
      status: 'pending',
      progress: 0,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    uploadTaskRepository.upsert(task);
    return task;
  },

  async uploadTask(task: UploadTask): Promise<FileUploadResponse> {
    if (task.status === 'uploaded' && task.remoteUrl) {
      return {
        url: task.remoteUrl,
        fileName: task.fileName,
        size: task.fileSize,
        contentType: task.mimeType,
      };
    }
    const file: MobileFile = {
      uri: task.fileUri,
      name: task.fileName,
      type: task.mimeType,
      size: task.fileSize,
    };
    try {
      const uploading = { ...task, status: 'uploading' as const, updatedAt: Date.now() };
      uploadTaskRepository.upsert(uploading);
      const response = await fileService.upload(file, task.uploadType, (progress) => {
        uploadTaskRepository.upsert({ ...uploading, progress, updatedAt: Date.now() });
      });
      uploadTaskRepository.upsert({
        ...uploading,
        status: 'uploaded',
        remoteUrl: response.data.url,
        fileName: response.data.fileName || uploading.fileName,
        mimeType: response.data.contentType || uploading.mimeType,
        fileSize: response.data.size || uploading.fileSize,
        progress: 100,
        updatedAt: Date.now(),
      });
      return response.data;
    } catch (error) {
      uploadTaskRepository.upsert({
        ...task,
        status: 'failed',
        retryCount: task.retryCount + 1,
        lastError: error instanceof Error ? error.message : 'upload failed',
        updatedAt: Date.now(),
      });
      throw error;
    }
  },

  async uploadExistingTask(taskId: string): Promise<FileUploadResponse> {
    const task = uploadTaskRepository.get(taskId);
    if (!task) {
      throw new Error('Upload task not found');
    }
    return this.uploadTask(task);
  },

  async uploadFile(
    file: MobileFile,
    uploadType: MessageType,
    context?: { conversationId?: string; localMessageId?: string },
  ): Promise<FileUploadResponse> {
    const task = this.createTask(file, uploadType, context);
    return this.uploadTask(task);
  },

  async retryPendingUploads(): Promise<void> {
    const tasks = uploadTaskRepository.listPending();
    for (const task of tasks) {
      await this.uploadTask(task).catch(() => undefined);
    }
  },
};
