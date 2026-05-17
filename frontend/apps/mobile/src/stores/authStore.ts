import { create } from 'zustand';
import type { UserPresence } from '@im/shared-types';
import { registerAuthHooks } from '@/services/api/httpClient';
import { authService } from '@/services/auth/authService';
import { refreshCoordinator } from '@/services/api/httpClient';
import { getFcmToken, clearPendingNotificationRoute } from '@/services/notification/notificationService';
import { pushDeviceService } from '@/services/push/pushDeviceService';
import { userService } from '@/services/user/userService';
import { messageRepository } from '@/services/storage/messageRepository';
import { secureStorage } from '@/services/storage/secureStorage';
import { kvStorage } from '@/services/storage/kvStorage';
import { STORAGE_KEYS } from '@/constants/config';
import { logger } from '@/utils/logger';
import type { LoginRequest, RegisterRequest, User } from '@im/shared-types';
import { useSettingsStore } from './settingsStore';
import { useChatStore } from './chatStore';
import { useWebsocketStore } from './websocketStore';
import { useNotificationStore } from './notificationStore';
import { useUploadStore } from './uploadStore';
import { useSessionStore } from './sessionStore';
import { clearCurrentE2eeAccountState } from '@/e2ee/clearE2eeState';

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

/**
 * restoreSession/login 成功后的副作用链。
 *
 * 顺序保证：
 * 1. chatStore.bootstrap（restoreFromDb → loadFriends/Groups → refreshSessions → retryPending）
 * 2. websocketStore.connect（本地 session 已就绪，WS 收到消息可正确路由）
 * 3. settings + push 并行（无顺序依赖）
 */
const applySessionSideEffects = async () => {
  await useChatStore.getState().bootstrap();
  await useWebsocketStore.getState().connect();
  await Promise.allSettled([
    useSettingsStore.getState().loadSettings(),
    syncPushRegistrationAfterLogin(),
  ]);
};

/**
 * 清理当前会话的全部本地产物。
 *
 * 会清：WebSocket 连接、所有 store 内存运行态、SQLite 持久层（sessions/messages/
 * media_cache/notification_events/pending_messages/upload_tasks）、secureStorage
 * 登录凭据、kvStorage 会话作用域键、通知/上传 store 内存状态。
 *
 * 不会清：FCM token（除非 preserveFcmToken=false）、应用设置（settingsStore）、
 * 数据库 schema 本身。
 */
const clearLocalSessionArtifacts = async (options?: { preserveFcmToken?: boolean }) => {
  const preserveFcmToken = options?.preserveFcmToken !== false;
  const currentUserId = useAuthStore.getState().currentUser?.id;
  useWebsocketStore.getState().disconnect();
  useChatStore.getState().clearRuntime();
  // clearAllCache 已覆盖：mobile_sessions, mobile_messages, mobile_media_cache,
  // mobile_notification_events, mobile_pending_messages, mobile_upload_tasks
  messageRepository.clearAllCache();
  await clearCurrentE2eeAccountState(currentUserId);
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

/**
 * 清理过期的会话快照（restoreSession 发现 token/cookie 无效时调用）。
 *
 * 会清：SQLite 持久层（同 clearAllCache 范围）、secureStorage 登录凭据、
 * kvStorage 会话作用域键、sessionStore 内存态、通知/上传 store 内存状态。
 *
 * 不会清：WebSocket（此时尚未建立）、chatStore 运行态（由 sessionStore.clear
 * 直接处理即可）、FCM token（除非 preserveFcmToken=false）。
 */
const clearStaleRestoreSnapshot = async (options?: { preserveFcmToken?: boolean }) => {
  const preserveFcmToken = options?.preserveFcmToken !== false;
  const currentUserId = useAuthStore.getState().currentUser?.id;
  // clearAllCache 已覆盖所有持久层表（含 pending/upload/notification_events）
  messageRepository.clearAllCache();
  await clearCurrentE2eeAccountState(currentUserId);
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
        throw new Error(response.data.message || response.message || '登录失败');
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
      if (cookieMirror) {
        await secureStorage.restoreCookiesFromMirror();
      }
      let sessionAccessToken = token;
      let response = await authService.parseAccessToken(token || undefined, true);
      if ((!response.data?.valid || !response.data.userId) && (token || cookieMirror)) {
        const refreshed = await tryRestoreFromRefresh().catch(() => false);
        if (refreshed) {
          sessionAccessToken = '';
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
                nickname: response.data.username || parsedUserId,
                status: 'offline' as UserPresence,
              };
        kvStorage.setJson(STORAGE_KEYS.userSnapshot, user);
        await secureStorage.set(STORAGE_KEYS.sessionMeta, buildSessionMeta(user, sessionAccessToken));
        set((state) => ({
          currentUser: user,
          accessToken: sessionAccessToken,
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

  /**
   * 用户主动退出：先通知服务端解绑设备，再清理本地全部会话产物。
   * FCM token 默认保留，避免下次登录需要重新获取。
   */
  async logout() {
    await pushDeviceService.unregisterDevice().catch((error: unknown) => {
      pushDeviceService.logOptionalFailure('unregister device', error);
    });
    await userService.logout().catch(() => undefined);
    await get().clearSession();
  },

  /**
   * 清理会话并重置 auth store 内存态。
   * 调用 clearLocalSessionArtifacts 清理持久层和其它 store，然后将 currentUser/
   * accessToken/permissions 置空。FCM token 默认保留。
   */
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
