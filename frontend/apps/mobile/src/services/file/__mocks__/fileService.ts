import type { ApiResponse, FileUploadResponse, MessageType } from '@im/shared-types';

export type { FileUploadResponse } from '@im/shared-types';

export interface MobileFile {
  uri: string;
  name: string;
  type?: string;
  size?: number;
  duration?: number;
  thumbnailUrl?: string;
  originalUri?: string;
}

export const normalizeUploadFile = (file: MobileFile, _type: MessageType): MobileFile => ({
  ...file,
  name: file.name.trim() || 'upload_mock',
  type: file.type || 'application/octet-stream',
});

/** Number of times fileService.upload was called since last reset. */
let callCount = 0;

/** Per-call progress step count (how many onProgress callbacks to fire). */
let progressSteps = 3;

/** Delay in ms between progress callbacks. 0 = synchronous. */
let progressDelay = 0;

/** Error to throw on the next upload call (if set). */
let nextError: Error | null = null;

/** Sequence of errors/responses for consecutive calls. */
let callSequence: Array<{ error?: Error; response?: ApiResponse<FileUploadResponse> }> = [];

/** Default success response data. */
const defaultResponseData: FileUploadResponse = {
  url: 'https://cdn.test/uploaded.jpg',
  fileName: 'uploaded.jpg',
  size: 1024,
  contentType: 'image/jpeg',
};

const buildResponse = (data?: Partial<FileUploadResponse>): ApiResponse<FileUploadResponse> => ({
  code: 200,
  message: 'success',
  success: true,
  timestamp: Date.now(),
  data: { ...defaultResponseData, ...data },
});

async function simulateProgress(
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (!onProgress || progressSteps <= 0) return;
  for (let i = 1; i <= progressSteps; i++) {
    const pct = Math.round((i / progressSteps) * 100);
    if (progressDelay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, progressDelay));
    }
    onProgress(pct);
  }
}

export const fileService = {
  async upload(
    _file: MobileFile,
    _type: MessageType,
    onProgress?: (progress: number) => void,
  ): Promise<ApiResponse<FileUploadResponse>> {
    callCount++;

    // Check call sequence first
    if (callSequence.length >= callCount) {
      const entry = callSequence[callCount - 1];
      if (entry.error) {
        await simulateProgress(onProgress);
        throw entry.error;
      }
      if (entry.response) {
        await simulateProgress(onProgress);
        return entry.response;
      }
    }

    // Check single next-error
    if (nextError) {
      const err = nextError;
      nextError = null;
      await simulateProgress(onProgress);
      throw err;
    }

    // Default: success
    await simulateProgress(onProgress);
    return buildResponse();
  },
};

// --- Test control helpers ---

/** Reset all mock state to defaults. */
export function resetMockState(): void {
  callCount = 0;
  progressSteps = 3;
  progressDelay = 0;
  nextError = null;
  callSequence = [];
}

/** Get how many times upload was called since last reset. */
export function getUploadCallCount(): number {
  return callCount;
}

/**
 * Configure how many progress callbacks to fire per upload call.
 * Set to 0 to disable progress callbacks entirely.
 */
export function setProgressSteps(steps: number): void {
  progressSteps = Math.max(0, steps);
}

/**
 * Set delay in ms between progress callbacks.
 * 0 = all callbacks fire synchronously before response.
 */
export function setProgressDelay(ms: number): void {
  progressDelay = Math.max(0, ms);
}

/**
 * Make the next upload call throw an error.
 * The error is consumed after one use.
 */
export function setNextUploadError(error: Error): void {
  nextError = error;
}

/**
 * Program a sequence of outcomes for consecutive upload calls.
 * Entries are consumed in order. After the sequence is exhausted,
 * subsequent calls use default behavior (success).
 *
 * @example
 * setUploadSequence([
 *   { error: new Error('network timeout') },
 *   { response: buildResponse({ url: 'https://cdn.test/retry-ok.jpg' }) },
 * ]);
 * // First call throws, second call succeeds with custom URL.
 */
export function setUploadSequence(
  entries: Array<{ error?: Error; response?: ApiResponse<FileUploadResponse> }>,
): void {
  callSequence = entries;
  callCount = 0;
}

/**
 * Build a custom success response. Useful inside setUploadSequence.
 */
export function buildMockResponse(
  data?: Partial<FileUploadResponse>,
): ApiResponse<FileUploadResponse> {
  return buildResponse(data);
}
