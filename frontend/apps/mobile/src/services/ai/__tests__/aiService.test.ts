import { aiService } from '../aiService';
import { http } from '@/services/api/httpClient';

jest.mock('@/services/api/httpClient', () => ({
  http: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedGet = http.get as jest.MockedFunction<typeof http.get>;
const mockedPost = http.post as jest.MockedFunction<typeof http.post>;
const mockedPut = http.put as jest.MockedFunction<typeof http.put>;
const mockedDelete = http.delete as jest.MockedFunction<typeof http.delete>;

const mockApiResponse = (data: unknown) => ({
  code: 200,
  message: 'ok',
  data,
  timestamp: Date.now(),
});

describe('aiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── listKeys ─────────────────────────────────────────────────────────────

  describe('listKeys', () => {
    it('returns normalized key list', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([
        { id: '1', provider: 'deepseek', key_name: 'My Key' },
      ]));

      const result = await aiService.listKeys();

      expect(mockedGet).toHaveBeenCalledWith('/ai/keys');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('id');
    });

    it('returns empty array for non-array data', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(null));

      const result = await aiService.listKeys();

      expect(result.data).toEqual([]);
    });
  });

  // ── createKey ────────────────────────────────────────────────────────────

  describe('createKey', () => {
    it('posts key data and normalizes response', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({
        id: '2',
        provider: 'openai',
        key_name: 'My OpenAI Key',
      }));

      const result = await aiService.createKey({
        provider: 'openai',
        apiKey: 'sk-xxx',
        keyName: 'My OpenAI Key',
      });

      expect(mockedPost).toHaveBeenCalledWith('/ai/keys', {
        provider: 'openai',
        apiKey: 'sk-xxx',
        keyName: 'My OpenAI Key',
      });
      expect(result.data).toHaveProperty('id', '2');
    });

    it('works without keyName', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ id: '3', provider: 'deepseek' }));

      const result = await aiService.createKey({ provider: 'deepseek', apiKey: 'sk-yyy' });

      expect(mockedPost).toHaveBeenCalledWith('/ai/keys', {
        provider: 'deepseek',
        apiKey: 'sk-yyy',
        keyName: undefined,
      });
      expect(result.data).toBeDefined();
    });
  });

  // ── updateKey ────────────────────────────────────────────────────────────

  describe('updateKey', () => {
    it('puts key data and normalizes response', async () => {
      mockedPut.mockResolvedValue(mockApiResponse({
        id: '1',
        provider: 'deepseek',
        key_name: 'Updated',
      }));

      const result = await aiService.updateKey('1', { keyName: 'Updated' });

      expect(mockedPut).toHaveBeenCalledWith('/ai/keys/1', { keyName: 'Updated' });
      expect(result.data).toHaveProperty('keyName');
    });

    it('updates apiKey only', async () => {
      mockedPut.mockResolvedValue(mockApiResponse({ id: '1' }));

      await aiService.updateKey('1', { apiKey: 'sk-new' });

      expect(mockedPut).toHaveBeenCalledWith('/ai/keys/1', { apiKey: 'sk-new' });
    });
  });

  // ── deleteKey ────────────────────────────────────────────────────────────

  describe('deleteKey', () => {
    it('deletes key by id', async () => {
      mockedDelete.mockResolvedValue(mockApiResponse({ deleted: true }));

      const result = await aiService.deleteKey('1');

      expect(mockedDelete).toHaveBeenCalledWith('/ai/keys/1');
      expect(result.data).toEqual({ deleted: true });
    });
  });

  // ── testKey ──────────────────────────────────────────────────────────────

  describe('testKey', () => {
    it('posts test request', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ validateStatus: 'ok' }));

      const result = await aiService.testKey('1');

      expect(mockedPost).toHaveBeenCalledWith('/ai/keys/1/test');
      expect(result.data).toEqual({ validateStatus: 'ok' });
    });
  });

  // ── getSettings ──────────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('gets settings and normalizes', async () => {
      mockedGet.mockResolvedValue(mockApiResponse({
        auto_reply_enabled: true,
        auto_reply_persona: '友好助手',
      }));

      const result = await aiService.getSettings();

      expect(mockedGet).toHaveBeenCalledWith('/ai/settings');
      expect(result.data).toHaveProperty('autoReplyEnabled');
    });
  });

  // ── updateSettings ───────────────────────────────────────────────────────

  describe('updateSettings', () => {
    it('puts settings and normalizes response', async () => {
      mockedPut.mockResolvedValue(mockApiResponse({
        auto_reply_enabled: false,
      }));

      const result = await aiService.updateSettings({ autoReplyEnabled: false });

      expect(mockedPut).toHaveBeenCalledWith('/ai/settings', {
        autoReplyEnabled: false,
      });
      expect(result.data).toHaveProperty('autoReplyEnabled', false);
    });
  });
});
