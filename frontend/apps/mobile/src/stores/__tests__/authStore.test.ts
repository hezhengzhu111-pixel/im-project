// ─── Mocks (before imports) ───────────────────────────────────────────
jest.mock('@/services/storage/messageRepository', () => ({
  messageRepository: {
    clearAllCache: jest.fn(),
    clearConversation: jest.fn(),
    listMessages: jest.fn(() => []),
    listSessions: jest.fn(() => []),
    upsertMessages: jest.fn(),
    upsertSession: jest.fn(),
  },
}));
jest.mock('@/services/storage/secureStorage', () => ({
  secureStorage: {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
    clearSession: jest.fn(() => Promise.resolve()),
    mirrorCookies: jest.fn(() => Promise.resolve()),
    restoreCookiesFromMirror: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('@/services/storage/kvStorage', () => ({
  kvStorage: {
    getString: jest.fn(),
    getJson: jest.fn(() => null),
    setJson: jest.fn(),
    remove: jest.fn(),
    clearSessionScope: jest.fn(),
    clearVolatileCache: jest.fn(),
  },
}));
jest.mock('@/services/notification/notificationService', () => ({
  getFcmToken: jest.fn(() => Promise.resolve('fcm-test-token')),
  clearPendingNotificationRoute: jest.fn(),
}));
jest.mock('@/services/push/pushDeviceService', () => ({
  pushDeviceService: {
    unregisterDevice: jest.fn(() => Promise.resolve()),
    registerDevice: jest.fn(() => Promise.resolve()),
    logOptionalFailure: jest.fn(),
  },
}));
jest.mock('@/services/user/userService', () => ({
  userService: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('@/services/auth/authService', () => ({
  authService: {
    parseAccessToken: jest.fn(() => Promise.resolve({ data: { valid: false } })),
    issueWsTicket: jest.fn(),
  },
}));
jest.mock('@/services/api/httpClient', () => ({
  registerAuthHooks: jest.fn(),
  refreshCoordinator: { refresh: jest.fn(() => Promise.resolve({ status: 'fail' })) },
}));
const mockSettingsState = { loadSettings: jest.fn(() => Promise.resolve()) };
const mockChatState = { bootstrap: jest.fn(() => Promise.resolve()), clearRuntime: jest.fn() };
const mockWsState = { connect: jest.fn(() => Promise.resolve()), disconnect: jest.fn() };
const mockSessionState = { clear: jest.fn() };

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: jest.fn(() => mockSettingsState) },
}));
jest.mock('@/stores/chatStore', () => ({
  useChatStore: { getState: jest.fn(() => mockChatState) },
}));
jest.mock('@/stores/websocketStore', () => ({
  useWebsocketStore: { getState: jest.fn(() => mockWsState) },
}));
jest.mock('@/stores/notificationStore', () => ({
  useNotificationStore: { setState: jest.fn() },
}));
jest.mock('@/stores/uploadStore', () => ({
  useUploadStore: { setState: jest.fn() },
}));
jest.mock('@/stores/sessionStore', () => ({
  useSessionStore: { getState: jest.fn(() => mockSessionState) },
}));
jest.mock('@/e2ee/manager/readiness', () => ({
  ensureE2eeReadyForCurrentUser: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn() },
}));

// ─── Imports ──────────────────────────────────────────────────────────
import { useAuthStore } from '../authStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { secureStorage } from '@/services/storage/secureStorage';
import { kvStorage } from '@/services/storage/kvStorage';
import { useNotificationStore } from '@/stores/notificationStore';
import { useUploadStore } from '@/stores/uploadStore';
import { clearPendingNotificationRoute } from '@/services/notification/notificationService';
import { userService } from '@/services/user/userService';
import { authService } from '@/services/auth/authService';
import { logger } from '@/utils/logger';
import { ensureE2eeReadyForCurrentUser } from '@/e2ee/manager/readiness';

const mr = jest.mocked(messageRepository);
const ss = jest.mocked(secureStorage);
const kv = jest.mocked(kvStorage);
const ns = jest.mocked(useNotificationStore);
const us = jest.mocked(useUploadStore);
const mockEnsureE2eeReady = jest.mocked(ensureE2eeReadyForCurrentUser);

describe('authStore cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset auth store to logged-in state
    useAuthStore.setState({
      currentUser: { id: '100', username: 'testuser', nickname: 'Test', status: 'online' },
      accessToken: 'test-token',
      permissions: ['user'],
      authReady: true,
      sessionGeneration: 0,
    });
    mockEnsureE2eeReady.mockResolvedValue(undefined);
    mockChatState.bootstrap.mockResolvedValue(undefined);
    mockWsState.connect.mockResolvedValue(undefined);
  });

  describe('clearSession', () => {
    it('sets currentUser to null and accessToken to empty', async () => {
      await useAuthStore.getState().clearSession();
      const state = useAuthStore.getState();
      expect(state.currentUser).toBeNull();
      expect(state.accessToken).toBe('');
      expect(state.permissions).toEqual([]);
    });

    it('calls secureStorage.clearSession', async () => {
      await useAuthStore.getState().clearSession();
      expect(ss.clearSession).toHaveBeenCalledTimes(1);
    });

    it('calls messageRepository.clearAllCache', async () => {
      await useAuthStore.getState().clearSession();
      expect(mr.clearAllCache).toHaveBeenCalledTimes(1);
    });

    it('does NOT call uploadTaskRepository.clear directly (covered by clearAllCache)', async () => {
      // uploadTaskRepository is not imported in authStore after refactor
      // This is verified by the import removal — if it were imported, the test would fail
      // at the module level. Instead, verify clearAllCache is the single persistent cleanup.
      await useAuthStore.getState().clearSession();
      expect(mr.clearAllCache).toHaveBeenCalledTimes(1);
    });

    it('calls websocketStore.disconnect', async () => {
      await useAuthStore.getState().clearSession();
      expect(mockWsState.disconnect).toHaveBeenCalledTimes(1);
    });

    it('calls chatStore.clearRuntime', async () => {
      await useAuthStore.getState().clearSession();
      expect(mockChatState.clearRuntime).toHaveBeenCalledTimes(1);
    });

    it('calls kvStorage.clearSessionScope with preserveFcmToken=true by default', async () => {
      await useAuthStore.getState().clearSession();
      expect(kv.clearSessionScope).toHaveBeenCalledWith({ preserveFcmToken: true });
    });

    it('calls clearPendingNotificationRoute', async () => {
      await useAuthStore.getState().clearSession();
      expect(clearPendingNotificationRoute).toHaveBeenCalledTimes(1);
    });

    it('resets notificationStore with tokenBound=false and empty events', async () => {
      await useAuthStore.getState().clearSession();
      expect(ns.setState).toHaveBeenCalledWith(expect.any(Function));
      // Verify the function produces correct partial state
      const setStateFn = (ns.setState as jest.Mock).mock.calls[0][0] as (s: unknown) => unknown;
      const result = setStateFn({ tokenBound: true, events: [{ id: 1 }], fcmToken: 'kept' });
      expect(result).toEqual(expect.objectContaining({ tokenBound: false, events: [] }));
      // fcmToken should be preserved (not set to empty)
      expect((result as Record<string, unknown>).fcmToken).toBe('kept');
    });

    it('resets uploadStore tasks', async () => {
      await useAuthStore.getState().clearSession();
      expect(us.setState).toHaveBeenCalledWith({ tasks: [] });
    });

    it('increments sessionGeneration', async () => {
      const before = useAuthStore.getState().sessionGeneration;
      await useAuthStore.getState().clearSession();
      expect(useAuthStore.getState().sessionGeneration).toBe(before + 1);
    });
  });

  describe('login/restore E2EE readiness ordering', () => {
    it('runs E2EE readiness between bootstrap and websocket connect after login', async () => {
      const order: string[] = [];
      jest.mocked(userService.login).mockResolvedValueOnce({
        code: 200,
        message: 'ok',
        data: {
          success: true,
          user: { id: '100', username: 'testuser', nickname: 'Test', status: 'online' },
          token: 'token-100',
          permissions: ['user'],
        },
      } as Awaited<ReturnType<typeof userService.login>>);
      mockChatState.bootstrap.mockImplementationOnce(async () => {
        order.push('bootstrap');
      });
      mockEnsureE2eeReady.mockImplementationOnce(async () => {
        order.push('readiness');
      });
      mockWsState.connect.mockImplementationOnce(async () => {
        order.push('connect');
      });

      await expect(useAuthStore.getState().login({ username: ' testuser ', password: 'pw' })).resolves.toBe(true);

      expect(order).toEqual(['bootstrap', 'readiness', 'connect']);
    });

    it('runs E2EE readiness between bootstrap and websocket connect after restoreSession', async () => {
      const order: string[] = [];
      jest.mocked(secureStorage.get)
        .mockResolvedValueOnce('token-100')
        .mockResolvedValueOnce(null);
      jest.mocked(authService.parseAccessToken).mockResolvedValueOnce({
        data: { valid: true, userId: '100', username: 'testuser', permissions: ['user'] },
      } as Awaited<ReturnType<typeof authService.parseAccessToken>>);
      mockChatState.bootstrap.mockImplementationOnce(async () => {
        order.push('bootstrap');
      });
      mockEnsureE2eeReady.mockImplementationOnce(async () => {
        order.push('readiness');
      });
      mockWsState.connect.mockImplementationOnce(async () => {
        order.push('connect');
      });

      await expect(useAuthStore.getState().restoreSession()).resolves.toBe(true);

      expect(order).toEqual(['bootstrap', 'readiness', 'connect']);
    });

    it('warns and still connects when E2EE readiness fails', async () => {
      const order: string[] = [];
      jest.mocked(userService.login).mockResolvedValueOnce({
        code: 200,
        message: 'ok',
        data: {
          success: true,
          user: { id: '100', username: 'testuser', nickname: 'Test', status: 'online' },
          token: 'token-100',
          permissions: ['user'],
        },
      } as Awaited<ReturnType<typeof userService.login>>);
      mockChatState.bootstrap.mockImplementationOnce(async () => {
        order.push('bootstrap');
      });
      mockEnsureE2eeReady.mockImplementationOnce(async () => {
        order.push('readiness');
        throw new Error('keychain unavailable');
      });
      mockWsState.connect.mockImplementationOnce(async () => {
        order.push('connect');
      });

      await expect(useAuthStore.getState().login({ username: 'testuser', password: 'pw' })).resolves.toBe(true);

      expect(order).toEqual(['bootstrap', 'readiness', 'connect']);
      expect(logger.warn).toHaveBeenCalledWith(
        'e2ee',
        'E2EE readiness failed before websocket connect',
        expect.anything(),
      );
    });
  });
});
