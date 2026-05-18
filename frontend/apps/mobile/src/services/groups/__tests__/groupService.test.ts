import { groupService } from '../groupService';
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

describe('groupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('sends create request with all fields and normalizes response', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ id: '1', name: 'New Group' }));

      const result = await groupService.create({
        name: 'Test Group',
        description: 'A test group',
        avatar: 'avatar_url',
        memberIds: ['u1', 'u2'],
      });

      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(mockedPost).toHaveBeenCalledWith('/group/create', {
        name: 'Test Group',
        type: 1,
        announcement: 'A test group',
        avatar: 'avatar_url',
        memberIds: ['u1', 'u2'],
      });
      expect(result.data).toHaveProperty('id', '1');
      expect(result.data).toHaveProperty('name', 'New Group');
    });

    it('works without optional description and avatar', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ id: '2', name: 'Minimal Group' }));

      const result = await groupService.create({ name: 'Minimal', memberIds: ['u1'] });

      expect(mockedPost).toHaveBeenCalledWith('/group/create', {
        name: 'Minimal',
        type: 1,
        announcement: undefined,
        avatar: undefined,
        memberIds: ['u1'],
      });
      expect(result.data).toBeDefined();
    });
  });

  // ── getList ──────────────────────────────────────────────────────────────

  describe('getList', () => {
    it('returns normalized groups for user', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([
        { id: 'g1', name: 'Group 1', owner_id: 'u1' },
        { id: 'g2', name: 'Group 2', owner_id: 'u2' },
      ]));

      const result = await groupService.getList('u1');

      expect(mockedGet).toHaveBeenCalledWith('/group/user/u1');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toHaveProperty('id', 'g1');
    });

    it('returns empty array when response data is not an array', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(null));

      const result = await groupService.getList('u1');

      expect(result.data).toEqual([]);
    });
  });

  // ── getMembers ───────────────────────────────────────────────────────────

  describe('getMembers', () => {
    it('extracts members from response.data.members', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({
        members: [
          { id: 'm1', group_id: 'g1', user_id: 'u1', role: 3 },
          { id: 'm2', group_id: 'g1', user_id: 'u2', role: 1 },
        ],
      }));

      const result = await groupService.getMembers('g1');

      expect(mockedPost).toHaveBeenCalledWith('/group/members/list', { groupId: 'g1' });
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toHaveProperty('id', 'm1');
      expect(result.data[0]).toHaveProperty('role');
    });

    it('returns empty array when response has no members field', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({}));

      const result = await groupService.getMembers('g1');

      expect(result.data).toEqual([]);
    });

    it('returns empty array when members is not an array', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ members: 'not_array' }));

      const result = await groupService.getMembers('g1');

      expect(result.data).toEqual([]);
    });

    it('returns empty array when response data is null', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(null));

      const result = await groupService.getMembers('g1');

      expect(result.data).toEqual([]);
    });
  });

  // ── join ─────────────────────────────────────────────────────────────────

  describe('join', () => {
    it('posts to correct endpoint', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(undefined));

      await groupService.join('g1');

      expect(mockedPost).toHaveBeenCalledWith('/group/g1/join');
    });
  });

  // ── addMembers ───────────────────────────────────────────────────────────

  describe('addMembers', () => {
    it('posts memberIds as numbers', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(undefined));

      await groupService.addMembers('g1', ['u1', 'u2']);

      expect(mockedPost).toHaveBeenCalledWith('/group/g1/add-members', {
        memberIds: [NaN, NaN],
      });
    });
  });

  // ── searchGroups ─────────────────────────────────────────────────────────

  describe('searchGroups', () => {
    it('calls search with keyword and normalizes results', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([
        { id: 'g1', name: 'Test Group' },
      ]));

      const result = await groupService.searchGroups('test');

      expect(mockedGet).toHaveBeenCalledWith('/group/search', { params: { q: 'test' } });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('id', 'g1');
    });

    it('returns empty array when response data is not an array', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(null));

      const result = await groupService.searchGroups('test');

      expect(result.data).toEqual([]);
    });
  });

  // ── quit ─────────────────────────────────────────────────────────────────

  describe('quit', () => {
    it('posts to leave endpoint', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(undefined));

      await groupService.quit('g1');

      expect(mockedPost).toHaveBeenCalledWith('/group/g1/leave');
    });
  });

  // ── dismiss ──────────────────────────────────────────────────────────────

  describe('dismiss', () => {
    it('deletes group endpoint', async () => {
      mockedDelete.mockResolvedValue(mockApiResponse(undefined));

      await groupService.dismiss('g1');

      expect(mockedDelete).toHaveBeenCalledWith('/group/g1');
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('puts update data with operatorId and normalizes response', async () => {
      mockedPut.mockResolvedValue(mockApiResponse({ id: 'g1', name: 'Updated Name' }));

      const result = await groupService.update('g1', { name: 'Updated Name' }, 'owner1');

      expect(mockedPut).toHaveBeenCalledWith('/group/g1', {
        name: 'Updated Name',
        groupId: 'g1',
        operatorId: 'owner1',
      });
      expect(result.data).toHaveProperty('name', 'Updated Name');
    });

    it('works without operatorId using empty string fallback', async () => {
      mockedPut.mockResolvedValue(mockApiResponse({ id: 'g1' }));

      await groupService.update('g1', { name: 'Rename' });

      expect(mockedPut).toHaveBeenCalledWith('/group/g1', {
        name: 'Rename',
        groupId: 'g1',
        operatorId: '',
      });
    });

    it('passes additional data fields through', async () => {
      mockedPut.mockResolvedValue(mockApiResponse({ id: 'g1' }));

      await groupService.update('g1', { announcement: 'New announcement', max_members: 1000 });

      expect(mockedPut).toHaveBeenCalledWith('/group/g1', {
        announcement: 'New announcement',
        max_members: 1000,
        groupId: 'g1',
        operatorId: '',
      });
    });
  });
});
