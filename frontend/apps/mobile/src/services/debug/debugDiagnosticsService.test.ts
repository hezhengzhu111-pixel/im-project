import { debugDiagnosticsService, shouldEnableDebugDiagnostics } from './debugDiagnosticsService';
import { debugTelemetry } from './debugTelemetry';
import { kvStorage } from '@/services/storage/kvStorage';
import { messageDatabase } from '@/services/storage/messageDatabase';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { notificationEventRepository } from '@/services/storage/notificationEventRepository';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/utils/logger';
import type { PendingMessage, UploadTask } from '@/types/models';
import type { ChatSession } from '@im/shared-types';

describe('debugDiagnosticsService', () => {
  beforeEach(() => {
    logger.clear();
    debugTelemetry.clear();
    kvStorage.clearVolatileCache();
    messageRepository.clearAllCache();
    pendingMessageRepository.clear();
    uploadTaskRepository.clear();
    notificationEventRepository.clear();
    useAuthStore.setState({
      currentUser: { id: 'user-1', username: 'tester' },
      accessToken: 'secret-token',
      permissions: [],
      loading: false,
      authReady: true,
      sessionGeneration: 1,
    });
  });

  test('snapshot does not include token or cookie values', () => {
    kvStorage.setString('im.mobile.fcm-token', 'fcm-secret-token');
    debugTelemetry.recordApiError({
      message: 'authorization=Bearer secret-token cookie=session=abc',
      status: 500,
      url: 'https://example.test/api?token=secret-token',
    });
    logger.error('http', 'request failed authorization=Bearer secret-token cookie=session=abc');

    const snapshot = debugDiagnosticsService.getSnapshot();
    const snapshotText = JSON.stringify(snapshot);

    expect(snapshot.currentUserId).toBe('user-1');
    expect(snapshot.fcmTokenAvailable).toBe(true);
    expect(snapshotText).not.toContain('secret-token');
    expect(snapshotText).not.toContain('session=abc');
    expect(snapshotText).not.toContain('cookie');
  });

  test('debug gate is enabled only for dev non-release runtime', () => {
    expect(shouldEnableDebugDiagnostics({ isDev: true, isReleaseRuntime: false })).toBe(true);
    expect(shouldEnableDebugDiagnostics({ isDev: false, isReleaseRuntime: false })).toBe(false);
    expect(shouldEnableDebugDiagnostics({ isDev: true, isReleaseRuntime: true })).toBe(false);
  });

  test('snapshot includes storage health fields', () => {
    const snapshot = debugDiagnosticsService.getSnapshot();

    expect(snapshot.storageMode).toBe(messageDatabase.isMemoryFallback() ? 'memory' : 'sqlite');
    expect(snapshot.persistenceAvailable).toBe(!messageDatabase.isMemoryFallback());
    expect(typeof snapshot.sessionCount).toBe('number');
    expect(typeof snapshot.messageCount).toBe('number');
    expect(typeof snapshot.pendingCount).toBe('number');
    expect(typeof snapshot.uploadTaskCount).toBe('number');
    expect(typeof snapshot.notificationEventCount).toBe('number');
  });

  test('snapshot counts reflect inserted data', () => {
    const base = debugDiagnosticsService.getSnapshot();
    expect(base.sessionCount).toBe(0);
    expect(base.messageCount).toBe(0);
    expect(base.pendingCount).toBe(0);
    expect(base.uploadTaskCount).toBe(0);
    expect(base.notificationEventCount).toBe(0);

    const testSession: ChatSession = {
      id: 'diag_test_session',
      type: 'private',
      targetId: '2',
      targetName: 'Bob',
      unreadCount: 0,
    };
    messageRepository.upsertSession(testSession);
    messageRepository.upsertMessages('diag_test_session', [
      {
        id: 'diag_msg_1',
        conversationId: 'diag_test_session',
        senderId: '1',
        receiverId: '2',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: new Date().toISOString(),
        status: 'SENT',
      },
    ]);

    const pending: PendingMessage = {
      localId: 'diag_pending_1',
      conversationId: 'diag_test_session',
      sendType: 'private',
      payloadJson: '{}',
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    pendingMessageRepository.enqueue(pending);

    const uploadTask: UploadTask = {
      taskId: 'diag_upload_1',
      fileUri: 'file:///a.png',
      fileName: 'a.png',
      uploadType: 'IMAGE',
      status: 'pending',
      progress: 0,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    uploadTaskRepository.upsert(uploadTask);

    notificationEventRepository.record('test_event', 'TestScreen');

    const updated = debugDiagnosticsService.getSnapshot();
    expect(updated.sessionCount).toBe(1);
    expect(updated.messageCount).toBe(1);
    expect(updated.pendingCount).toBe(1);
    expect(updated.uploadTaskCount).toBe(1);
    expect(updated.notificationEventCount).toBe(1);
  });

  test('snapshot currentUserId comes from auth store', () => {
    expect(debugDiagnosticsService.getSnapshot().currentUserId).toBe('user-1');

    useAuthStore.setState({ currentUser: null });
    expect(debugDiagnosticsService.getSnapshot().currentUserId).toBe('');
  });

  test('snapshot sanitizes sensitive fields in error records and logs', () => {
    debugTelemetry.recordApiError({
      message: 'authorization=Bearer my-secret-api-key password=hunter2',
      status: 401,
      url: 'https://api.test/auth?api_key=sk-12345&other=ok',
    });
    logger.error('auth', 'login failed password=plaintext secret=my-secret');

    const snapshot = debugDiagnosticsService.getSnapshot();
    const text = JSON.stringify(snapshot);

    expect(text).not.toContain('my-secret-api-key');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('sk-12345');
    expect(text).not.toContain('plaintext');
    expect(text).not.toContain('my-secret');
    expect(text).toContain('[REDACTED]');
  });
});
