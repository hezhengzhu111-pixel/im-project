import { fileService, type MobileFile } from '@/services/file/fileService';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import type { MessageType, UploadTask } from '@/types/models';

const createTaskId = () => `upload_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const uploadService = {
  async uploadFile(
    file: MobileFile,
    uploadType: MessageType,
    context?: { conversationId?: string; localMessageId?: string },
  ) {
    const now = Date.now();
    const task: UploadTask = {
      taskId: createTaskId(),
      conversationId: context?.conversationId,
      localMessageId: context?.localMessageId,
      fileUri: file.uri,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadType,
      status: 'pending',
      progress: 0,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    uploadTaskRepository.upsert(task);
    try {
      task.status = 'uploading';
      uploadTaskRepository.upsert(task);
      const response = await fileService.upload(file, uploadType, (progress) => {
        task.progress = progress;
        task.updatedAt = Date.now();
        uploadTaskRepository.upsert(task);
      });
      task.status = 'uploaded';
      task.remoteUrl = response.data.url;
      task.progress = 100;
      task.updatedAt = Date.now();
      uploadTaskRepository.upsert(task);
      return response.data;
    } catch (error) {
      task.status = 'failed';
      task.retryCount += 1;
      task.lastError = error instanceof Error ? error.message : 'upload failed';
      task.updatedAt = Date.now();
      uploadTaskRepository.upsert(task);
      throw error;
    }
  },
};
