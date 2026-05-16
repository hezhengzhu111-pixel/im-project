import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import type { UploadTask } from '@/types/models';

// Mock messageDatabase
jest.mock('@/services/storage/messageDatabase', () => {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  return {
    messageDatabase: {
      isMemoryFallback: () => true,
      memoryUpsert: (table: string, key: string, value: Record<string, unknown>) => {
        if (!store.has(table)) store.set(table, new Map());
        store.get(table)!.set(key, { ...value });
      },
      memoryDelete: (table: string, key: string) => {
        store.get(table)?.delete(key);
      },
      memoryList: (table: string) => {
        return Array.from(store.get(table)?.values() || []);
      },
      memoryClear: (table: string) => {
        store.get(table)?.clear();
      },
      execute: jest.fn(),
      query: jest.fn(),
    },
  };
});

const createBaseTask = (overrides?: Partial<UploadTask>): UploadTask => ({
  taskId: 'test-task-1',
  conversationId: 'conv-1',
  localMessageId: 'local-msg-1',
  fileUri: 'file:///test.jpg',
  fileName: 'test.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024,
  uploadType: 'IMAGE' as any,
  status: 'pending',
  progress: 0,
  retryCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('uploadTaskRepository', () => {
  beforeEach(() => {
    uploadTaskRepository.clear();
  });

  describe('upsert and get with new V3 fields', () => {
    it('should persist and read back nextRetryAt, maxRetryCount, checksum, remoteFileId, lastAttemptAt', () => {
      const task = createBaseTask({
        nextRetryAt: Date.now() + 60000,
        maxRetryCount: 5,
        checksum: 'sha256:abc123',
        remoteFileId: 'remote-file-id-123',
        lastAttemptAt: Date.now() - 1000,
      });

      uploadTaskRepository.upsert(task);
      const retrieved = uploadTaskRepository.get(task.taskId);

      expect(retrieved).toBeDefined();
      expect(retrieved!.nextRetryAt).toBe(task.nextRetryAt);
      expect(retrieved!.maxRetryCount).toBe(task.maxRetryCount);
      expect(retrieved!.checksum).toBe(task.checksum);
      expect(retrieved!.remoteFileId).toBe(task.remoteFileId);
      expect(retrieved!.lastAttemptAt).toBe(task.lastAttemptAt);
    });

    it('should handle undefined optional fields correctly', () => {
      const task = createBaseTask();

      uploadTaskRepository.upsert(task);
      const retrieved = uploadTaskRepository.get(task.taskId);

      expect(retrieved).toBeDefined();
      expect(retrieved!.nextRetryAt).toBeUndefined();
      expect(retrieved!.maxRetryCount).toBeUndefined();
      expect(retrieved!.checksum).toBeUndefined();
      expect(retrieved!.remoteFileId).toBeUndefined();
      expect(retrieved!.lastAttemptAt).toBeUndefined();
    });
  });

  describe('listPending with nextRetryAt filtering', () => {
    it('should return tasks without nextRetryAt (backward compatibility)', () => {
      const oldTask = createBaseTask({
        taskId: 'old-task',
        status: 'pending',
        // No nextRetryAt - simulates old data
      });

      uploadTaskRepository.upsert(oldTask);
      const pending = uploadTaskRepository.listPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].taskId).toBe('old-task');
    });

    it('should return tasks with nextRetryAt in the past', () => {
      const pastTask = createBaseTask({
        taskId: 'past-task',
        status: 'pending',
        nextRetryAt: Date.now() - 1000, // 1 second ago
      });

      uploadTaskRepository.upsert(pastTask);
      const pending = uploadTaskRepository.listPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].taskId).toBe('past-task');
    });

    it('should NOT return tasks with nextRetryAt in the future', () => {
      const futureTask = createBaseTask({
        taskId: 'future-task',
        status: 'pending',
        nextRetryAt: Date.now() + 60000, // 1 minute from now
      });

      uploadTaskRepository.upsert(futureTask);
      const pending = uploadTaskRepository.listPending();

      expect(pending).toHaveLength(0);
    });

    it('should return mix of old and past-retry tasks, but not future-retry tasks', () => {
      const oldTask = createBaseTask({ taskId: 'old', status: 'pending' });
      const pastTask = createBaseTask({
        taskId: 'past',
        status: 'failed',
        nextRetryAt: Date.now() - 1000,
      });
      const futureTask = createBaseTask({
        taskId: 'future',
        status: 'uploading',
        nextRetryAt: Date.now() + 60000,
      });

      uploadTaskRepository.upsert(oldTask);
      uploadTaskRepository.upsert(pastTask);
      uploadTaskRepository.upsert(futureTask);
      const pending = uploadTaskRepository.listPending();

      expect(pending).toHaveLength(2);
      expect(pending.map((t) => t.taskId)).toContain('old');
      expect(pending.map((t) => t.taskId)).toContain('past');
      expect(pending.map((t) => t.taskId)).not.toContain('future');
    });

    it('should not return tasks with status uploaded', () => {
      const uploadedTask = createBaseTask({
        taskId: 'uploaded',
        status: 'uploaded',
      });

      uploadTaskRepository.upsert(uploadedTask);
      const pending = uploadTaskRepository.listPending();

      expect(pending).toHaveLength(0);
    });
  });
});
