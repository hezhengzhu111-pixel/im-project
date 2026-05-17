import type { MessageType } from '@im/shared-types';
import type {
  MobileMessage,
  PendingMessage,
  SendPipelineRetryConfig,
  UploadTask,
} from '../../types/models';
import {
  createSendNextRetryAt,
  createUploadNextRetryAt,
  deriveSendStage,
  isMediaMessageType,
  shouldRetryPendingMessage,
  shouldRetryUpload,
} from '../sendStateMachine';

const CONFIG: SendPipelineRetryConfig = {
  maxRetryCount: 5,
  uploadMaxRetryCount: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
};

function pending(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    localId: 'loc-1',
    conversationId: 'conv-1',
    sendType: 'private',
    payloadJson: '{}',
    status: 'pending',
    retryCount: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function upload(overrides: Partial<UploadTask> = {}): UploadTask {
  return {
    taskId: 'up-1',
    conversationId: 'conv-1',
    localMessageId: 'loc-1',
    fileUri: 'file:///tmp/a.jpg',
    fileName: 'a.jpg',
    uploadType: 'IMAGE' as MessageType,
    status: 'pending',
    progress: 0,
    retryCount: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function message(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: 'msg-1',
    senderId: 'user-1',
    isGroupChat: false,
    messageType: 'TEXT',
    content: 'hello',
    sendTime: '2026-05-16T00:00:00Z',
    status: 'SENDING',
    ...overrides,
  };
}

// ─── deriveSendStage ────────────────────────────────────────────────

describe('deriveSendStage', () => {
  test('no pending, local message with SENT status → SENT', () => {
    expect(deriveSendStage(null, null, message({ status: 'SENT' }))).toBe('SENT');
  });

  test('no pending, local message with DELIVERED status → SENT', () => {
    expect(deriveSendStage(null, null, message({ status: 'DELIVERED' }))).toBe('SENT');
  });

  test('no pending, local message with READ status → SENT', () => {
    expect(deriveSendStage(null, null, message({ status: 'READ' }))).toBe('SENT');
  });

  test('pending blocked → BLOCKED', () => {
    expect(deriveSendStage(pending({ status: 'blocked' }), null, message())).toBe('BLOCKED');
  });

  test('uploadTask pending → UPLOAD_PENDING', () => {
    expect(
      deriveSendStage(null, upload({ status: 'pending' }), message()),
    ).toBe('UPLOAD_PENDING');
  });

  test('uploadTask uploading → UPLOADING', () => {
    expect(
      deriveSendStage(null, upload({ status: 'uploading' }), message()),
    ).toBe('UPLOADING');
  });

  test('uploadTask failed → UPLOAD_FAILED', () => {
    expect(
      deriveSendStage(null, upload({ status: 'failed' }), message()),
    ).toBe('UPLOAD_FAILED');
  });

  test('uploadTask uploaded + pending sending → SENDING', () => {
    expect(
      deriveSendStage(
        pending({ status: 'sending' }),
        upload({ status: 'uploaded' }),
        message(),
      ),
    ).toBe('SENDING');
  });

  test('uploadTask uploaded + no pending → UPLOAD_DONE', () => {
    expect(
      deriveSendStage(null, upload({ status: 'uploaded' }), message()),
    ).toBe('UPLOAD_DONE');
  });

  test('pending sending → SENDING', () => {
    expect(deriveSendStage(pending({ status: 'sending' }), null, message())).toBe('SENDING');
  });

  test('pending failed → SEND_FAILED', () => {
    expect(deriveSendStage(pending({ status: 'failed' }), null, message())).toBe('SEND_FAILED');
  });

  test('pending sent → SENT', () => {
    expect(deriveSendStage(pending({ status: 'sent' }), null, message())).toBe('SENT');
  });

  test('pending pending → SEND_PENDING', () => {
    expect(deriveSendStage(pending({ status: 'pending' }), null, message())).toBe('SEND_PENDING');
  });

  test('no pending, no upload, local message SENDING → SENDING (fallback)', () => {
    expect(deriveSendStage(null, null, message({ status: 'SENDING' }))).toBe('SENDING');
  });

  test('no pending, no upload, local message FAILED → SEND_FAILED (fallback)', () => {
    expect(deriveSendStage(null, null, message({ status: 'FAILED' }))).toBe('SEND_FAILED');
  });

  test('nothing at all → LOCAL_CREATED', () => {
    expect(deriveSendStage(null, null, null)).toBe('LOCAL_CREATED');
  });

  test('pending failed overrides message SENDING → SEND_FAILED', () => {
    expect(
      deriveSendStage(pending({ status: 'failed' }), null, message({ status: 'SENDING' })),
    ).toBe('SEND_FAILED');
  });

  test('uploadTask uploading overrides pending sending → UPLOADING', () => {
    expect(
      deriveSendStage(
        pending({ status: 'sending' }),
        upload({ status: 'uploading' }),
        message({ status: 'SENDING' }),
      ),
    ).toBe('UPLOADING');
  });

  test('blocked pending overrides message FAILED → BLOCKED', () => {
    expect(
      deriveSendStage(pending({ status: 'blocked' }), null, message({ status: 'FAILED' })),
    ).toBe('BLOCKED');
  });
});

// ─── shouldRetryUpload ──────────────────────────────────────────────

describe('shouldRetryUpload', () => {
  test('returns false for non-failed status', () => {
    const task = upload({ status: 'pending' });
    expect(shouldRetryUpload(task, 5000, CONFIG)).toBe(false);
  });

  test('returns true when failed and under retry limit', () => {
    const task = upload({ status: 'failed', retryCount: 1 });
    expect(shouldRetryUpload(task, 5000, CONFIG)).toBe(true);
  });

  test('returns false when retryCount exceeds maxRetryCount', () => {
    const task = upload({ status: 'failed', retryCount: 3 });
    expect(shouldRetryUpload(task, 5000, CONFIG)).toBe(false);
  });

  test('returns false when nextRetryAt is in the future', () => {
    const task = upload({ status: 'failed', retryCount: 0, nextRetryAt: 10_000 });
    expect(shouldRetryUpload(task, 5000, CONFIG)).toBe(false);
  });

  test('returns true when nextRetryAt is in the past', () => {
    const task = upload({ status: 'failed', retryCount: 0, nextRetryAt: 3_000 });
    expect(shouldRetryUpload(task, 5000, CONFIG)).toBe(true);
  });

  test('respects task-level maxRetryCount override', () => {
    // Config says 3, task says 10 → should allow more retries
    const task = upload({ status: 'failed', retryCount: 5, maxRetryCount: 10 });
    expect(shouldRetryUpload(task, 5000, CONFIG)).toBe(true);
  });
});

// ─── shouldRetryPendingMessage ──────────────────────────────────────

describe('shouldRetryPendingMessage', () => {
  test('returns false for sent status', () => {
    expect(shouldRetryPendingMessage(pending({ status: 'sent' }), 5000, CONFIG)).toBe(false);
  });

  test('returns false for blocked status', () => {
    expect(shouldRetryPendingMessage(pending({ status: 'blocked' }), 5000, CONFIG)).toBe(false);
  });

  test('returns false for sending status', () => {
    expect(shouldRetryPendingMessage(pending({ status: 'sending' }), 5000, CONFIG)).toBe(false);
  });

  test('returns true for failed under retry limit', () => {
    expect(
      shouldRetryPendingMessage(pending({ status: 'failed', retryCount: 2 }), 5000, CONFIG),
    ).toBe(true);
  });

  test('returns true for pending under retry limit', () => {
    expect(
      shouldRetryPendingMessage(pending({ status: 'pending', retryCount: 0 }), 5000, CONFIG),
    ).toBe(true);
  });

  test('returns false when retryCount hits max', () => {
    expect(
      shouldRetryPendingMessage(pending({ status: 'failed', retryCount: 5 }), 5000, CONFIG),
    ).toBe(false);
  });

  test('returns false when nextRetryAt is in the future', () => {
    expect(
      shouldRetryPendingMessage(
        pending({ status: 'failed', retryCount: 0, nextRetryAt: 10_000 }),
        5000,
        CONFIG,
      ),
    ).toBe(false);
  });

  test('returns true when nextRetryAt is in the past', () => {
    expect(
      shouldRetryPendingMessage(
        pending({ status: 'failed', retryCount: 0, nextRetryAt: 3_000 }),
        5000,
        CONFIG,
      ),
    ).toBe(true);
  });
});

// ─── createUploadNextRetryAt ────────────────────────────────────────

describe('createUploadNextRetryAt', () => {
  test('returns now + baseDelayMs for retryCount 0', () => {
    expect(createUploadNextRetryAt(0, 1000, CONFIG)).toBe(2000);
  });

  test('delay grows with retryCount', () => {
    const r0 = createUploadNextRetryAt(0, 1000, CONFIG);
    const r1 = createUploadNextRetryAt(1, 1000, CONFIG);
    const r2 = createUploadNextRetryAt(2, 1000, CONFIG);
    expect(r1 - 1000).toBeGreaterThan(r0 - 1000);
    expect(r2 - 1000).toBeGreaterThan(r1 - 1000);
  });

  test('delay is capped at maxDelayMs', () => {
    const retryAt = createUploadNextRetryAt(99, 1000, CONFIG);
    expect(retryAt - 1000).toBeLessThanOrEqual(CONFIG.maxDelayMs);
  });
});

// ─── createSendNextRetryAt ──────────────────────────────────────────

describe('createSendNextRetryAt', () => {
  test('returns now + baseDelayMs for retryCount 0', () => {
    expect(createSendNextRetryAt(0, 1000, CONFIG)).toBe(2000);
  });

  test('delay grows with retryCount and caps at maxDelayMs', () => {
    const retryAt = createSendNextRetryAt(99, 0, CONFIG);
    expect(retryAt).toBeLessThanOrEqual(CONFIG.maxDelayMs);
    expect(retryAt).toBeGreaterThan(0);
  });
});

// ─── isMediaMessageType ─────────────────────────────────────────────

describe('isMediaMessageType', () => {
  test.each(['IMAGE', 'FILE', 'VIDEO', 'VOICE'] as MessageType[])(
    '%s → true',
    (t) => expect(isMediaMessageType(t)).toBe(true),
  );

  test.each(['TEXT', 'SYSTEM', 'AI_REPLY'] as MessageType[])(
    '%s → false',
    (t) => expect(isMediaMessageType(t)).toBe(false),
  );
});
