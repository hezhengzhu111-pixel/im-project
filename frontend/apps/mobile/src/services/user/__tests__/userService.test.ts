import { userService } from '../userService';
import { http } from '@/services/api/httpClient';

jest.mock('@/services/api/httpClient', () => ({
  http: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const mockedGet = http.get as jest.MockedFunction<typeof http.get>;
const mockedPost = http.post as jest.MockedFunction<typeof http.post>;
const mockedPut = http.put as jest.MockedFunction<typeof http.put>;

const mockApiResponse = (data: unknown) => ({
  code: 200,
  message: 'ok',
  data,
  timestamp: Date.now(),
});

describe('userService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('posts credentials and normalizes auth response', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({
        user_id: 'u1',
        token: 'jwt_token',
        access_token: 'access_jwt',
      }));

      const result = await userService.login({ username: 'test', password: 'pass' });

      expect(mockedPost).toHaveBeenCalledWith('/user/login', {
        username: 'test',
        password: 'pass',
      });
      expect(result.data).toHaveProperty('token', 'jwt_token');
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('success');
    });

    it('normalizes null response data', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(null));

      const result = await userService.login({ username: 'test', password: 'pass' });

      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty('success', false);
    });
  });

  // ── register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    it('posts registration and normalizes user', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({
        id: 'u1',
        username: 'newuser',
        nickname: 'New User',
      }));

      const result = await userService.register({
        username: 'newuser',
        password: 'pass',
        nickname: 'New User',
      });

      expect(mockedPost).toHaveBeenCalledWith('/user/register', {
        username: 'newuser',
        password: 'pass',
        nickname: 'New User',
      });
      expect(result.data).toHaveProperty('id', 'u1');
    });
  });

  // ── updateProfile ────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('puts profile data and normalizes user', async () => {
      mockedPut.mockResolvedValue(mockApiResponse({ id: 'u1', nickname: 'Updated' }));

      const result = await userService.updateProfile({ nickname: 'Updated' });

      expect(mockedPut).toHaveBeenCalledWith('/user/profile', { nickname: 'Updated' });
      expect(result.data).toHaveProperty('nickname', 'Updated');
    });
  });

  // ── search ───────────────────────────────────────────────────────────────

  describe('search', () => {
    it('searches with keyword and type', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([
        { id: 'u1', username: 'found' },
      ]));

      const result = await userService.search('found', 'username');

      expect(mockedGet).toHaveBeenCalledWith('/user/search', {
        params: { keyword: 'found', type: 'username' },
      });
      expect(result.data).toHaveLength(1);
    });

    it('returns empty array for non-array response', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(null));

      const result = await userService.search('test');

      expect(result.data).toEqual([]);
    });

    it('uses default type username when not specified', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      await userService.search('test');

      expect(mockedGet).toHaveBeenCalledWith('/user/search', {
        params: { keyword: 'test', type: 'username' },
      });
    });
  });

  // ── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('posts to logout endpoint', async () => {
      mockedPost.mockResolvedValue(mockApiResponse('ok'));

      await userService.logout();

      expect(mockedPost).toHaveBeenCalledWith('/user/logout');
    });
  });

  // ── checkOnlineStatus ────────────────────────────────────────────────────

  describe('checkOnlineStatus', () => {
    it('posts user IDs and returns status map', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ u1: true, u2: false }));

      const result = await userService.checkOnlineStatus(['u1', 'u2']);

      expect(mockedPost).toHaveBeenCalledWith('/user/online-status', ['u1', 'u2']);
      expect(result.data).toEqual({ u1: true, u2: false });
    });
  });

  // ── changePassword ───────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('puts old and new password', async () => {
      mockedPut.mockResolvedValue(mockApiResponse(true));

      await userService.changePassword({ oldPassword: 'old', newPassword: 'new' });

      expect(mockedPut).toHaveBeenCalledWith('/user/password', {
        oldPassword: 'old',
        newPassword: 'new',
      });
    });
  });

  // ── phone/email verification ─────────────────────────────────────────────

  describe('sendPhoneCode', () => {
    it('posts phone number', async () => {
      mockedPost.mockResolvedValue(mockApiResponse('sent'));

      await userService.sendPhoneCode('13800138000');

      expect(mockedPost).toHaveBeenCalledWith('/user/phone/code', { target: '13800138000' });
    });
  });

  describe('bindPhone', () => {
    it('posts phone and code', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(true));

      await userService.bindPhone({ phone: '13800138000', code: '123456' });

      expect(mockedPost).toHaveBeenCalledWith('/user/phone/bind', {
        phone: '13800138000',
        code: '123456',
      });
    });
  });

  describe('sendEmailCode', () => {
    it('posts email address', async () => {
      mockedPost.mockResolvedValue(mockApiResponse('sent'));

      await userService.sendEmailCode('test@example.com');

      expect(mockedPost).toHaveBeenCalledWith('/user/email/code', { target: 'test@example.com' });
    });
  });

  describe('bindEmail', () => {
    it('posts email and code', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(true));

      await userService.bindEmail({ email: 'test@example.com', code: '654321' });

      expect(mockedPost).toHaveBeenCalledWith('/user/email/bind', {
        email: 'test@example.com',
        code: '654321',
      });
    });
  });

  // ── getSettings ──────────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('gets settings and normalizes', async () => {
      mockedGet.mockResolvedValue(mockApiResponse({
        privacy_settings: { online_status: 'friends' },
      }));

      const result = await userService.getSettings();

      expect(mockedGet).toHaveBeenCalledWith('/user/settings');
      expect(result.data).toHaveProperty('privacy');
    });
  });

  // ── updateSettings ───────────────────────────────────────────────────────

  describe('updateSettings', () => {
    it('puts settings by type', async () => {
      mockedPut.mockResolvedValue(mockApiResponse(true));

      await userService.updateSettings('privacy', { online_status: 'nobody' });

      expect(mockedPut).toHaveBeenCalledWith('/user/settings/privacy', {
        online_status: 'nobody',
      });
    });
  });
});
