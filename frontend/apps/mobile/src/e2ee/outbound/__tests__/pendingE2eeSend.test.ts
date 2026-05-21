/**
 * pendingE2eeSend unit tests.
 *
 * Updated for secure plaintext storage: plaintext is stored in Keychain
 * (via e2eeSecureStorage), not in the SQLite payloadJson.
 */
import type { MobileMessage, PendingMessage } from '@/types/models';
import type { ChatSession } from '@im/shared-types';

// ─── Mock refs (before jest.mock, to avoid closure/hoisting issues) ────

const mockEnqueue = jest.fn();
const mockListByConversation = jest.fn();
const mockUpdate = jest.fn();
const mockEncryptToEnvelope = jest.fn();
const mockSavePendingPlaintext = jest.fn();
const mockGetPendingPlaintext = jest.fn();
const mockRemovePendingPlaintext = jest.fn();
const mockGetDeviceId = jest.fn();

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('@/services/storage/pendingMessageRepository', () => ({
  pendingMessageRepository: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    listByConversation: (...args: unknown[]) => mockListByConversation(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/e2ee/manager/e2eeManager', () => ({
  e2eeManager: {
    encryptToEnvelope: (...args: unknown[]) => mockEncryptToEnvelope(...args),
  },
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: { id: '100', nickname: 'Alice', username: 'alice' },
    })),
  },
}));

jest.mock('@/e2ee/storage/secureE2eeStorage', () => ({
  e2eeSecureStorage: {
    savePendingPlaintext: (...args: unknown[]) => mockSavePendingPlaintext(...args),
    getPendingPlaintext: (...args: unknown[]) => mockGetPendingPlaintext(...args),
    removePendingPlaintext: (...args: unknown[]) => mockRemovePendingPlaintext(...args),
    getDeviceId: (...args: unknown[]) => mockGetDeviceId(...args),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────

import {
  enqueuePendingE2eeText,
  findPendingE2eeSends,
  isE2eePendingPayload,
  encryptPendingE2eePayload,
} from '../pendingE2eeSend';

// ─── Helpers ──────────────────────────────────────────────────────────

const rustEnvelope = {
  version: 2 as const,
  algorithm: 'rust-x25519-x3dh-dr-v1' as const,
  senderDeviceId: 'device-100',
  recipientDeviceId: 'device-200',
  sessionId: '100_200',
  handshake: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  wire: 'AAAAAA==',
};

const makePending = (payloadObj: Record<string, unknown>, overrides: Partial<PendingMessage> = {}): PendingMessage => ({
  localId: 'local_1',
  conversationId: '100_200',
  sendType: 'private',
  payloadJson: JSON.stringify(payloadObj),
  status: 'pending',
  retryCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('enqueuePendingE2eeText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDeviceId.mockResolvedValue('device-100');
    mockSavePendingPlaintext.mockResolvedValue(undefined);
  });

  it('saves plaintext to secure storage and enqueues pending with plaintextRef', async () => {
    const session = { id: '100_200', type: 'private' as const, targetId: '200', targetName: 'Bob', unreadCount: 0, lastActiveTime: '', isPinned: false, isMuted: false } as ChatSession;
    const message = { id: 'local_1', clientMessageId: 'client_1', conversationId: '100_200', senderId: '100', senderName: 'Alice', isGroupChat: false, messageType: 'TEXT' as const, content: 'hello', sendTime: '2024-06-01T10:00:00.000Z', status: 'SENDING' as const } as MobileMessage;

    await enqueuePendingE2eeText(session, message, 'hello world', 'negotiation');

    // Plaintext saved to secure storage
    expect(mockSavePendingPlaintext).toHaveBeenCalledWith('100', 'device-100', 'local_1', 'hello world');

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const enqueued = mockEnqueue.mock.calls[0][0] as PendingMessage;
    expect(enqueued.localId).toBe('local_1');
    expect(enqueued.conversationId).toBe('100_200');

    const payload = JSON.parse(enqueued.payloadJson) as Record<string, unknown>;
    expect(payload.requiresE2ee).toBe(true);
    expect(payload.e2eeWaitReason).toBe('negotiation');
    // plaintext MUST NOT be in payload
    expect(payload.plaintext).toBeUndefined();
    // plaintextRef MUST reference the localId
    expect(payload.plaintextRef).toBe('local_1');
    expect(payload.data).toBeDefined();
    expect((payload.data as Record<string, unknown>).content).toBeUndefined();
  });

  it('throws when no authenticated user', async () => {
    const { useAuthStore } = jest.requireMock('@/stores/authStore');
    useAuthStore.getState.mockReturnValueOnce({ currentUser: null });

    const session = { id: '100_200', type: 'private' as const, targetId: '200', targetName: 'Bob', unreadCount: 0, lastActiveTime: '', isPinned: false, isMuted: false } as ChatSession;
    const message = { id: 'local_1', clientMessageId: 'client_1' } as MobileMessage;

    await expect(
      enqueuePendingE2eeText(session, message, 'test', 'negotiation'),
    ).rejects.toThrow('E2EE pending send requires an authenticated user');

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('throws when no provisioned device', async () => {
    mockGetDeviceId.mockResolvedValueOnce('');

    const session = { id: '100_200', type: 'private' as const, targetId: '200', targetName: 'Bob', unreadCount: 0, lastActiveTime: '', isPinned: false, isMuted: false } as ChatSession;
    const message = { id: 'local_1', clientMessageId: 'client_1' } as MobileMessage;

    await expect(
      enqueuePendingE2eeText(session, message, 'test', 'negotiation'),
    ).rejects.toThrow('E2EE pending send requires a provisioned device');

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('uses the provided reason in e2eeWaitReason', async () => {
    const session = { id: '100_200', type: 'private' as const, targetId: '200', targetName: 'Bob', unreadCount: 0, lastActiveTime: '', isPinned: false, isMuted: false } as ChatSession;
    const messageAlt = { id: 'local_1', clientMessageId: 'client_1', conversationId: '100_200', senderId: '100', senderName: 'Alice', isGroupChat: false, messageType: 'TEXT' as const, content: 'hello', sendTime: '2024-06-01T10:00:00.000Z', status: 'SENDING' as const } as MobileMessage;

    await enqueuePendingE2eeText(session, messageAlt, 'test', 'prekey');

    const payload = JSON.parse(mockEnqueue.mock.calls[0][0].payloadJson) as Record<string, unknown>;
    expect(payload.e2eeWaitReason).toBe('prekey');
  });
});

describe('findPendingE2eeSends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only pending items with requiresE2ee=true', () => {
    const e2eePending = makePending({ sendType: 'private', requiresE2ee: true, plaintextRef: 'local_1', data: { receiverId: '200', clientMessageId: 'c1', messageType: 'TEXT' } });
    const plainPending = makePending({ sendType: 'private', data: { clientMessageId: 'c2', messageType: 'TEXT', content: 'visible' } });
    mockListByConversation.mockReturnValue([e2eePending, plainPending]);

    const result = findPendingE2eeSends('100_200');

    expect(result).toHaveLength(1);
    expect(result[0].localId).toBe('local_1');
    expect(JSON.parse(result[0].payloadJson).requiresE2ee).toBe(true);
  });

  it('excludes non-pending status items', () => {
    const failed = makePending({ sendType: 'private', requiresE2ee: true, plaintextRef: 'local_1', data: { receiverId: '200', clientMessageId: 'c1', messageType: 'TEXT' } }, { status: 'failed' });
    mockListByConversation.mockReturnValue([failed]);
    expect(findPendingE2eeSends('100_200')).toHaveLength(0);
  });

  it('returns empty array when no items', () => {
    mockListByConversation.mockReturnValue([]);
    expect(findPendingE2eeSends('100_200')).toHaveLength(0);
  });

  it('handles invalid JSON payload gracefully', () => {
    const corrupt = makePending({});
    (corrupt as { payloadJson: string }).payloadJson = 'not-json';
    mockListByConversation.mockReturnValue([corrupt]);
    expect(findPendingE2eeSends('100_200')).toHaveLength(0);
  });
});

describe('isE2eePendingPayload', () => {
  it('returns true for requiresE2ee=true', () => {
    expect(isE2eePendingPayload({ requiresE2ee: true })).toBe(true);
  });
  it('returns false without requiresE2ee', () => {
    expect(isE2eePendingPayload({ sendType: 'private' })).toBe(false);
  });
  it('returns false for null/undefined', () => {
    expect(isE2eePendingPayload(null)).toBe(false);
    expect(isE2eePendingPayload(undefined)).toBe(false);
  });
  it('returns false for requiresE2ee=false', () => {
    expect(isE2eePendingPayload({ requiresE2ee: false })).toBe(false);
  });
});

describe('encryptPendingE2eePayload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncryptToEnvelope.mockResolvedValue(rustEnvelope);
    mockGetDeviceId.mockResolvedValue('device-100');
    mockGetPendingPlaintext.mockResolvedValue('hello secret');
    mockRemovePendingPlaintext.mockResolvedValue(undefined);
  });

  it('encrypts and updates pending payload on success, deletes plaintext from secure storage', async () => {
    const item = makePending({ sendType: 'private', requiresE2ee: true, plaintextRef: 'local_1', data: { receiverId: '200', clientMessageId: 'c1', messageType: 'TEXT' } });

    const result = await encryptPendingE2eePayload(item);

    expect(result.ok).toBe(true);
    expect(result.envelope).toEqual(rustEnvelope);

    // Must read plaintext from secure storage (not from payload)
    expect(mockGetPendingPlaintext).toHaveBeenCalledWith('100', 'device-100', 'local_1');
    expect(mockEncryptToEnvelope).toHaveBeenCalledWith({
      sessionId: '100_200', plaintext: 'hello secret', recipientUserId: '200',
    });

    // Must delete plaintext from secure storage on success
    expect(mockRemovePendingPlaintext).toHaveBeenCalledWith('100', 'device-100', 'local_1');

    expect(mockUpdate).toHaveBeenCalled();
    const updated = mockUpdate.mock.calls[0][0] as PendingMessage;
    const updatedPayload = JSON.parse(updated.payloadJson) as Record<string, unknown>;
    expect(updatedPayload.requiresE2ee).toBeUndefined();
    expect(updatedPayload.plaintext).toBeUndefined();
    expect(updatedPayload.plaintextRef).toBeUndefined();
    expect(updatedPayload.encrypted).toBe(true);
    expect((updatedPayload.data as Record<string, unknown>).e2eeEnvelope).toEqual(rustEnvelope);
  });

  it('returns error when encryptToEnvelope fails (retryable — keeps plaintext in secure storage)', async () => {
    const item = makePending({ sendType: 'private', requiresE2ee: true, plaintextRef: 'local_1', data: { receiverId: '200', clientMessageId: 'c1', messageType: 'TEXT' } });
    mockEncryptToEnvelope.mockRejectedValueOnce(new Error('Rust session unavailable'));

    const result = await encryptPendingE2eePayload(item);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Rust session unavailable');
    // Plaintext is NOT deleted on retryable failure
    expect(mockRemovePendingPlaintext).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
    const updated = mockUpdate.mock.calls[0][0] as PendingMessage;
    expect(updated.retryCount).toBe(1);
    expect(updated.lastError).toContain('encrypt failed');
  });

  it('deletes plaintext from secure storage on exhausted failure', async () => {
    const item = makePending({ sendType: 'private', requiresE2ee: true, plaintextRef: 'local_1', data: { receiverId: '200', clientMessageId: 'c1', messageType: 'TEXT' } }, { retryCount: 5 });
    mockEncryptToEnvelope.mockRejectedValueOnce(new Error('E2EE negotiation has not been accepted'));

    const result = await encryptPendingE2eePayload(item);

    expect(result.ok).toBe(false);
    // Plaintext MUST be deleted on exhausted failure
    expect(mockRemovePendingPlaintext).toHaveBeenCalledWith('100', 'device-100', 'local_1');
  });

  it('exhausts immediately when plaintext is missing from secure storage', async () => {
    const item = makePending({ sendType: 'private', requiresE2ee: true, plaintextRef: 'local_1', data: { receiverId: '200', clientMessageId: 'c1', messageType: 'TEXT' } });
    mockGetPendingPlaintext.mockResolvedValueOnce(null);

    const result = await encryptPendingE2eePayload(item);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('pending plaintext missing from secure storage');
    expect(mockEncryptToEnvelope).not.toHaveBeenCalled();
    // Exhausted: status is failed
    const updateCall = (mockUpdate as jest.Mock).mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>)?.status === 'failed',
    );
    expect(updateCall).toBeDefined();
  });

  it('returns error for missing receiverId', async () => {
    const item = makePending({ sendType: 'private', requiresE2ee: true, plaintextRef: 'local_1', data: { clientMessageId: 'c1', messageType: 'TEXT' } });
    const result = await encryptPendingE2eePayload(item);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing receiver id');
    expect(mockEncryptToEnvelope).not.toHaveBeenCalled();
  });

  it('returns error for non-E2EE pending', async () => {
    const item = makePending({ sendType: 'private', data: { clientMessageId: 'c1', messageType: 'TEXT', content: 'visible' } });
    const result = await encryptPendingE2eePayload(item);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not an E2EE-waiting pending');
  });
});
