import type {
  MobileMessage,
  PendingMessage,
  UploadTask,
} from '../../types/models';
import {
  deriveSendStage,
} from '../sendStateMachine';

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
    uploadType: 'IMAGE' as import('@im/shared-types').MessageType,
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
