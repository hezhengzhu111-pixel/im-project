jest.mock('@/services/user/userService');
jest.mock('@/services/auth/authService');
jest.mock('@/services/api/httpClient', () => ({
  registerAuthHooks: jest.fn(),
  refreshCoordinator: { refresh: jest.fn() },
  http: { post: jest.fn(), get: jest.fn(), put: jest.fn() },
}));
jest.mock('@/services/notification/notificationService', () => ({
  getFcmToken: jest.fn(() => Promise.resolve(null)),
  clearPendingNotificationRoute: jest.fn(),
}));
jest.mock('@/services/push/pushDeviceService', () => ({
  pushDeviceService: { registerDevice: jest.fn(), unregisterDevice: jest.fn(), logOptionalFailure: jest.fn() },
}));
jest.mock('@/services/storage/messageRepository', () => ({
  messageRepository: { clearAllCache: jest.fn(), listSessions: jest.fn(() => []), upsertSession: jest.fn() },
}));
jest.mock('@/services/storage/notificationEventRepository', () => ({
  notificationEventRepository: { clear: jest.fn() },
}));
jest.mock('@/services/storage/pendingMessageRepository', () => ({
  pendingMessageRepository: { clear: jest.fn() },
}));
jest.mock('@/services/storage/uploadTaskRepository', () => ({
  uploadTaskRepository: { clear: jest.fn() },
}));
jest.mock('@/services/storage/secureStorage', () => ({
  secureStorage: {
    clearSession: jest.fn(() => Promise.resolve()),
    set: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve(null)),
    remove: jest.fn(() => Promise.resolve()),
    mirrorCookies: jest.fn(() => Promise.resolve()),
    restoreCookiesFromMirror: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ loadSettings: jest.fn(() => Promise.resolve()) }) },
}));
jest.mock('@/stores/chatStore', () => ({
  useChatStore: { getState: () => ({ bootstrap: jest.fn(() => Promise.resolve()), clearRuntime: jest.fn() }) },
}));
jest.mock('@/stores/websocketStore', () => ({
  useWebsocketStore: { getState: () => ({ connect: jest.fn(() => Promise.resolve()), disconnect: jest.fn() }) },
}));
jest.mock('@/stores/notificationStore', () => ({
  useNotificationStore: { getState: () => ({}), setState: jest.fn() },
}));
jest.mock('@/stores/uploadStore', () => ({ useUploadStore: { setState: jest.fn() } }));
jest.mock('@/stores/sessionStore', () => ({
  useSessionStore: { getState: () => ({ clear: jest.fn() }) },
}));
jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { kvStorage } from '@/services/storage/kvStorage';
import { STORAGE_KEYS } from '@/constants/config';
import { userService } from '@/services/user/userService';
import { useAuthStore } from '../authStore';
import { useUserStore } from '../userStore';
import type { User } from '@im/shared-types';

const mockedUserService = jest.mocked(userService);

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: '1001',
  username: 'testuser',
  nickname: 'Test User',
  avatar: '',
  status: 'online',
  ...overrides,
});

describe('userStore.updateProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kvStorage.clearSessionScope({ preserveFcmToken: true });
  });

  it('syncs userSnapshot to kvStorage after successful profile update', async () => {
    const oldUser = makeUser({ nickname: 'Old Name' });
    const updatedUser = makeUser({ nickname: 'New Name' });

    kvStorage.setJson(STORAGE_KEYS.userSnapshot, oldUser);
    useAuthStore.setState({ currentUser: oldUser });
    useUserStore.setState({ profile: oldUser });

    mockedUserService.updateProfile.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: updatedUser,
    });

    await useUserStore.getState().updateProfile({ nickname: 'New Name' });

    expect(useAuthStore.getState().currentUser).toEqual(updatedUser);
    expect(useUserStore.getState().profile).toEqual(updatedUser);

    const snapshot = kvStorage.getJson<User | null>(STORAGE_KEYS.userSnapshot, null);
    expect(snapshot).toEqual(updatedUser);
    expect(snapshot?.nickname).toBe('New Name');
  });

  it('preserves existing userSnapshot on update failure', async () => {
    const oldUser = makeUser({ nickname: 'Old Name' });
    kvStorage.setJson(STORAGE_KEYS.userSnapshot, oldUser);
    useAuthStore.setState({ currentUser: oldUser });
    useUserStore.setState({ profile: oldUser });

    mockedUserService.updateProfile.mockRejectedValue(new Error('Network error'));

    await expect(useUserStore.getState().updateProfile({ nickname: 'Fail' })).rejects.toThrow('Network error');

    const snapshot = kvStorage.getJson<User | null>(STORAGE_KEYS.userSnapshot, null);
    expect(snapshot?.nickname).toBe('Old Name');
    expect(useAuthStore.getState().currentUser?.nickname).toBe('Old Name');
  });

  it('restores updated snapshot after simulated app restart', async () => {
    const updatedUser = makeUser({ nickname: 'Persisted Name' });

    useAuthStore.setState({ currentUser: makeUser() });
    useUserStore.setState({ profile: makeUser() });

    mockedUserService.updateProfile.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: updatedUser,
    });

    await useUserStore.getState().updateProfile({ nickname: 'Persisted Name' });

    // Simulate app restart: read snapshot directly from kvStorage
    const restored = kvStorage.getJson<User | null>(STORAGE_KEYS.userSnapshot, null);
    expect(restored).not.toBeNull();
    expect(restored?.nickname).toBe('Persisted Name');
    expect(restored?.id).toBe('1001');
  });
});
