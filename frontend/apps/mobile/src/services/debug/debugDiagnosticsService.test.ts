import { debugDiagnosticsService, shouldEnableDebugDiagnostics } from './debugDiagnosticsService';
import { debugTelemetry } from './debugTelemetry';
import { kvStorage } from '@/services/storage/kvStorage';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/utils/logger';

describe('debugDiagnosticsService', () => {
  beforeEach(() => {
    logger.clear();
    debugTelemetry.clear();
    kvStorage.clearVolatileCache();
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
});
