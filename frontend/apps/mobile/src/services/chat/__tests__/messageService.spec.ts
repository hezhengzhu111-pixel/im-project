import { messageService } from '@/services/chat/messageService';
import { http } from '@/services/api/httpClient';

jest.mock('@/services/api/httpClient', () => ({
  http: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedGet = http.get as jest.MockedFunction<typeof http.get>;

const mockApiResponse = (data: unknown) => ({
  code: 200,
  message: 'ok',
  data,
  timestamp: Date.now(),
});

describe('messageService history methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPrivateHistory', () => {
    test('passes buildHistoryParams result to http.get', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      await messageService.getPrivateHistory('friend_1', { size: 30, beforeId: 'msg_99' });

      expect(mockedGet).toHaveBeenCalledTimes(1);
      const [url, config] = mockedGet.mock.calls[0];
      expect(url).toContain('friend_1');
      expect((config as Record<string, unknown>).params).toEqual({
        size: '30',
        beforeId: 'msg_99',
      });
    });

    test('passes empty params when called with no options', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      await messageService.getPrivateHistory('friend_1');

      const [, config] = mockedGet.mock.calls[0];
      expect((config as Record<string, unknown>).params).toEqual({});
    });

    test('strips undefined fields from params', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      await messageService.getPrivateHistory('friend_1', {
        size: 10,
        beforeId: undefined,
        afterTime: undefined,
      });

      const [, config] = mockedGet.mock.calls[0];
      expect((config as Record<string, unknown>).params).toEqual({ size: '10' });
    });

    test('normalizes response data', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse([
          { id: '1', sender_id: '1', receiver_id: '2', message_type: 'TEXT', content: 'hello' },
        ]),
      );

      const result = await messageService.getPrivateHistory('friend_1');

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('messageType');
    });

    test('returns empty array when response data is not an array', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(null));

      const result = await messageService.getPrivateHistory('friend_1');

      expect(result.data).toEqual([]);
    });
  });

  describe('getGroupHistory', () => {
    test('passes buildHistoryParams result to http.get', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      await messageService.getGroupHistory('group_9', { size: 50, afterId: 'msg_10' });

      expect(mockedGet).toHaveBeenCalledTimes(1);
      const [url, config] = mockedGet.mock.calls[0];
      expect(url).toContain('group_9');
      expect((config as Record<string, unknown>).params).toEqual({
        size: '50',
        afterId: 'msg_10',
      });
    });

    test('passes empty params when called with no options', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      await messageService.getGroupHistory('group_9');

      const [, config] = mockedGet.mock.calls[0];
      expect((config as Record<string, unknown>).params).toEqual({});
    });

    test('preserves beforeTime and beforeId together', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      await messageService.getGroupHistory('group_9', {
        beforeId: 'msg_200',
        beforeTime: '2026-05-16T08:00:00.000Z',
      });

      const [, config] = mockedGet.mock.calls[0];
      expect((config as Record<string, unknown>).params).toEqual({
        beforeId: 'msg_200',
        beforeTime: '2026-05-16T08:00:00.000Z',
      });
    });

    test('preserves afterTime and afterId together', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      await messageService.getGroupHistory('group_9', {
        afterId: 'msg_50',
        afterTime: '2026-05-16T06:00:00.000Z',
      });

      const [, config] = mockedGet.mock.calls[0];
      expect((config as Record<string, unknown>).params).toEqual({
        afterId: 'msg_50',
        afterTime: '2026-05-16T06:00:00.000Z',
      });
    });

    test('normalizes response data', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse([
          { id: '2', sender_id: '3', group_id: '9', message_type: 'TEXT', content: 'hi group' },
        ]),
      );

      const result = await messageService.getGroupHistory('group_9');

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('messageType');
    });

    test('returns empty array when response data is not an array', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(undefined));

      const result = await messageService.getGroupHistory('group_9');

      expect(result.data).toEqual([]);
    });
  });
});
