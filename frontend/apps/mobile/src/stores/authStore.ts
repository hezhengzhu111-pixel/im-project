import { create } from 'zustand';
import { registerAuthHooks } from '@/services/api/httpClient';
import { authService } from '@/services/auth/authService';
import { userService } from '@/services/user/userService';
import { secureStorage } from '@/services/storage/secureStorage';
import { kvStorage } from '@/services/storage/kvStorage';
import { STORAGE_KEYS } from '@/constants/config';
import { logger } from '@/utils/logger';
import type { LoginRequest, RegisterRequest, User } from '@/types/models';

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

const applySessionSideEffects = async () => {
  const [{ useSettingsStore }, { useChatStore }, { useWebsocketStore }, { getFcmToken }] = await Promise.all([
    import('./settingsStore'),
    import('./chatStore'),
    import('./websocketStore'),
    import('@/services/notification/notificationService'),
  ]);
  await Promise.allSettled([
    useSettingsStore.getState().loadSettings(),
    useChatStore.getState().bootstrap(),
    useWebsocketStore.getState().connect(),
    getFcmToken(),
  ]);
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
    const snapshot = kvStorage.getJson<User | null>(STORAGE_KEYS.userSnapshot, null);
    if (snapshot) {
      set({ currentUser: snapshot, accessToken: token });
    }
    try {
      const response = await authService.parseAccessToken(token || undefined, true);
      if (response.data?.valid && response.data.userId) {
        const user = snapshot || {
          id: String(response.data.userId),
          username: response.data.username || String(response.data.userId),
        };
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
      set({ authReady: true });
      return false;
    } catch {
      set({ authReady: true });
      return false;
    }
  },

  async logout() {
    const [{ useWebsocketStore }, { useChatStore }, { useNotificationStore }] = await Promise.all([
      import('./websocketStore'),
      import('./chatStore'),
      import('./notificationStore'),
    ]);
    await userService.logout().catch(() => undefined);
    useWebsocketStore.getState().disconnect();
    useChatStore.getState().clearRuntime();
    useNotificationStore.getState().clearBinding();
    await get().clearSession();
  },

  async clearSession() {
    await secureStorage.clearSession();
    kvStorage.remove(STORAGE_KEYS.userSnapshot);
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
  onAuthInvalid: (generation) => {
    const state = useAuthStore.getState();
    if (state.sessionGeneration === generation) {
      void state.clearSession();
    }
  },
});
