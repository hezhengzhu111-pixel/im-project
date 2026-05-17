/**
 * Verification tests for Phase 4 test utilities:
 * - fileService.upload mock (progress, error, sequence)
 * - timeHelpers (freeze, advance, restore)
 * - seedHelpers (seedPendingMessage, seedUploadTask)
 */

import type { ApiResponse, FileUploadResponse } from '@im/shared-types';

interface FileServiceMockModule {
  fileService: {
    upload: (
      file: { uri: string; name: string },
      type: string,
      onProgress?: (p: number) => void,
    ) => Promise<ApiResponse<FileUploadResponse>>;
  };
  resetMockState: () => void;
  setProgressSteps: (n: number) => void;
  setProgressDelay: (ms: number) => void;
  setNextUploadError: (err: Error) => void;
  setUploadSequence: (
    entries: Array<{ error?: Error; response?: ApiResponse<FileUploadResponse> }>,
  ) => void;
  buildMockResponse: (data?: Partial<FileUploadResponse>) => ApiResponse<FileUploadResponse>;
  getUploadCallCount: () => number;
}

interface TimeHelpersModule {
  freezeTime: (ts?: number) => void;
  advanceTime: (ms: number) => void;
  setFrozenTime: (ts: number) => void;
  restoreTime: () => void;
  getFrozenTime: () => number | null;
}

// --- fileService mock tests ---
describe('fileService upload mock', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should trigger progress callbacks on success', async () => {
    const mod = require('@/services/file/__mocks__/fileService') as FileServiceMockModule;
    mod.resetMockState();
    mod.setProgressSteps(5);

    const progressValues: number[] = [];
    const file = { uri: 'file:///test.jpg', name: 'test.jpg' };
    const result = await mod.fileService.upload(file, 'IMAGE', (p) => progressValues.push(p));

    expect(progressValues).toEqual([20, 40, 60, 80, 100]);
    expect(result.success).toBe(true);
    expect(result.data.url).toContain('cdn.test');
  });

  it('should throw error when configured', async () => {
    const mod = require('@/services/file/__mocks__/fileService') as FileServiceMockModule;
    mod.resetMockState();
    mod.setProgressSteps(0);
    mod.setNextUploadError(new Error('network timeout'));

    const file = { uri: 'file:///test.jpg', name: 'test.jpg' };
    await expect(mod.fileService.upload(file, 'IMAGE')).rejects.toThrow('network timeout');
  });

  it('should support call sequence (fail then succeed)', async () => {
    const mod = require('@/services/file/__mocks__/fileService') as FileServiceMockModule;
    mod.resetMockState();
    mod.setProgressSteps(0);
    mod.setUploadSequence([
      { error: new Error('first attempt fails') },
      { response: mod.buildMockResponse({ url: 'https://cdn.test/retry-ok.jpg' }) },
    ]);

    const file = { uri: 'file:///test.jpg', name: 'test.jpg' };
    await expect(mod.fileService.upload(file, 'IMAGE')).rejects.toThrow('first attempt fails');
    expect(mod.getUploadCallCount()).toBe(1);

    const result = await mod.fileService.upload(file, 'IMAGE');
    expect(result.data.url).toBe('https://cdn.test/retry-ok.jpg');
    expect(mod.getUploadCallCount()).toBe(2);
  });

  it('should track call count', async () => {
    const mod = require('@/services/file/__mocks__/fileService') as FileServiceMockModule;
    mod.resetMockState();
    mod.setProgressSteps(0);

    expect(mod.getUploadCallCount()).toBe(0);
    const file = { uri: 'file:///test.jpg', name: 'test.jpg' };
    await mod.fileService.upload(file, 'IMAGE');
    await mod.fileService.upload(file, 'VIDEO');
    expect(mod.getUploadCallCount()).toBe(2);
  });
});

// --- timeHelpers tests ---
describe('timeHelpers', () => {
  const timeHelpers = require('@/test/timeHelpers') as TimeHelpersModule;

  afterEach(() => {
    timeHelpers.restoreTime();
  });

  it('should freeze time to a specific timestamp', () => {
    timeHelpers.freezeTime(1700000000000);
    expect(Date.now()).toBe(1700000000000);
    expect(Date.now()).toBe(1700000000000);
  });

  it('should advance frozen time', () => {
    timeHelpers.freezeTime(1700000000000);
    timeHelpers.advanceTime(5000);
    expect(Date.now()).toBe(1700000005000);
    timeHelpers.advanceTime(3000);
    expect(Date.now()).toBe(1700000008000);
  });

  it('should set frozen time to a specific value', () => {
    timeHelpers.freezeTime(1700000000000);
    timeHelpers.setFrozenTime(1700000999999);
    expect(Date.now()).toBe(1700000999999);
  });

  it('should restore original Date.now', () => {
    const before = Date.now();
    timeHelpers.freezeTime(0);
    expect(Date.now()).toBe(0);
    timeHelpers.restoreTime();
    const after = Date.now();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('should report frozen time via getFrozenTime', () => {
    expect(timeHelpers.getFrozenTime()).toBeNull();
    timeHelpers.freezeTime(1700000000000);
    expect(timeHelpers.getFrozenTime()).toBe(1700000000000);
    timeHelpers.advanceTime(100);
    expect(timeHelpers.getFrozenTime()).toBe(1700000000100);
    timeHelpers.restoreTime();
    expect(timeHelpers.getFrozenTime()).toBeNull();
  });

  it('should throw when advancing without freeze', () => {
    expect(() => timeHelpers.advanceTime(100)).toThrow('time is not frozen');
  });

  it('should be safe to call restoreTime multiple times', () => {
    timeHelpers.freezeTime(1000);
    timeHelpers.restoreTime();
    timeHelpers.restoreTime();
  });
});

// --- seedHelpers tests ---
describe('seedHelpers', () => {
  const { __resetForTests } = require('@/services/storage/messageDatabase') as {
    __resetForTests: () => void;
  };
  const {
    seedPendingMessage,
    seedUploadTask,
    resetSeedCounters,
  } = require('@/test/seedHelpers') as {
    seedPendingMessage: (overrides?: Record<string, unknown>) => Record<string, unknown>;
    seedUploadTask: (overrides?: Record<string, unknown>) => Record<string, unknown>;
    resetSeedCounters: () => void;
  };
  const { pendingMessageRepository } = require('@/services/storage/pendingMessageRepository') as {
    pendingMessageRepository: {
      listAll: () => Array<Record<string, unknown>>;
      get: (id: string) => Record<string, unknown> | undefined;
      listReady: (now?: number) => Array<Record<string, unknown>>;
    };
  };
  const { uploadTaskRepository } = require('@/services/storage/uploadTaskRepository') as {
    uploadTaskRepository: {
      get: (id: string) => Record<string, unknown> | undefined;
      listPending: () => Array<Record<string, unknown>>;
    };
  };

  beforeEach(() => {
    __resetForTests();
    resetSeedCounters();
  });

  it('seedPendingMessage should be readable by repository', () => {
    const seeded = seedPendingMessage({ conversationId: 'conv-test-1' });
    const all = pendingMessageRepository.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].localId).toBe(seeded.localId);
    expect(all[0].conversationId).toBe('conv-test-1');
    expect(all[0].status).toBe('pending');
  });

  it('seedPendingMessage should support custom overrides', () => {
    seedPendingMessage({ localId: 'custom-id', status: 'failed', retryCount: 3 });
    const item = pendingMessageRepository.get('custom-id');
    expect(item).toBeDefined();
    expect(item!.status).toBe('failed');
    expect(item!.retryCount).toBe(3);
  });

  it('seedPendingMessage should generate unique IDs', () => {
    const a = seedPendingMessage();
    const b = seedPendingMessage();
    expect(a.localId).not.toBe(b.localId);
    expect(a.clientMessageId).not.toBe(b.clientMessageId);
  });

  it('seedPendingMessage with listReady should respect status filter (only pending)', () => {
    seedPendingMessage({ status: 'pending' });
    seedPendingMessage({ status: 'failed' });
    seedPendingMessage({ status: 'sending' });
    const ready = pendingMessageRepository.listReady();
    // listReady now only returns 'pending' (excludes 'sending')
    expect(ready).toHaveLength(1);
  });

  it('seedUploadTask should be readable by repository', () => {
    const seeded = seedUploadTask({ conversationId: 'conv-upload-1' });
    const task = uploadTaskRepository.get(seeded.taskId as string);
    expect(task).toBeDefined();
    expect(task!.conversationId).toBe('conv-upload-1');
    expect(task!.status).toBe('pending');
  });

  it('seedUploadTask should support custom overrides', () => {
    seedUploadTask({
      taskId: 'custom-upload-id',
      status: 'failed',
      retryCount: 2,
      lastError: 'timeout',
    });
    const task = uploadTaskRepository.get('custom-upload-id');
    expect(task).toBeDefined();
    expect(task!.status).toBe('failed');
    expect(task!.retryCount).toBe(2);
    expect(task!.lastError).toBe('timeout');
  });

  it('seedUploadTask should generate unique IDs', () => {
    const a = seedUploadTask();
    const b = seedUploadTask();
    expect(a.taskId).not.toBe(b.taskId);
  });

  it('seedUploadTask with listPending should respect status filter', () => {
    seedUploadTask({ status: 'pending' });
    seedUploadTask({ status: 'uploaded' });
    seedUploadTask({ status: 'failed' });
    const pending = uploadTaskRepository.listPending();
    expect(pending).toHaveLength(2);
  });
});
