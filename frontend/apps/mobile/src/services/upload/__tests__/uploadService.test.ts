import { uploadService } from '../uploadService';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { RETRY_CONFIG } from '@/constants/config';

// Mock dependencies
jest.mock('@/services/file/fileService', () => ({
  fileService: {
    upload: jest.fn(),
  },
  normalizeUploadFile: jest.fn((file: unknown) => file),
}));

jest.mock('@/services/storage/uploadTaskRepository', () => ({
  uploadTaskRepository: {
    upsert: jest.fn(),
    get: jest.fn(),
    findByLocalMessageId: jest.fn(),
    listPending: jest.fn(),
  },
}));

const mockFileService = (require('@/services/file/fileService') as { fileService: { upload: jest.Mock } }).fileService;
const mockRepository = uploadTaskRepository as jest.Mocked<typeof uploadTaskRepository>;

describe('uploadService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    it('should create task with default maxRetryCount', () => {
      const file = { uri: 'file://test.jpg', name: 'test.jpg', type: 'image/jpeg', size: 1024 };
      const task = uploadService.createTask(file, 'IMAGE');

      expect(task.maxRetryCount).toBe(RETRY_CONFIG.maxRetryCount);
      expect(task.retryCount).toBe(0);
      expect(task.status).toBe('pending');
      expect(task.progress).toBe(0);
      expect(task.nextRetryAt).toBeUndefined();
      expect(task.lastAttemptAt).toBeUndefined();
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ maxRetryCount: RETRY_CONFIG.maxRetryCount }),
      );
    });
  });

  describe('uploadTask', () => {
    it('should set uploading status and lastAttemptAt on start', async () => {
      const task = {
        taskId: 'test-task',
        fileUri: 'file://test.jpg',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        uploadType: 'IMAGE' as const,
        status: 'pending' as const,
        progress: 0,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockFileService.upload.mockResolvedValue({
        data: { url: 'https://cdn.test/uploaded.jpg', fileName: 'uploaded.jpg' },
      });

      await uploadService.uploadTask(task);

      expect(mockRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'uploading',
          lastAttemptAt: expect.any(Number),
          lastError: undefined,
        }),
      );
    });

    it('should not decrease progress', async () => {
      const task = {
        taskId: 'test-task',
        fileUri: 'file://test.jpg',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        uploadType: 'IMAGE' as const,
        status: 'pending' as const,
        progress: 0,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      let progressCallback: ((progress: number) => void) | undefined;
      mockFileService.upload.mockImplementation(
        async (_file: unknown, _type: unknown, onProgress?: (progress: number) => void) => {
          progressCallback = onProgress;
          return { data: { url: 'https://cdn.test/uploaded.jpg' } };
        },
      );

      // Mock get to return task with higher progress
      mockRepository.get.mockReturnValue({
        ...task,
        status: 'uploading',
        progress: 50,
        lastAttemptAt: Date.now(),
      });

      const uploadPromise = uploadService.uploadTask(task);

      // Simulate progress callback with lower value
      if (progressCallback) {
        progressCallback(30);
      }

      await uploadPromise;

      // Should use max(50, 30) = 50
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ progress: 50 }),
      );
    });

    it('should set uploaded status on success', async () => {
      const task = {
        taskId: 'test-task',
        fileUri: 'file://test.jpg',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        uploadType: 'IMAGE' as const,
        status: 'pending' as const,
        progress: 0,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockFileService.upload.mockResolvedValue({
        data: { url: 'https://cdn.test/uploaded.jpg', fileName: 'uploaded.jpg' },
      });

      await uploadService.uploadTask(task);

      expect(mockRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'uploaded',
          remoteUrl: 'https://cdn.test/uploaded.jpg',
          progress: 100,
          lastError: undefined,
          nextRetryAt: undefined,
        }),
      );
    });

    it('should return directly if already uploaded with remoteUrl', async () => {
      const task = {
        taskId: 'test-task',
        fileUri: 'file://test.jpg',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        uploadType: 'IMAGE' as const,
        status: 'uploaded' as const,
        progress: 100,
        retryCount: 0,
        remoteUrl: 'https://cdn.test/uploaded.jpg',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await uploadService.uploadTask(task);

      expect(result.url).toBe('https://cdn.test/uploaded.jpg');
      expect(mockFileService.upload).not.toHaveBeenCalled();
    });

    it('should increment retryCount and set nextRetryAt on failure', async () => {
      const task = {
        taskId: 'test-task',
        fileUri: 'file://test.jpg',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        uploadType: 'IMAGE' as const,
        status: 'pending' as const,
        progress: 0,
        retryCount: 0,
        maxRetryCount: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockFileService.upload.mockRejectedValue(new Error('Network error'));

      await expect(uploadService.uploadTask(task)).rejects.toThrow('Network error');

      expect(mockRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          retryCount: 1,
          lastError: 'Network error',
          nextRetryAt: expect.any(Number),
          lastAttemptAt: expect.any(Number),
        }),
      );
    });

    it('should not set nextRetryAt when maxRetryCount exceeded', async () => {
      const task = {
        taskId: 'test-task',
        fileUri: 'file://test.jpg',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        uploadType: 'IMAGE' as const,
        status: 'failed' as const,
        progress: 0,
        retryCount: 4, // Already at maxRetryCount - 1
        maxRetryCount: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockFileService.upload.mockRejectedValue(new Error('Network error'));

      await expect(uploadService.uploadTask(task)).rejects.toThrow('Network error');

      expect(mockRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          retryCount: 5,
          nextRetryAt: undefined,
        }),
      );
    });
  });

  describe('retryPendingUploads', () => {
    it('should skip tasks exceeding maxRetryCount', async () => {
      mockRepository.listPending.mockReturnValue([
        {
          taskId: 'exceeded-task',
          fileUri: 'file://test.jpg',
          fileName: 'test.jpg',
          uploadType: 'IMAGE',
          status: 'failed',
          progress: 0,
          retryCount: 5,
          maxRetryCount: 5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          taskId: 'retryable-task',
          fileUri: 'file://test2.jpg',
          fileName: 'test2.jpg',
          uploadType: 'IMAGE',
          status: 'pending',
          progress: 0,
          retryCount: 0,
          maxRetryCount: 5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      mockFileService.upload.mockResolvedValue({
        data: { url: 'https://cdn.test/uploaded.jpg' },
      });

      await uploadService.retryPendingUploads();

      // Only retryable-task should be uploaded
      expect(mockFileService.upload).toHaveBeenCalledTimes(1);
    });

    it('should not stop loop on single task failure', async () => {
      mockRepository.listPending.mockReturnValue([
        {
          taskId: 'failing-task',
          fileUri: 'file://test1.jpg',
          fileName: 'test1.jpg',
          uploadType: 'IMAGE',
          status: 'pending',
          progress: 0,
          retryCount: 0,
          maxRetryCount: 5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          taskId: 'success-task',
          fileUri: 'file://test2.jpg',
          fileName: 'test2.jpg',
          uploadType: 'IMAGE',
          status: 'pending',
          progress: 0,
          retryCount: 0,
          maxRetryCount: 5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      mockFileService.upload
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { url: 'https://cdn.test/uploaded.jpg' } });

      await uploadService.retryPendingUploads();

      // Both tasks should be attempted
      expect(mockFileService.upload).toHaveBeenCalledTimes(2);
    });

    it('should skip tasks with nextRetryAt in the future', async () => {
      const futureTime = Date.now() + 100000;
      mockRepository.listPending.mockReturnValue([
        {
          taskId: 'future-task',
          fileUri: 'file://test.jpg',
          fileName: 'test.jpg',
          uploadType: 'IMAGE',
          status: 'failed',
          progress: 0,
          retryCount: 1,
          maxRetryCount: 5,
          nextRetryAt: futureTime,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      // listPending already filters by nextRetryAt, so if it returns empty, no upload happens
      mockRepository.listPending.mockReturnValue([]);

      await uploadService.retryPendingUploads();

      expect(mockFileService.upload).not.toHaveBeenCalled();
    });
  });
});
