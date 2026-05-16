/**
 * messageStore retryMessage/retryPending 分阶段重构测试
 *
 * 覆盖:
 *  1. 文本成功发送后 remove pending
 *  2. 文本发送失败 pending retryCount+1、nextRetryAt、本地消息 FAILED
 *  3. 自动 retryPending 不处理 future nextRetryAt
 *  4. 手动 retryMessage(force=true) 忽略 future nextRetryAt
 *  5. 媒体 pending 先上传再发送
 *  6. 上传失败不调用 sendPrivate/sendGroup
 *  7. 上传成功但发送失败 → 下次 retry 复用 remoteUrl
 *  8. uploadTask 已 uploaded + remoteUrl 跳过上传
 *  9. 并发 retryMessage 同一 localId 只发送一次
 * 10. E2EE blocked 不发送、不上传
 * 11. pending 不存在安全 return
 */

import type { ChatSession } from '@im/shared-types';
import type { MobileMessage, PendingMessage, UploadTask } from '@/types/models';
import type { FileUploadResponse } from '@im/shared-types';

// ─── Mocks ───────────────────────────────────────────────────────────

jest.mock('@/services/storage/messageRepository');
jest.mock('@/services/storage/pendingMessageRepository');
jest.mock('@/services/storage/uploadTaskRepository');
jest.mock('@/services/chat/messageService');
jest.mock('@/services/upload/uploadService');
jest.mock('@/utils/logger');
jest.mock('@/utils/ids', () => ({
  createClientMessageId: jest.fn(() => `client_rt_${Date.now()}`),
  createLocalMessageId: jest.fn(() => `local_rt_${Date.now()}`),
}));

jest.mock('@/e2ee/e2eeDeferred', () => ({
  maskEncryptedMessage: (msg: MobileMessage) => msg,
  assertPlaintextSendAllowed: jest.fn(),
  blockEncryptedPendingPayload: jest.fn(() => false),
}));

const mockSessions: ChatSession[] = [];
jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      currentUser: { id: '100', nickname: 'TestUser', username: 'testuser' },
    })),
  },
}));
jest.mock('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: jest.fn(() => ({
      sessions: mockSessions,
      currentSession: null as ChatSession | null,
      upsertSession: jest.fn(),
      markRead: jest.fn(),
      setCurrentSession: jest.fn(),
    })),
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────

import { useMessageStore } from '../messageStore';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { messageService } from '@/services/chat/messageService';
import { uploadService } from '@/services/upload/uploadService';
import { blockEncryptedPendingPayload } from '@/e2ee/e2eeDeferred';
import { freezeTime, restoreTime } from '@/test/timeHelpers';
import { RETRY_CONFIG } from '@/constants/config';

const pr = jest.mocked(pendingMessageRepository);
const utr = jest.mocked(uploadTaskRepository);
const ms = jest.mocked(messageService);
const us = jest.mocked(uploadService);

// ─── Helpers ─────────────────────────────────────────────────────────

const baseMobileMessage = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: 'msg_rt_1',
  messageId: 'msg_rt_1',
  senderId: '100',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'hello',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENDING',
  conversationId: '100_200',
  ...overrides,
});

function textPending(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    localId: 'local_text_1',
    conversationId: '100_200',
    sendType: 'private',
    payloadJson: JSON.stringify({
      sendType: 'private',
      data: { clientMessageId: 'cmid_text_1', messageType: 'TEXT', content: 'hello' },
    }),
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mediaPending(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    localId: 'local_media_1',
    conversationId: '100_200',
    sendType: 'private',
    payloadJson: JSON.stringify({
      sendType: 'private',
      data: {
        clientMessageId: 'cmid_media_1',
        messageType: 'IMAGE',
        mediaUrl: 'file:///local/photo.jpg',
        mediaName: 'photo.jpg',
        mediaSize: 2048,
      },
      uploadTaskId: 'upload_media_1',
    }),
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeUploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
  return {
    taskId: 'upload_media_1',
    conversationId: '100_200',
    localMessageId: 'local_media_1',
    fileUri: 'file:///local/photo.jpg',
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2048,
    uploadType: 'IMAGE',
    status: 'pending',
    progress: 0,
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const uploadSuccessResponse = (url = 'https://cdn.test/uploaded.jpg'): FileUploadResponse => ({
  url,
  fileName: 'uploaded.jpg',
  size: 2048,
  contentType: 'image/jpeg',
});

describe('messageStore retry pipeline', () => {
  beforeEach(() => {
    useMessageStore.setState({
      messagesBySession: {},
      messagesPaginationBySession: {},
      loading: false,
      searchResults: [],
    });
    jest.clearAllMocks();
    mockSessions.length = 0;
    pr.listReady.mockReturnValue([]);
    pr.listReadyToSend.mockReturnValue([]);
    pr.findByClientMessageId.mockReturnValue(undefined);
    (blockEncryptedPendingPayload as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    restoreTime();
  });

  // ── 1. 文本成功发送后 remove pending ──────────────────────────────

  describe('text message send success (test case 1)', () => {
    it('removes pending and adds server message on success', async () => {
      const pending = textPending();
      pr.get.mockReturnValue(pending);
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: {
          id: 'srv_text_1',
          messageId: 'srv_text_1',
          clientMessageId: 'cmid_text_1',
          status: 'SENT',
          content: 'hello',
        },
      } as never);

      await useMessageStore.getState().retryMessage('local_text_1');

      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);
      expect(pr.remove).toHaveBeenCalledWith('local_text_1');
      // Server message added to state
      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toBeDefined();
      expect(messages!.some((m) => m.id === 'srv_text_1' || m.messageId === 'srv_text_1')).toBe(true);
    });

    it('also removes by clientMessageId', async () => {
      const pending = textPending();
      pr.get.mockReturnValue(pending);
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_text_2', messageId: 'srv_text_2', clientMessageId: 'cmid_text_1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_text_1');

      expect(pr.removeByClientMessageId).toHaveBeenCalledWith('cmid_text_1');
    });
  });

  // ── 2. 文本发送失败 pending retryCount+1、nextRetryAt、本地消息 FAILED ──

  describe('text message send failure (test case 2)', () => {
    it('increments retryCount and sets nextRetryAt on send failure', async () => {
      freezeTime(1700000000000);
      const pending = textPending({ retryCount: 0 });
      pr.get.mockReturnValue(pending);
      ms.sendPrivate.mockRejectedValueOnce(new Error('network down'));

      await useMessageStore.getState().retryMessage('local_text_1');

      const updateCalls = (pr.update as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as PendingMessage);
      const failUpdate = updateCalls.find((p) => p.retryCount > 0);
      expect(failUpdate).toBeDefined();
      expect(failUpdate!.retryCount).toBe(1);
      expect(failUpdate!.nextRetryAt).toBeGreaterThan(1700000000000);
      expect(failUpdate!.lastError).toContain('send failed');
      expect(failUpdate!.lastError).toContain('network down');
      expect(failUpdate!.status).toBe('pending');
    });

    it('sets pending to failed when maxRetryCount reached for send', async () => {
      freezeTime(1700000000000);
      const pending = textPending({ retryCount: RETRY_CONFIG.maxRetryCount - 1 });
      pr.get.mockReturnValue(pending);
      ms.sendPrivate.mockRejectedValueOnce(new Error('final failure'));

      await useMessageStore.getState().retryMessage('local_text_1');

      const failUpdate = (pr.update as jest.Mock).mock.calls
        .map((c: unknown[]) => c[0] as PendingMessage)
        .find((p) => p.retryCount >= RETRY_CONFIG.maxRetryCount);
      expect(failUpdate).toBeDefined();
      expect(failUpdate!.status).toBe('failed');
    });

    it('updates local message to FAILED on send failure', async () => {
      const pending = textPending({ conversationId: '100_200', localId: 'local_text_fail' });
      pr.get.mockReturnValue(pending);
      ms.sendPrivate.mockRejectedValueOnce(new Error('send error'));

      // Pre-populate messagesBySession with the optimistic message
      useMessageStore.setState({
        messagesBySession: {
          '100_200': [
            baseMobileMessage({ id: 'local_text_fail', status: 'SENDING', conversationId: '100_200' }),
          ],
        },
      });

      await useMessageStore.getState().retryMessage('local_text_fail');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      expect(messages).toBeDefined();
      const updated = messages!.find((m) => m.id === 'local_text_fail');
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('FAILED');
    });
  });

  // ── 3. 自动 retryPending 不处理 future nextRetryAt ──────────────────

  describe('auto retryPending respects nextRetryAt (test case 3)', () => {
    it('skips pending with future nextRetryAt when force=false', async () => {
      freezeTime(1700000000000);
      const futurePending = textPending({
        localId: 'local_future',
        nextRetryAt: 1700000000000 + 60000, // 60s in the future
      });
      pr.listReadyToSend.mockReturnValue([]); // listReadyToSend already filters
      pr.get.mockReturnValue(futurePending);

      await useMessageStore.getState().retryMessage('local_future', { force: false });

      // Should return early before sending
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });
  });

  // ── 4. 手动 retryMessage(force=true) 忽略 future nextRetryAt ─────────

  describe('manual retry with force=true (test case 4)', () => {
    it('sends despite future nextRetryAt when force=true', async () => {
      freezeTime(1700000000000);
      const futurePending = textPending({
        localId: 'local_future_force',
        nextRetryAt: 1700000000000 + 120000,
      });
      pr.get.mockReturnValue(futurePending);
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_forced', messageId: 'srv_forced', clientMessageId: 'cmid_text_1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_future_force', { force: true });

      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);
      expect(pr.remove).toHaveBeenCalledWith('local_future_force');
    });
  });

  // ── 5. 媒体 pending 先上传再发送 ──────────────────────────────────

  describe('media message: upload then send (test case 5)', () => {
    it('uploads before sending for media messages', async () => {
      const pending = mediaPending();
      const uploadTask = makeUploadTask();
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse());
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_media', messageId: 'srv_media', clientMessageId: 'cmid_media_1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_media_1');

      // Upload must happen before send
      const uploadCallOrder = (us.uploadExistingTask as jest.Mock).mock.invocationCallOrder[0];
      const sendCallOrder = (ms.sendPrivate as jest.Mock).mock.invocationCallOrder[0];
      expect(uploadCallOrder).toBeLessThan(sendCallOrder);
      expect(us.uploadExistingTask).toHaveBeenCalledWith('upload_media_1');
      expect(ms.sendPrivate).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: 'https://cdn.test/uploaded.jpg',
          messageType: 'IMAGE',
        }),
      );
    });

    it('updates pending payloadJson with uploaded media URLs', async () => {
      const pending = mediaPending();
      const uploadTask = makeUploadTask();
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse('https://cdn.test/photo.jpg'));
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_media', messageId: 'srv_media', clientMessageId: 'cmid_media_1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_media_1');

      // Check that payloadJson was updated with the new URLs
      const updateCalls = (pr.update as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as PendingMessage);
      const payloadUpdate = updateCalls.find((p) => {
        try {
          const parsed = JSON.parse(p.payloadJson);
          return parsed.data?.mediaUrl === 'https://cdn.test/photo.jpg';
        } catch {
          return false;
        }
      });
      expect(payloadUpdate).toBeDefined();
    });
  });

  // ── 6. 上传失败不调用 sendPrivate/sendGroup ────────────────────────

  describe('upload failure blocks send (test case 6)', () => {
    it('does not call sendPrivate when upload fails', async () => {
      const pending = mediaPending();
      const uploadTask = makeUploadTask();
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockRejectedValueOnce(new Error('upload timeout'));

      await useMessageStore.getState().retryMessage('local_media_1');

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
    });

    it('updates pending with upload error, not send error', async () => {
      const pending = mediaPending();
      const uploadTask = makeUploadTask();
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockRejectedValueOnce(new Error('upload timeout'));

      await useMessageStore.getState().retryMessage('local_media_1');

      const failUpdate = (pr.update as jest.Mock).mock.calls
        .map((c: unknown[]) => c[0] as PendingMessage)
        .find((p) => p.lastError?.includes('upload failed'));
      expect(failUpdate).toBeDefined();
      expect(failUpdate!.lastError).toContain('upload timeout');
      expect(failUpdate!.status).toBe('pending'); // still pending for retry
    });

    it('does not increment pending.retryCount on upload failure', async () => {
      const pending = mediaPending({ retryCount: 0 });
      const uploadTask = makeUploadTask({ retryCount: 0 });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockRejectedValueOnce(new Error('upload timeout'));

      await useMessageStore.getState().retryMessage('local_media_1');

      const failUpdate = (pr.update as jest.Mock).mock.calls
        .map((c: unknown[]) => c[0] as PendingMessage)
        .find((p) => p.lastError?.includes('upload failed'));
      expect(failUpdate).toBeDefined();
      // pending.retryCount should NOT be incremented for upload failure
      // The update call for upload failure keeps the original retryCount
      if (failUpdate!.retryCount !== undefined) {
        expect(failUpdate!.retryCount).toBe(0);
      }
    });

    it('sets local message to FAILED on upload failure', async () => {
      const pending = mediaPending({ localId: 'local_up_fail', conversationId: '100_200' });
      const uploadTask = makeUploadTask({ localMessageId: 'local_up_fail' });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockRejectedValueOnce(new Error('upload timeout'));

      useMessageStore.setState({
        messagesBySession: {
          '100_200': [
            baseMobileMessage({ id: 'local_up_fail', status: 'SENDING', conversationId: '100_200' }),
          ],
        },
      });

      await useMessageStore.getState().retryMessage('local_up_fail');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      const updated = messages!.find((m) => m.id === 'local_up_fail');
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('FAILED');
    });
  });

  // ── 7. 上传成功但发送失败 → 下次 retry 复用 remoteUrl ──────────────

  describe('upload success but send fails → next retry reuses remoteUrl (test case 7)', () => {
    it('reuses remoteUrl on second retry, does not call upload again', async () => {
      const pending = mediaPending();
      const uploadTask = makeUploadTask();
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);

      // First attempt: upload succeeds, send fails
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse('https://cdn.test/photo_v1.jpg'));
      ms.sendPrivate.mockRejectedValueOnce(new Error('send failed'));

      await useMessageStore.getState().retryMessage('local_media_1');

      expect(us.uploadExistingTask).toHaveBeenCalledTimes(1);
      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);

      // Simulate second attempt: upload task is now 'uploaded'
      const uploadedTask = makeUploadTask({
        status: 'uploaded',
        remoteUrl: 'https://cdn.test/photo_v1.jpg',
        progress: 100,
      });
      utr.get.mockReturnValue(uploadedTask);
      pr.get.mockReturnValue({
        ...pending,
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: {
            clientMessageId: 'cmid_media_1',
            messageType: 'IMAGE',
            mediaUrl: 'https://cdn.test/photo_v1.jpg',
            mediaName: 'uploaded.jpg',
            mediaSize: 2048,
          },
          uploadTaskId: 'upload_media_1',
        }),
      });
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_media_2', messageId: 'srv_media_2', clientMessageId: 'cmid_media_1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_media_1');

      // Upload should NOT be called again
      expect(us.uploadExistingTask).toHaveBeenCalledTimes(1); // still 1 from first attempt
      // Send should be called again
      expect(ms.sendPrivate).toHaveBeenCalledTimes(2);
      expect(ms.sendPrivate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mediaUrl: 'https://cdn.test/photo_v1.jpg',
        }),
      );
    });
  });

  // ── 8. uploadTask 已 uploaded + remoteUrl 跳过上传 ─────────────────

  describe('already uploaded task skips upload (test case 8)', () => {
    it('does not call uploadExistingTask when uploadTask is already uploaded', async () => {
      const pending = mediaPending();
      const uploadedTask = makeUploadTask({
        status: 'uploaded',
        remoteUrl: 'https://cdn.test/already_uploaded.jpg',
        progress: 100,
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadedTask);
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_skip', messageId: 'srv_skip', clientMessageId: 'cmid_media_1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_media_1');

      expect(us.uploadExistingTask).not.toHaveBeenCalled();
      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);
      expect(ms.sendPrivate).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: 'https://cdn.test/already_uploaded.jpg',
        }),
      );
    });
  });

  // ── 9. 并发 retryMessage 同一 localId 只发送一次 ─────────────────

  describe('concurrent retryMessage dedup (test case 9)', () => {
    it('only sends once when called concurrently for same localId', async () => {
      const pending = textPending();
      pr.get.mockReturnValue(pending);

      // Use a deferred promise so we can control when send completes
      let resolveSend: (value: unknown) => void;
      const sendPromise = new Promise((resolve) => {
        resolveSend = resolve;
      });
      ms.sendPrivate.mockReturnValueOnce(sendPromise as Promise<never>);

      // Fire two concurrent retryMessage calls
      const p1 = useMessageStore.getState().retryMessage('local_text_1');
      const p2 = useMessageStore.getState().retryMessage('local_text_1');

      // Resolve the send
      resolveSend!({
        code: 0,
        message: 'ok',
        data: { id: 'srv_concurrent', messageId: 'srv_concurrent', clientMessageId: 'cmid_text_1', status: 'SENT' },
      });

      await Promise.all([p1, p2]);

      // sendPrivate should only be called once
      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);
    });
  });

  // ── 10. E2EE blocked 不发送、不上传 ───────────────────────────────

  describe('E2EE blocked (test case 10)', () => {
    it('does not upload or send when E2EE blocked', async () => {
      (blockEncryptedPendingPayload as jest.Mock).mockReturnValue(true);
      const pending = mediaPending(); // has uploadTaskId
      pr.get.mockReturnValue(pending);

      await useMessageStore.getState().retryMessage('local_media_1');

      expect(us.uploadExistingTask).not.toHaveBeenCalled();
      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();

      // pending status should be blocked
      expect(pr.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'blocked',
          lastError: 'E2EE deferred',
        }),
      );
    });

    it('updates local message to FAILED on E2EE block', async () => {
      (blockEncryptedPendingPayload as jest.Mock).mockReturnValue(true);
      const pending = textPending({ localId: 'local_e2ee_fail', conversationId: '100_200' });
      pr.get.mockReturnValue(pending);

      useMessageStore.setState({
        messagesBySession: {
          '100_200': [
            baseMobileMessage({ id: 'local_e2ee_fail', status: 'SENDING', conversationId: '100_200' }),
          ],
        },
      });

      await useMessageStore.getState().retryMessage('local_e2ee_fail');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      const updated = messages!.find((m) => m.id === 'local_e2ee_fail');
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('FAILED');
    });
  });

  // ── 11. pending 不存在安全 return ────────────────────────────────

  describe('missing pending (test case 11)', () => {
    it('returns safely when pending does not exist', async () => {
      pr.get.mockReturnValue(undefined);

      await expect(
        useMessageStore.getState().retryMessage('nonexistent'),
      ).resolves.toBeUndefined();

      expect(ms.sendPrivate).not.toHaveBeenCalled();
      expect(ms.sendGroup).not.toHaveBeenCalled();
      expect(us.uploadExistingTask).not.toHaveBeenCalled();
    });
  });

  // ── upload exhausted 场景 ────────────────────────────────────────

  describe('upload exhausted', () => {
    it('marks pending as failed when upload retries exhausted', async () => {
      const pending = mediaPending();
      const exhaustedTask = makeUploadTask({
        status: 'failed',
        retryCount: 5,
        maxRetryCount: 5,
        lastError: 'network timeout',
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(exhaustedTask);

      await useMessageStore.getState().retryMessage('local_media_1', { force: false });

      // Should not try to upload or send
      expect(us.uploadExistingTask).not.toHaveBeenCalled();
      expect(ms.sendPrivate).not.toHaveBeenCalled();

      // pending should be marked failed with upload exhausted error
      const failUpdate = (pr.update as jest.Mock).mock.calls
        .map((c: unknown[]) => c[0] as PendingMessage)
        .find((p) => p.status === 'failed');
      expect(failUpdate).toBeDefined();
      expect(failUpdate!.lastError).toContain('upload exhausted');
    });

    it('force=true still attempts upload even if retries exhausted', async () => {
      const pending = mediaPending();
      const exhaustedTask = makeUploadTask({
        status: 'failed',
        retryCount: 5,
        maxRetryCount: 5,
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(exhaustedTask);
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse());
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_forced_up', messageId: 'srv_forced_up', clientMessageId: 'cmid_media_1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_media_1', { force: true });

      expect(us.uploadExistingTask).toHaveBeenCalledTimes(1);
      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);
    });
  });

  // ── uploading 状态等待 ──────────────────────────────────────────

  describe('uploading in progress', () => {
    it('returns early when uploadTask is currently uploading', async () => {
      const pending = mediaPending();
      const uploadingTask = makeUploadTask({ status: 'uploading' });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadingTask);

      await useMessageStore.getState().retryMessage('local_media_1');

      expect(us.uploadExistingTask).not.toHaveBeenCalled();
      expect(ms.sendPrivate).not.toHaveBeenCalled();

      const statusUpdate = (pr.update as jest.Mock).mock.calls
        .map((c: unknown[]) => c[0] as PendingMessage)
        .find((p) => p.lastError === 'upload in progress');
      expect(statusUpdate).toBeDefined();
    });
  });

  // ── retryPending 使用 listReadyToSend ───────────────────────────

  describe('retryPending uses listReadyToSend', () => {
    it('calls listReadyToSend and retries each with force=false', async () => {
      const pending1 = textPending({ localId: 'local_rp_1' });
      const pending2 = textPending({ localId: 'local_rp_2' });
      pr.listReadyToSend.mockReturnValue([pending1, pending2]);
      pr.get.mockImplementation((id: string) => {
        if (id === 'local_rp_1') return pending1;
        if (id === 'local_rp_2') return pending2;
        return undefined;
      });
      ms.sendPrivate.mockResolvedValue({
        code: 0,
        message: 'ok',
        data: { id: 'srv_rp', messageId: 'srv_rp', clientMessageId: 'cmid_text_1', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryPending();

      expect(pr.listReadyToSend).toHaveBeenCalled();
      expect(ms.sendPrivate).toHaveBeenCalledTimes(2);
    });

    it('skips items not returned by listReadyToSend even if pending exists', async () => {
      const pending = textPending({ localId: 'local_filtered', nextRetryAt: Date.now() + 999999 });
      pr.listReadyToSend.mockReturnValue([]); // empty: nothing ready to send
      pr.get.mockReturnValue(pending); // but get still returns it

      await useMessageStore.getState().retryPending();

      // retryPending iterates listReadyToSend, which is empty, so nothing sent
      expect(ms.sendPrivate).not.toHaveBeenCalled();
    });
  });

  // ── 12. 上传成功后发送失败 → pending.payloadJson 保留 mediaUrl ──────

  describe('send failure preserves uploaded mediaUrl in pending payloadJson (req 1)', () => {
    it('preserves remote mediaUrl in pending after upload success then send failure', async () => {
      const pending = mediaPending();
      const uploadTask = makeUploadTask();
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse('https://cdn.test/photo_v1.jpg'));
      ms.sendPrivate.mockRejectedValueOnce(new Error('send failed'));

      await useMessageStore.getState().retryMessage('local_media_1');

      // Check that the final update (send failure) still has the remote mediaUrl
      const updateCalls = (pr.update as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as PendingMessage);
      // The last update should be the send failure one
      const sendFailUpdate = updateCalls[updateCalls.length - 1];
      const payload = JSON.parse(sendFailUpdate.payloadJson);
      expect(payload.data.mediaUrl).toBe('https://cdn.test/photo_v1.jpg');
      expect(payload.data.mediaName).toBe('uploaded.jpg');
      expect(payload.data.mediaSize).toBe(2048);
    });

    it('does NOT overwrite mediaUrl back to file:// after send failure', async () => {
      const pending = mediaPending({
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: {
            clientMessageId: 'cmid_media_1',
            messageType: 'IMAGE',
            mediaUrl: 'file:///local/photo.jpg',
            mediaName: 'photo.jpg',
            mediaSize: 2048,
          },
          uploadTaskId: 'upload_media_1',
        }),
      });
      const uploadTask = makeUploadTask();
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse('https://cdn.test/photo_v2.jpg'));
      ms.sendPrivate.mockRejectedValueOnce(new Error('send failed'));

      await useMessageStore.getState().retryMessage('local_media_1');

      const updateCalls = (pr.update as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as PendingMessage);
      const sendFailUpdate = updateCalls[updateCalls.length - 1];
      const payload = JSON.parse(sendFailUpdate.payloadJson);
      expect(payload.data.mediaUrl).not.toBe('file:///local/photo.jpg');
      expect(payload.data.mediaUrl).toBe('https://cdn.test/photo_v2.jpg');
    });
  });

  // ── 13. 第二次 retry 复用 pending 中的 mediaUrl，不调 upload ────────

  describe('second retry reuses mediaUrl from pending, skips upload (req 3)', () => {
    it('does not call uploadService when pending already has remote mediaUrl', async () => {
      const pending = mediaPending({
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: {
            clientMessageId: 'cmid_media_reuse',
            messageType: 'IMAGE',
            mediaUrl: 'https://cdn.test/already_uploaded.jpg',
            mediaName: 'uploaded.jpg',
            mediaSize: 2048,
          },
          uploadTaskId: 'upload_media_reuse',
        }),
      });
      const uploadTask = makeUploadTask({
        taskId: 'upload_media_reuse',
        status: 'uploaded',
        remoteUrl: 'https://cdn.test/already_uploaded.jpg',
        progress: 100,
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_reuse', messageId: 'srv_reuse', clientMessageId: 'cmid_media_reuse', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_media_1');

      // Should NOT call upload because mediaUrl is already remote
      expect(us.uploadExistingTask).not.toHaveBeenCalled();
      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);
      expect(ms.sendPrivate).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: 'https://cdn.test/already_uploaded.jpg',
        }),
      );
    });
  });

  // ── 14. uploadTask 丢失但 pending 已有 mediaUrl → 仍可发送 ─────────

  describe('uploadTask lost but pending has mediaUrl → still sends (req 5)', () => {
    it('sends without upload when uploadTask is missing but pending has remote mediaUrl', async () => {
      const pending = mediaPending({
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: {
            clientMessageId: 'cmid_no_task',
            messageType: 'IMAGE',
            mediaUrl: 'https://cdn.test/surviving.jpg',
            mediaName: 'surviving.jpg',
            mediaSize: 4096,
          },
          uploadTaskId: 'upload_lost_1',
        }),
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(undefined); // uploadTask lost!
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_no_task', messageId: 'srv_no_task', clientMessageId: 'cmid_no_task', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_media_1');

      expect(us.uploadExistingTask).not.toHaveBeenCalled();
      expect(ms.sendPrivate).toHaveBeenCalledTimes(1);
      expect(ms.sendPrivate).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: 'https://cdn.test/surviving.jpg',
        }),
      );
    });
  });

  // ── 15. uploadTask 丢失且 pending 无 mediaUrl → failed ─────────────

  describe('uploadTask lost and no mediaUrl → failed (req 6)', () => {
    it('marks pending as failed when uploadTask lost and no remote mediaUrl', async () => {
      const pending = mediaPending({
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: {
            clientMessageId: 'cmid_lost',
            messageType: 'IMAGE',
            mediaUrl: 'file:///local/missing.jpg',
            mediaName: 'missing.jpg',
            mediaSize: 1024,
          },
          uploadTaskId: 'upload_lost_2',
        }),
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(undefined); // uploadTask lost!

      useMessageStore.setState({
        messagesBySession: {
          '100_200': [
            baseMobileMessage({ id: 'local_media_1', status: 'SENDING', conversationId: '100_200', messageType: 'IMAGE' }),
          ],
        },
      });

      await useMessageStore.getState().retryMessage('local_media_1');

      expect(us.uploadExistingTask).not.toHaveBeenCalled();
      expect(ms.sendPrivate).not.toHaveBeenCalled();

      const failUpdate = (pr.update as jest.Mock).mock.calls
        .map((c: unknown[]) => c[0] as PendingMessage)
        .find((p) => p.status === 'failed' && p.lastError === 'Upload task not found');
      expect(failUpdate).toBeDefined();

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      const updated = messages!.find((m) => m.id === 'local_media_1');
      expect(updated?.status).toBe('FAILED');
    });

    it('also fails when pending has no mediaUrl at all', async () => {
      const pending = mediaPending({
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: {
            clientMessageId: 'cmid_no_url',
            messageType: 'IMAGE',
          },
          uploadTaskId: 'upload_lost_3',
        }),
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(undefined);

      await useMessageStore.getState().retryMessage('local_media_1');

      const failUpdate = (pr.update as jest.Mock).mock.calls
        .map((c: unknown[]) => c[0] as PendingMessage)
        .find((p) => p.status === 'failed' && p.lastError === 'Upload task not found');
      expect(failUpdate).toBeDefined();
    });
  });

  // ── 16. 本地消息 mediaUrl 从 file:// 同步到 remoteUrl ───────────────

  describe('local message mediaUrl syncs from file:// to remoteUrl (req 4)', () => {
    it('updates local message mediaUrl from file:// to remote after upload', async () => {
      const pending = mediaPending({
        localId: 'local_sync_url',
        conversationId: '100_200',
        payloadJson: JSON.stringify({
          sendType: 'private',
          data: {
            clientMessageId: 'cmid_sync',
            messageType: 'IMAGE',
            mediaUrl: 'file:///local/photo.jpg',
            mediaName: 'photo.jpg',
            mediaSize: 2048,
          },
          uploadTaskId: 'upload_sync_url',
        }),
      });
      const uploadTask = makeUploadTask({
        taskId: 'upload_sync_url',
        localMessageId: 'local_sync_url',
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse('https://cdn.test/final.jpg'));
      ms.sendPrivate.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_sync', messageId: 'srv_sync', clientMessageId: 'cmid_sync', status: 'SENT' },
      } as never);

      useMessageStore.setState({
        messagesBySession: {
          '100_200': [
            {
              ...baseMobileMessage({
                id: 'local_sync_url',
                conversationId: '100_200',
                messageType: 'IMAGE',
                status: 'SENDING',
              }),
              mediaUrl: 'file:///local/photo.jpg',
            },
          ],
        },
      });

      await useMessageStore.getState().retryMessage('local_sync_url');

      const messages = useMessageStore.getState().messagesBySession['100_200'];
      // Either the original message was updated or the server message replaced it
      const hasRemoteUrl = messages!.some(
        (m) => m.mediaUrl === 'https://cdn.test/final.jpg',
      );
      expect(hasRemoteUrl).toBe(true);
    });
  });

  // ── 17. group media 覆盖 ───────────────────────────────────────────

  describe('group media message retry (req 7)', () => {
    function groupMediaPending(overrides: Partial<PendingMessage> = {}): PendingMessage {
      return {
        localId: 'local_group_media',
        conversationId: 'group_g1',
        sendType: 'group',
        payloadJson: JSON.stringify({
          sendType: 'group',
          data: {
            clientMessageId: 'cmid_group_media',
            messageType: 'IMAGE',
            groupId: 'g1',
            mediaUrl: 'file:///local/group-photo.jpg',
            mediaName: 'group-photo.jpg',
            mediaSize: 3072,
          },
          uploadTaskId: 'upload_group_media',
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
      };
    }

    it('uploads then sends for group media message', async () => {
      const pending = groupMediaPending();
      const uploadTask = makeUploadTask({
        taskId: 'upload_group_media',
        localMessageId: 'local_group_media',
        conversationId: 'group_g1',
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse('https://cdn.test/group-photo.jpg'));
      ms.sendGroup.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_group', messageId: 'srv_group', clientMessageId: 'cmid_group_media', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_group_media');

      expect(us.uploadExistingTask).toHaveBeenCalledWith('upload_group_media');
      expect(ms.sendGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: 'https://cdn.test/group-photo.jpg',
          groupId: 'g1',
        }),
      );
    });

    it('preserves mediaUrl in pending when group upload succeeds but send fails', async () => {
      const pending = groupMediaPending();
      const uploadTask = makeUploadTask({
        taskId: 'upload_group_media',
        localMessageId: 'local_group_media',
        conversationId: 'group_g1',
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      us.uploadExistingTask.mockResolvedValueOnce(uploadSuccessResponse('https://cdn.test/group-v2.jpg'));
      ms.sendGroup.mockRejectedValueOnce(new Error('group send failed'));

      await useMessageStore.getState().retryMessage('local_group_media');

      const updateCalls = (pr.update as jest.Mock).mock.calls.map((c: unknown[]) => c[0] as PendingMessage);
      const sendFailUpdate = updateCalls[updateCalls.length - 1];
      const payload = JSON.parse(sendFailUpdate.payloadJson);
      expect(payload.data.mediaUrl).toBe('https://cdn.test/group-v2.jpg');
    });

    it('reuses remoteUrl on second group retry, skips upload', async () => {
      const pending = groupMediaPending({
        payloadJson: JSON.stringify({
          sendType: 'group',
          data: {
            clientMessageId: 'cmid_group_media',
            messageType: 'IMAGE',
            groupId: 'g1',
            mediaUrl: 'https://cdn.test/group-reuse.jpg',
            mediaName: 'group-reuse.jpg',
            mediaSize: 3072,
          },
          uploadTaskId: 'upload_group_media',
        }),
      });
      const uploadTask = makeUploadTask({
        taskId: 'upload_group_media',
        localMessageId: 'local_group_media',
        status: 'uploaded',
        remoteUrl: 'https://cdn.test/group-reuse.jpg',
        progress: 100,
      });
      pr.get.mockReturnValue(pending);
      utr.get.mockReturnValue(uploadTask);
      ms.sendGroup.mockResolvedValueOnce({
        code: 0,
        message: 'ok',
        data: { id: 'srv_group_reuse', messageId: 'srv_group_reuse', clientMessageId: 'cmid_group_media', status: 'SENT' },
      } as never);

      await useMessageStore.getState().retryMessage('local_group_media');

      expect(us.uploadExistingTask).not.toHaveBeenCalled();
      expect(ms.sendGroup).toHaveBeenCalledTimes(1);
    });
  });
});
