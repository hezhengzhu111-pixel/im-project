import { fileService, normalizeUploadFile, type FileUploadResponse, type MobileFile } from '@/services/file/fileService';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { createNextRetryAt, shouldStopRetry } from '@im/shared-im-core';
import type { MessageType } from '@im/shared-types';
import type { UploadTask } from '@/types/models';
import { RETRY_CONFIG } from '@/constants/config';

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
      maxRetryCount: RETRY_CONFIG.maxRetryCount,
      createdAt: now,
      updatedAt: now,
    };
    uploadTaskRepository.upsert(task);
    return task;
  },

  async uploadTask(task: UploadTask): Promise<FileUploadResponse> {
    // 防止重复上传：如果已经是 uploaded 状态且有 remoteUrl，直接返回
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
    const now = Date.now();
    try {
      // 开始上传：设置 uploading 状态、lastAttemptAt、清空 lastError
      const uploading: UploadTask = {
        ...task,
        status: 'uploading',
        lastAttemptAt: now,
        lastError: undefined,
        updatedAt: now,
      };
      uploadTaskRepository.upsert(uploading);
      const response = await fileService.upload(file, task.uploadType, (progress) => {
        // 进度回调：只更新同一个 taskId，保留 lastAttemptAt，progress 单调递增
        const currentTask = uploadTaskRepository.get(uploading.taskId);
        if (!currentTask) return;
        const monotonicProgress = Math.max(currentTask.progress, progress);
        uploadTaskRepository.upsert({
          ...currentTask,
          progress: monotonicProgress,
          updatedAt: Date.now(),
        });
      });
      // 上传成功：设置 uploaded 状态、remoteUrl、progress=100、清空重试相关字段
      uploadTaskRepository.upsert({
        ...uploading,
        status: 'uploaded',
        remoteUrl: response.data.url,
        fileName: response.data.fileName || uploading.fileName,
        mimeType: response.data.contentType || uploading.mimeType,
        fileSize: response.data.size || uploading.fileSize,
        progress: 100,
        nextRetryAt: undefined,
        lastError: undefined,
        updatedAt: Date.now(),
      });
      return response.data;
    } catch (error) {
      const retryCount = task.retryCount + 1;
      const maxRetryCount = task.maxRetryCount ?? RETRY_CONFIG.maxRetryCount;
      // 上传失败：更新 retryCount、lastError、nextRetryAt
      uploadTaskRepository.upsert({
        ...task,
        status: 'failed',
        retryCount,
        lastError: error instanceof Error ? error.message : 'upload failed',
        // 如果超过最大重试次数，nextRetryAt 为空；否则计算下次重试时间
        nextRetryAt: shouldStopRetry(retryCount, maxRetryCount)
          ? undefined
          : createNextRetryAt(retryCount, Date.now(), {
              baseDelayMs: RETRY_CONFIG.baseDelayMs,
              maxDelayMs: RETRY_CONFIG.maxDelayMs,
            }),
        lastAttemptAt: now,
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
      try {
        // 跳过超过最大重试次数的任务
        const maxRetryCount = task.maxRetryCount ?? RETRY_CONFIG.maxRetryCount;
        if (shouldStopRetry(task.retryCount, maxRetryCount)) {
          continue;
        }
        await this.uploadTask(task);
      } catch {
        // 单个任务失败不中断整个循环
      }
    }
  },
};
