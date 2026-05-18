import { friendService } from '../friendService';
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

describe('friendService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getList ──────────────────────────────────────────────────────────────

  describe('getList', () => {
    it('returns normalized friendship list from array response', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([
        { id: '1', user_id: 'u1', friend_id: 'u2', status: 1, remark: '备注' },
        { id: '2', user_id: 'u1', friend_id: 'u3', status: 1 },
      ]));

      const result = await friendService.getList();

      expect(mockedGet).toHaveBeenCalledTimes(1);
      expect(mockedGet).toHaveBeenCalledWith('/friend/list');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toHaveProperty('id');
      expect(result.data[1]).toHaveProperty('friendId');
    });

    it('returns empty array when response data is null', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(null));

      const result = await friendService.getList();

      expect(result.data).toEqual([]);
    });

    it('returns empty array when response data is not an array', async () => {
      mockedGet.mockResolvedValue(mockApiResponse({}));

      const result = await friendService.getList();

      expect(result.data).toEqual([]);
    });
  });

  // ── add ──────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('calls with userId and message', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(undefined));

      await friendService.add({ userId: 'u2', message: '你好' });

      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(mockedPost).toHaveBeenCalledWith('/friend/request', {
        targetUserId: 'u2',
        reason: '你好',
      });
    });

    it('calls with userId and no message', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(undefined));

      await friendService.add({ userId: 'u3' });

      expect(mockedPost).toHaveBeenCalledWith('/friend/request', {
        targetUserId: 'u3',
        reason: undefined,
      });
    });
  });

  // ── getRequests ──────────────────────────────────────────────────────────

  describe('getRequests', () => {
    it('normalizes requests when response.data is an array', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([
        { id: '1', applicant_id: 'u1', target_user_id: 'u2', status: 0 },
      ]));

      const result = await friendService.getRequests();

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('id');
    });

    it('extracts records from response.data.records', async () => {
      mockedGet.mockResolvedValue(mockApiResponse({
        records: [{ id: '2', applicant_id: 'u3', target_user_id: 'u4', status: 1 }],
      }));

      const result = await friendService.getRequests();

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('id');
    });

    it('returns empty array when response has no recognizable data', async () => {
      mockedGet.mockResolvedValue(mockApiResponse({}));

      const result = await friendService.getRequests();

      expect(result.data).toEqual([]);
    });

    it('returns empty array when response data is null', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(null));

      const result = await friendService.getRequests();

      expect(result.data).toEqual([]);
    });
  });

  // ── handleRequest ────────────────────────────────────────────────────────

  describe('handleRequest', () => {
    it('posts to accept endpoint when action is ACCEPT', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(undefined));

      await friendService.handleRequest({ requestId: 'req_1', action: 'ACCEPT' });

      expect(mockedPost).toHaveBeenCalledWith('/friend/accept', {
        requestId: 'req_1',
        action: 'ACCEPT',
      });
    });

    it('posts to reject endpoint when action is REJECT', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(undefined));

      await friendService.handleRequest({ requestId: 'req_2', action: 'REJECT' });

      expect(mockedPost).toHaveBeenCalledWith('/friend/reject', {
        requestId: 'req_2',
        action: 'REJECT',
      });
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes with friendUserId param', async () => {
      mockedDelete.mockResolvedValue(mockApiResponse(undefined));

      await friendService.delete('friend_1');

      expect(mockedDelete).toHaveBeenCalledTimes(1);
      expect(mockedDelete).toHaveBeenCalledWith('/friend/remove', {
        params: { friendUserId: 'friend_1' },
      });
    });
  });

  // ── updateRemark ─────────────────────────────────────────────────────────

  describe('updateRemark', () => {
    it('puts with friendUserId and remark params', async () => {
      mockedPut.mockResolvedValue(mockApiResponse(undefined));

      await friendService.updateRemark('friend_1', '新备注');

      expect(mockedPut).toHaveBeenCalledTimes(1);
      expect(mockedPut).toHaveBeenCalledWith('/friend/remark', undefined, {
        params: { friendUserId: 'friend_1', remark: '新备注' },
      });
    });

    it('can set empty remark', async () => {
      mockedPut.mockResolvedValue(mockApiResponse(undefined));

      await friendService.updateRemark('friend_2', '');

      expect(mockedPut).toHaveBeenCalledWith('/friend/remark', undefined, {
        params: { friendUserId: 'friend_2', remark: '' },
      });
    });
  });
});
