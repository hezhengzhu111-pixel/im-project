import { create } from 'zustand';
import { registerAuthHooks } from '@/services/api/httpClient';
import { authService } from '@/services/auth/authService';
import { refreshCoordinator } from '@/services/api/httpClient';
import { getFcmToken, clearPendingNotificationRoute } from '@/services/notification/notificationService';
import { pushDeviceService } from '@/services/push/pushDeviceService';
import { userService } from '@/services/user/userService';
import { messageRepository } from '@/services/storage/messageRepository';
import { notificationEventRepository } from '@/services/storage/notificationEventRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { secureStorage } from '@/services/storage/secureStorage';
import { kvStorage } from '@/services/storage/kvStorage';
import { STORAGE_KEYS } from '@/constants/config';
import { logger } from '@/utils/logger';
import type { LoginRequest, RegisterRequest, User } from '@/types/models';
import { useSettingsStore } from './settingsStore';
import { useChatStore } from './chatStore';
import { useWebsocketStore } from './websocketStore';
import { useNotificationStore } from './notificationStore';
import { useUploadStore } from './uploadStore';
import { useSessionStore } from './sessionStore';

interface AuthState {
  currentUser: User | null;
  accessToken: string;
  permissions: string[];
  loading: boolean;
  authReady: boolean;
  sessionGeneration: number;
  login: (data: LoginRequest) => Promise<boolean>;
  register: (data: RegisterRequest) => Promise<boolean>;
  restoreSession: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearSession: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const buildSessionMeta = (user: User | null, accessToken: string) =>
  JSON.stringify({
    userId: user?.id || '',
    username: user?.username || '',
    hasAccessToken: Boolean(accessToken),
    savedAt: Date.now(),
  });

const syncPushRegistrationAfterLogin = async () => {
  const token = await getFcmToken();
  useNotificationStore.setState({ fcmToken: token || kvStorage.getString(STORAGE_KEYS.fcmToken) });
  if (!token) {
    return;
  }
  try {
    await pushDeviceService.registerDevice(token);
    useNotificationStore.setState({ tokenBound: true });
  } catch (error) {
    pushDeviceService.logOptionalFailure('register device', error);
    useNotificationStore.setState({ tokenBound: false });
  }
};

const applySessionSideEffects = async () => {
  await Promise.allSettled([
    useSettingsStore.getState().loadSettings(),
    useChatStore.getState().bootstrap(),
    useWebsocketStore.getState().connect(),
    syncPushRegistrationAfterLogin(),
  ]);
};

const clearLocalSessionArtifacts = async (options?: { preserveFcmToken?: boolean }) => {
  const preserveFcmToken = options?.preserveFcmToken !== false;
  useWebsocketStore.getState().disconnect();
  useChatStore.getState().clearRuntime();
  messageRepository.clearAllCache();
  uploadTaskRepository.clear();
  notificationEventRepository.clear();
  clearPendingNotificationRoute();
  await secureStorage.clearSession();
  kvStorage.clearSessionScope({ preserveFcmToken });
  useNotificationStore.setState((state) => ({
    ...state,
    tokenBound: false,
    events: [],
    ...(preserveFcmToken ? {} : { fcmToken: '' }),
  }));
  useUploadStore.setState({ tasks: [] });
};

const clearStaleRestoreSnapshot = async (options?: { preserveFcmToken?: boolean }) => {
  const preserveFcmToken = options?.preserveFcmToken !== false;
  pendingMessageRepository.clear();
  messageRepository.clearAllCache();
  uploadTaskRepository.clear();
  notificationEventRepository.clear();
  clearPendingNotificationRoute();
  useSessionStore.getState().clear();
  useNotificationStore.setState((state) => ({
    ...state,
    tokenBound: false,
    events: [],
    ...(preserveFcmToken ? {} : { fcmToken: '' }),
  }));
  useUploadStore.setState({ tasks: [] });
  await secureStorage.clearSession();
  kvStorage.clearSessionScope({ preserveFcmToken });
};

const tryRestoreFromRefresh = async (): Promise<boolean> => {
  const refreshed = await refreshCoordinator.refresh();
  if (refreshed.status !== 'success') {
    return false;
  }
  await secureStorage.remove(STORAGE_KEYS.accessToken);
  const parsed = await authService.parseAccessToken(undefined, true);
  return Boolean(parsed.data?.valid && parsed.data.userId);
};

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: kvStorage.getJson<User | null>(STORAGE_KEYS.userSnapshot, null),
  accessToken: '',
  permissions: [],
  loading: false,
  authReady: false,
  sessionGeneration: 0,

  async login(data) {
    set({ loading: true });
    try {
      const response = await userService.login({
        username: data.username.trim(),
        password: data.password,
      });
      if (!response.data.success || !response.data.user) {
        throw new Error(response.data.message || response.message || 'Login failed');
      }
      const token = response.data.token || response.data.accessToken || '';
      if (token) {
        await secureStorage.set(STORAGE_KEYS.accessToken, token);
      }
      await secureStorage.mirrorCookies();
      kvStorage.setJson(STORAGE_KEYS.userSnapshot, response.data.user);
      await secureStorage.set(STORAGE_KEYS.sessionMeta, buildSessionMeta(response.data.user || null, token));
      set((state) => ({
        currentUser: response.data.user || null,
        accessToken: token,
        permissions: response.data.permissions || response.data.user?.permissions || [],
        authReady: true,
        sessionGeneration: state.sessionGeneration + 1,
      }));
      await applySessionSideEffects();
      return true;
    } finally {
      set({ loading: false });
    }
  },

  async register(data) {
    set({ loading: true });
    try {
      const response = await userService.register(data);
      return response.code === 200;
    } finally {
      set({ loading: false });
    }
  },

  async restoreSession() {
    const token = await secureStorage.get(STORAGE_KEYS.accessToken);
    const cookieMirror = await secureStorage.get(STORAGE_KEYS.cookieMirror);
    const snapshot = kvStorage.getJson<User | null>(STORAGE_KEYS.userSnapshot, null);
    if (!token && !cookieMirror) {
      if (snapshot) {
        await clearStaleRestoreSnapshot({ preserveFcmToken: true });
        set((state) => ({
          currentUser: null,
          accessToken: '',
          permissions: [],
          authReady: true,
          sessionGeneration: state.sessionGeneration + 1,
        }));
      } else {
        set({ authReady: true, currentUser: null, accessToken: '', permissions: [] });
      }
      return false;
    }

    try {
      let response = await authService.parseAccessToken(token || undefined, true);
      if ((!response.data?.valid || !response.data.userId) && (token || cookieMirror)) {
        const refreshed = await tryRestoreFromRefresh().catch(() => false);
        if (refreshed) {
          response = await authService.parseAccessToken(undefined, true);
        }
      }
      if (response.data?.valid && response.data.userId) {
        const parsedUserId = String(response.data.userId);
        const user =
          snapshot && String(snapshot.id) === parsedUserId
            ? snapshot
            : {
                id: parsedUserId,
                username: response.data.username || parsedUserId,
              };
        kvStorage.setJson(STORAGE_KEYS.userSnapshot, user);
        await secureStorage.set(STORAGE_KEYS.sessionMeta, buildSessionMeta(user, token));
        set((state) => ({
          currentUser: user,
          accessToken: token,
          permissions: response.data.permissions || [],
          authReady: true,
          sessionGeneration: state.sessionGeneration + 1,
        }));
        await applySessionSideEffects().catch((error: unknown) => {
          logger.warn('auth', 'restore session side effects failed', error);
        });
        return true;
      }
      await get().clearSession();
      return false;
    } catch {
      await get().clearSession();
      return false;
    }
  },

  async logout() {
    await pushDeviceService.unregisterDevice().catch((error: unknown) => {
      pushDeviceService.logOptionalFailure('unregister device', error);
    });
    await userService.logout().catch(() => undefined);
    await get().clearSession();
  },

  async clearSession() {
    await clearLocalSessionArtifacts({ preserveFcmToken: true });
    set((state) => ({
      currentUser: null,
      accessToken: '',
      permissions: [],
      authReady: true,
      sessionGeneration: state.sessionGeneration + 1,
    }));
  },

  hasPermission(permission) {
    if (!permission) {
      return true;
    }
    const permissions = get().permissions;
    return permissions.includes('*') || permissions.includes('admin') || permissions.includes(permission);
  },
}));

registerAuthHooks({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getSessionGeneration: () => useAuthStore.getState().sessionGeneration,
  onSessionRefreshed: () => {
    void secureStorage.remove(STORAGE_KEYS.accessToken);
    useAuthStore.setState({ accessToken: '' });
  },
  onAuthInvalid: (generation) => {
    const state = useAuthStore.getState();
    if (state.sessionGeneration === generation) {
      void state.clearSession();
    }
  },
});
