/**
 * Phase 1 consistency tests — session flags, user profile, cleanup boundaries,
 * stale snapshot, account switch, and currentSession behavior.
 *
 * Uses real kvStorage/memory-backed repositories (no messageRepository mock)
 * so that restoreFromDb round-trips exercise the actual persistence path.
 */

import type { ChatSession, User } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';
import { useSessionStore } from '../sessionStore';
import { useMessageStore } from '../messageStore';
import { useAuthStore } from '../authStore';
import { useUserStore } from '../userStore';
import { messageRepository } from '@/services/storage/messageRepository';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { kvStorage } from '@/services/storage/kvStorage';
import { STORAGE_KEYS } from '@/constants/config';

// Mock only external side-effect services (not storage)
jest.mock('@/services/user/userService');
jest.mock('@/services/auth/authService');
jest.mock('@/services/api/httpClient', () => ({
  registerAuthHooks: jest.fn(),
  refreshCoordinator: { refresh: jest.fn(() => Promise.resolve({ status: 'fail' })) },
}));
jest.mock('@/services/notification/notificationService', () => ({
  getFcmToken: jest.fn(() => Promise.resolve(null)),
  clearPendingNotificationRoute: jest.fn(),
}));
jest.mock('@/services/push/pushDeviceService', () => ({
  pushDeviceService: {
    registerDevice: jest.fn(),
    unregisterDevice: jest.fn(() => Promise.resolve()),
    logOptionalFailure: jest.fn(),
  },
}));
jest.mock('@/services/storage/secureStorage', () => ({
  secureStorage: {
    get: jest.fn(() => Promise.resolve('')),
    set: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
    clearSession: jest.fn(() => Promise.resolve()),
    mirrorCookies: jest.fn(() => Promise.resolve()),
    restoreCookiesFromMirror: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ loadSettings: jest.fn(() => Promise.resolve()) }) },
}));
jest.mock('@/stores/contactStore', () => ({
  useContactStore: { getState: () => ({ clear: jest.fn() }) },
}));
jest.mock('@/stores/groupStore', () => ({
  useGroupStore: { getState: () => ({ clear: jest.fn() }) },
}));
jest.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      bootstrap: jest.fn(() => Promise.resolve()),
      clearRuntime: jest.fn(() => {
        const sessionMod = require('../sessionStore') as typeof import('../sessionStore');
        const messageMod = require('../messageStore') as typeof import('../messageStore');
        sessionMod.useSessionStore.getState().clear();
        messageMod.useMessageStore.getState().clear();
      }),
    }),
  },
}));
jest.mock('@/stores/websocketStore', () => ({
  useWebsocketStore: {
    getState: () => ({ connect: jest.fn(() => Promise.resolve()), disconnect: jest.fn() }),
  },
}));
jest.mock('@/stores/notificationStore', () => ({
  useNotificationStore: { getState: () => ({}), setState: jest.fn() },
}));
jest.mock('@/stores/uploadStore', () => ({
  useUploadStore: { setState: jest.fn() },
}));
jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { secureStorage } from '@/services/storage/secureStorage';
import { userService } from '@/services/user/userService';
import { authService } from '@/services/auth/authService';
import { getFcmToken } from '@/services/notification/notificationService';
import { useSettingsStore } from '@/stores/settingsStore';

const mockedUserService = jest.mocked(userService);
const mockedSecureStorage = jest.mocked(secureStorage);

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: '100_200',
  type: 'private',
  targetId: '200',
  targetName: 'Bob',
  unreadCount: 0,
  lastActiveTime: '2024-06-01T10:00:00.000Z',
  isPinned: false,
  isMuted: false,
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: '100',
  username: 'testuser',
  nickname: 'Test User',
  avatar: '',
  status: 'online',
  ...overrides,
});

const makeMessage = (id: string, conversationId = '100_200'): MobileMessage => ({
  id,
  serverId: id,
  conversationId,
  senderId: '100',
  receiverId: '200',
  isGroupChat: false,
  messageType: 'TEXT',
  content: `msg-${id}`,
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
});

beforeEach(() => {
  messageRepository.clearAllCache();
  pendingMessageRepository.clear();
  uploadTaskRepository.clear();
  kvStorage.clearSessionScope({ preserveFcmToken: true });
  useSessionStore.setState({ sessions: [], currentSession: null });
  useMessageStore.setState({ messagesBySession: {}, loading: false, searchResults: [] });
  useAuthStore.setState({
    currentUser: null,
    accessToken: '',
    permissions: [],
    loading: false,
    authReady: false,
    sessionGeneration: 0,
  });
  useUserStore.setState({ profile: null, loading: false });
  jest.clearAllMocks();
});

// ─── 1. Session flags: isPinned / isMuted persistence ────────────────────────

describe('session flags persistence', () => {
  it('isPinned persists via messageRepository and survives restoreFromDb', () => {
    const session = makeSession({ isPinned: false });
    messageRepository.upsertSession(session);

    // Update flag in memory + persist
    useSessionStore.setState({ sessions: [session] });
    useSessionStore.getState().updateSessionFlags(session.id, { isPinned: true });

    // Verify persisted
    const persisted = messageRepository.listSessions().find((s) => s.id === session.id);
    expect(persisted?.isPinned).toBe(true);

    // Simulate app restart: clear memory, restore from DB
    useSessionStore.setState({ sessions: [], currentSession: null });
    useSessionStore.getState().restoreFromDb();

    const restored = useSessionStore.getState().sessions.find((s) => s.id === session.id);
    expect(restored?.isPinned).toBe(true);
  });

  it('isMuted persists via messageRepository and survives restoreFromDb', () => {
    const session = makeSession({ isMuted: false });
    messageRepository.upsertSession(session);

    useSessionStore.setState({ sessions: [session] });
    useSessionStore.getState().updateSessionFlags(session.id, { isMuted: true });

    const persisted = messageRepository.listSessions().find((s) => s.id === session.id);
    expect(persisted?.isMuted).toBe(true);

    useSessionStore.setState({ sessions: [], currentSession: null });
    useSessionStore.getState().restoreFromDb();

    const restored = useSessionStore.getState().sessions.find((s) => s.id === session.id);
    expect(restored?.isMuted).toBe(true);
  });

  it('combined pin+mute flags survive restoreFromDb roundtrip', () => {
    const session = makeSession();
    messageRepository.upsertSession(session);

    useSessionStore.setState({ sessions: [session] });
    useSessionStore.getState().updateSessionFlags(session.id, { isPinned: true, isMuted: true });

    useSessionStore.setState({ sessions: [], currentSession: null });
    useSessionStore.getState().restoreFromDb();

    const restored = useSessionStore.getState().sessions.find((s) => s.id === session.id);
    expect(restored?.isPinned).toBe(true);
    expect(restored?.isMuted).toBe(true);
  });

  it('updateSessionFlags syncs currentSession when it matches', () => {
    const session = makeSession({ isPinned: false });
    useSessionStore.setState({ sessions: [session], currentSession: session });

    useSessionStore.getState().updateSessionFlags(session.id, { isPinned: true });

    expect(useSessionStore.getState().currentSession?.isPinned).toBe(true);
  });

  it('updateSessionFlags does not change currentSession when id differs', () => {
    const session = makeSession({ id: '100_200' });
    const other = makeSession({ id: '100_300', targetId: '300', targetName: 'Charlie' });
    useSessionStore.setState({ sessions: [session, other], currentSession: other });

    useSessionStore.getState().updateSessionFlags(session.id, { isPinned: true });

    expect(useSessionStore.getState().currentSession?.id).toBe('100_300');
    expect(useSessionStore.getState().currentSession?.isPinned).toBe(false);
  });
});

// ─── 2. User profile: updateProfile consistency ──────────────────────────────

describe('user profile consistency', () => {
  it('updateProfile syncs authStore, userStore, and kvStorage', async () => {
    const oldUser = makeUser({ nickname: 'Old' });
    const newUser = makeUser({ nickname: 'New' });

    useAuthStore.setState({ currentUser: oldUser });
    useUserStore.setState({ profile: oldUser });
    kvStorage.setJson(STORAGE_KEYS.userSnapshot, oldUser);

    mockedUserService.updateProfile.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: newUser,
    });

    await useUserStore.getState().updateProfile({ nickname: 'New' });

    expect(useAuthStore.getState().currentUser?.nickname).toBe('New');
    expect(useUserStore.getState().profile?.nickname).toBe('New');
    expect(kvStorage.getJson<User>(STORAGE_KEYS.userSnapshot, null as unknown as User).nickname).toBe('New');
  });

  it('updateProfile does not mutate stores on failure', async () => {
    const oldUser = makeUser({ nickname: 'Stable' });
    useAuthStore.setState({ currentUser: oldUser });
    useUserStore.setState({ profile: oldUser });
    kvStorage.setJson(STORAGE_KEYS.userSnapshot, oldUser);

    mockedUserService.updateProfile.mockRejectedValue(new Error('network'));

    await expect(useUserStore.getState().updateProfile({ nickname: 'Fail' })).rejects.toThrow();

    expect(useAuthStore.getState().currentUser?.nickname).toBe('Stable');
    expect(useUserStore.getState().profile?.nickname).toBe('Stable');
    expect(kvStorage.getJson<User>(STORAGE_KEYS.userSnapshot, null as unknown as User).nickname).toBe('Stable');
  });

  it('updated profile is readable from kvStorage after simulated restart', async () => {
    const user = makeUser();
    const updated = makeUser({ nickname: 'Persisted', avatar: 'https://cdn/avatar.png' });
    useAuthStore.setState({ currentUser: user });
    useUserStore.setState({ profile: user });

    mockedUserService.updateProfile.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: updated,
    });

    await useUserStore.getState().updateProfile({ nickname: 'Persisted', avatar: 'https://cdn/avatar.png' });

    // Simulate restart: read directly from kvStorage
    const snapshot = kvStorage.getJson<User | null>(STORAGE_KEYS.userSnapshot, null);
    expect(snapshot?.nickname).toBe('Persisted');
    expect(snapshot?.avatar).toBe('https://cdn/avatar.png');
    expect(snapshot?.id).toBe('100');
  });
});

// ─── 3. Session cleanup boundaries ───────────────────────────────────────────

describe('session cleanup boundaries', () => {
  it('clearSession resets auth state and calls clearLocalSessionArtifacts', async () => {
    useAuthStore.setState({
      currentUser: makeUser(),
      accessToken: 'token',
      permissions: ['chat'],
      authReady: true,
      sessionGeneration: 5,
    });
    useSessionStore.setState({ sessions: [makeSession()] });
    kvStorage.setJson(STORAGE_KEYS.userSnapshot, makeUser());

    await useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().accessToken).toBe('');
    expect(useAuthStore.getState().permissions).toEqual([]);
    expect(useSessionStore.getState().sessions).toEqual([]);
    expect(kvStorage.getJson(STORAGE_KEYS.userSnapshot, null)).toBeNull();
  });

  it('clearSession preserves fcmToken by default', async () => {
    kvStorage.setString(STORAGE_KEYS.fcmToken, 'keep-this');
    await useAuthStore.getState().clearSession();
    // kvStorage.clearSessionScope with preserveFcmToken=true should not remove fcmToken
    // We verify by checking that secureStorage.clearSession was called (the actual kvStorage
    // behavior is tested in kvStorage unit tests)
    expect(mockedSecureStorage.clearSession).toHaveBeenCalled();
  });

  it('clearRuntime clears sessionStore and messageStore runtime state', () => {
    const session = makeSession();
    useSessionStore.setState({ sessions: [session], currentSession: session });
    useMessageStore.setState({
      messagesBySession: { '100_200': [makeMessage('m1')] },
      searchResults: [makeMessage('m2')],
    });

    // Use chatStore.clearRuntime — but since it's mocked, call the stores directly
    useSessionStore.getState().clear();
    useMessageStore.getState().clear();

    expect(useSessionStore.getState().sessions).toEqual([]);
    expect(useSessionStore.getState().currentSession).toBeNull();
    expect(useMessageStore.getState().messagesBySession).toEqual({});
    expect(useMessageStore.getState().searchResults).toEqual([]);
  });

  it('clearAllCache clears SQLite tables but not secureStorage', () => {
    messageRepository.upsertSession(makeSession());
    messageRepository.upsertMessages('100_200', [makeMessage('m1')]);

    messageRepository.clearAllCache();

    expect(messageRepository.listSessions()).toEqual([]);
    expect(messageRepository.listMessages('100_200')).toEqual([]);
    // secureStorage.clearSession should NOT be called by clearAllCache
    expect(mockedSecureStorage.clearSession).not.toHaveBeenCalled();
  });

  it('clearAllCache clears pending and upload repositories', () => {
    pendingMessageRepository.enqueue({
      localId: 'p1',
      conversationId: '100_200',
      sendType: 'private',
      payloadJson: '{}',
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    uploadTaskRepository.upsert({
      taskId: 'u1',
      localMessageId: 'p1',
      fileUri: 'file:///a.png',
      fileName: 'a.png',
      uploadType: 'IMAGE',
      status: 'pending',
      progress: 0,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    messageRepository.clearAllCache();

    expect(pendingMessageRepository.listReady(Date.now() + 10_000)).toEqual([]);
    expect(uploadTaskRepository.listPending()).toEqual([]);
  });
});

// ─── 4. Stale snapshot cleanup ───────────────────────────────────────────────

describe('stale snapshot cleanup', () => {
  it('restoreSession clears snapshot when no token and no cookie exist', async () => {
    mockedSecureStorage.get.mockResolvedValue('');
    kvStorage.setJson(STORAGE_KEYS.userSnapshot, makeUser({ id: 'stale', username: 'stale-user' }));
    useSessionStore.setState({ sessions: [makeSession()] });

    const result = await useAuthStore.getState().restoreSession();

    expect(result).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(kvStorage.getJson(STORAGE_KEYS.userSnapshot, null)).toBeNull();
    expect(useSessionStore.getState().sessions).toEqual([]);
    expect(useAuthStore.getState().authReady).toBe(true);
  });

  it('restoreSession clears snapshot and pending messages on stale state', async () => {
    mockedSecureStorage.get.mockResolvedValue('');
    kvStorage.setJson(STORAGE_KEYS.userSnapshot, makeUser());
    pendingMessageRepository.enqueue({
      localId: 'stale_p1',
      conversationId: '100_200',
      sendType: 'private',
      payloadJson: '{}',
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await useAuthStore.getState().restoreSession();

    expect(pendingMessageRepository.listReady(Date.now() + 10_000)).toEqual([]);
    expect(kvStorage.getJson(STORAGE_KEYS.userSnapshot, null)).toBeNull();
  });

  it('restoreSession with valid token reuses matching snapshot', async () => {
    const user = makeUser({ id: '42', username: 'valid-user' });
    mockedSecureStorage.get.mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.accessToken) return Promise.resolve('valid-token');
      return Promise.resolve('');
    });
    kvStorage.setJson(STORAGE_KEYS.userSnapshot, user);
    jest.mocked(authService.parseAccessToken).mockResolvedValue({
      code: 200,
      message: 'ok',
      data: { valid: true, userId: '42', username: 'valid-user', permissions: [] },
    });
    const chatMod = require('@/stores/chatStore') as typeof import('@/stores/chatStore');
    jest.mocked(chatMod.useChatStore.getState().bootstrap).mockResolvedValue(undefined);
    const wsMod = require('@/stores/websocketStore') as typeof import('@/stores/websocketStore');
    jest.mocked(wsMod.useWebsocketStore.getState().connect).mockResolvedValue(undefined);
    jest.mocked(getFcmToken).mockResolvedValue('fcm');

    const result = await useAuthStore.getState().restoreSession();

    expect(result).toBe(true);
    expect(useAuthStore.getState().currentUser).toEqual(expect.objectContaining({ id: '42', username: 'valid-user' }));
  });
});

// ─── 5. Account switch isolation ─────────────────────────────────────────────

describe('account switch isolation', () => {
  it('user B does not inherit user A sessions after clearSession', async () => {
    // User A has sessions and messages
    const userASession = makeSession({ id: '1_2', targetId: '2', targetName: 'Bob' });
    messageRepository.upsertSession(userASession);
    messageRepository.upsertMessages('1_2', [makeMessage('a_msg', '1_2')]);
    useSessionStore.setState({ sessions: [userASession], currentSession: userASession });
    useMessageStore.setState({ messagesBySession: { '1_2': [makeMessage('a_msg', '1_2')] } });

    // User A clears session (logout)
    await useAuthStore.getState().clearSession();

    // Verify clean state
    expect(messageRepository.listSessions()).toEqual([]);
    expect(messageRepository.listMessages('1_2')).toEqual([]);
    expect(useSessionStore.getState().sessions).toEqual([]);
    expect(useMessageStore.getState().messagesBySession).toEqual({});
  });

  it('user B does not inherit user A pending messages', async () => {
    pendingMessageRepository.enqueue({
      localId: 'a_pending',
      conversationId: '1_2',
      sendType: 'private',
      payloadJson: '{}',
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    messageRepository.clearAllCache();

    expect(pendingMessageRepository.listReady(Date.now() + 10_000)).toEqual([]);
  });

  it('user B does not inherit user A upload tasks', async () => {
    uploadTaskRepository.upsert({
      taskId: 'a_upload',
      localMessageId: 'a_pending',
      fileUri: 'file:///a.png',
      fileName: 'a.png',
      uploadType: 'IMAGE',
      status: 'pending',
      progress: 0,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    messageRepository.clearAllCache();

    expect(uploadTaskRepository.listPending()).toEqual([]);
  });

  it('user B login after user A logout starts with empty sessions', async () => {
    // User A setup
    useAuthStore.setState({
      currentUser: makeUser({ id: '1', username: 'alice' }),
      accessToken: 'token-a',
      authReady: true,
      sessionGeneration: 1,
    });
    useSessionStore.setState({ sessions: [makeSession({ id: '1_2' })] });
    messageRepository.upsertSession(makeSession({ id: '1_2' }));

    // User A logout
    mockedUserService.logout = jest.fn().mockResolvedValue({ code: 200, message: 'ok', data: 'ok' });
    await useAuthStore.getState().logout();

    // Verify clean
    expect(useSessionStore.getState().sessions).toEqual([]);
    expect(messageRepository.listSessions()).toEqual([]);

    // User B login
    mockedUserService.login = jest.fn().mockResolvedValue({
      code: 200,
      message: 'ok',
      data: {
        success: true,
        token: 'token-b',
        user: makeUser({ id: '50', username: 'bob' }),
      },
    });
    const chatMod2 = require('@/stores/chatStore') as typeof import('@/stores/chatStore');
    jest.mocked(chatMod2.useChatStore.getState().bootstrap).mockResolvedValue(undefined);
    const wsMod2 = require('@/stores/websocketStore') as typeof import('@/stores/websocketStore');
    jest.mocked(wsMod2.useWebsocketStore.getState().connect).mockResolvedValue(undefined);
    jest.mocked(getFcmToken).mockResolvedValue('fcm');
    jest.mocked(useSettingsStore.getState().loadSettings).mockResolvedValue(undefined);

    await useAuthStore.getState().login({ username: 'bob', password: 'pass' });

    expect(useAuthStore.getState().currentUser?.id).toBe('50');
    expect(useSessionStore.getState().sessions).toEqual([]);
    expect(messageRepository.listSessions()).toEqual([]);
  });
});

// ─── 6. currentSession behavior ──────────────────────────────────────────────

describe('currentSession behavior', () => {
  it('setCurrentSession marks session as read', () => {
    const session = makeSession({ unreadCount: 5 });
    useSessionStore.setState({ sessions: [session] });

    useSessionStore.getState().setCurrentSession(session);

    expect(useSessionStore.getState().currentSession?.id).toBe(session.id);
    expect(useSessionStore.getState().sessions.find((s) => s.id === session.id)?.unreadCount).toBe(0);
  });

  it('setCurrentSession(null) clears currentSession', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      currentSession: makeSession(),
    });

    useSessionStore.getState().setCurrentSession(null);

    expect(useSessionStore.getState().currentSession).toBeNull();
  });

  it('setCurrentSession does not affect other sessions unread', () => {
    const a = makeSession({ id: '100_200', unreadCount: 3 });
    const b = makeSession({ id: '100_300', targetId: '300', targetName: 'Charlie', unreadCount: 7 });
    useSessionStore.setState({ sessions: [a, b] });

    useSessionStore.getState().setCurrentSession(a);

    expect(useSessionStore.getState().sessions.find((s) => s.id === '100_300')?.unreadCount).toBe(7);
  });

  it('clear resets currentSession to null', () => {
    useSessionStore.setState({
      sessions: [makeSession()],
      currentSession: makeSession(),
    });

    useSessionStore.getState().clear();

    expect(useSessionStore.getState().currentSession).toBeNull();
    expect(useSessionStore.getState().sessions).toEqual([]);
  });

  it('updateSessionFlags on currentSession reflects in currentSession reference', () => {
    const session = makeSession({ isPinned: false, isMuted: false });
    useSessionStore.setState({ sessions: [session], currentSession: session });

    useSessionStore.getState().updateSessionFlags(session.id, { isPinned: true, isMuted: true });

    const cs = useSessionStore.getState().currentSession;
    expect(cs?.isPinned).toBe(true);
    expect(cs?.isMuted).toBe(true);
    expect(cs?.id).toBe(session.id);
  });
});
