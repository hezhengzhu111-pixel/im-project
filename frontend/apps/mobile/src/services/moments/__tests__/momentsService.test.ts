import { momentsService } from '../momentsService';
import { http } from '@/services/api/httpClient';

jest.mock('@/services/api/httpClient', () => ({
  http: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock shared normalizers
jest.mock('@im/shared-normalizers', () => ({
  normalizePostWithDetails: jest.fn((data: unknown) => {
    if (!data || (typeof data === 'object' && !('id' in (data as Record<string, unknown>)))) return null;
    return { ...(data as Record<string, unknown>), _normalized: true };
  }),
  normalizePostWithDetailsList: jest.fn((data: unknown) => {
    if (Array.isArray(data)) return data.map((item) => ({ ...item, _normalized: true }));
    return [];
  }),
  normalizeMomentComment: jest.fn((data: unknown) => {
    if (!data) return null;
    return { ...(data as Record<string, unknown>), _normalized: true };
  }),
  normalizeMomentCommentList: jest.fn((data: unknown) => {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    return [];
  }),
  normalizeMomentLikeList: jest.fn((data: unknown) => {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    return [];
  }),
  normalizeMomentNotificationList: jest.fn((data: unknown) => {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    return [];
  }),
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

describe('momentsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createPost ───────────────────────────────────────────────────────────

  describe('createPost', () => {
    it('creates post and normalizes response', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ id: 'p1', content: 'Hello' }));

      const result = await momentsService.createPost({ content: 'Hello' });

      expect(mockedPost).toHaveBeenCalledWith('/moments', { content: 'Hello' });
      expect(result.data).toHaveProperty('_normalized', true);
    });

    it('returns null data when response data is null', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(null));

      const result = await momentsService.createPost({ content: 'Hi' });

      expect(result.data).toBeNull();
    });
  });

  // ── getFeed ──────────────────────────────────────────────────────────────

  describe('getFeed', () => {
    it('fetches feed with query params and normalizes list', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([
        { id: 'p1', content: 'Post 1' },
        { id: 'p2', content: 'Post 2' },
      ]));

      const result = await momentsService.getFeed({ page: 1, size: 20 });

      expect(mockedGet).toHaveBeenCalledWith('/moments/feed', { params: { page: 1, size: 20 } });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('_normalized', true);
    });

    it('works without query', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([]));

      const result = await momentsService.getFeed();

      expect(mockedGet).toHaveBeenCalledWith('/moments/feed', { params: undefined });
      expect(result).toEqual([]);
    });
  });

  // ── getPost ──────────────────────────────────────────────────────────────

  describe('getPost', () => {
    it('fetches single post and normalizes', async () => {
      mockedGet.mockResolvedValue(mockApiResponse({ id: 'p1', content: 'Detail' }));

      const result = await momentsService.getPost('p1');

      expect(mockedGet).toHaveBeenCalledWith('/moments/p1');
      expect(result).toHaveProperty('_normalized', true);
    });

    it('returns null when response data is null', async () => {
      mockedGet.mockResolvedValue(mockApiResponse(null));

      const result = await momentsService.getPost('p1');

      expect(result).toBeNull();
    });
  });

  // ── deletePost ───────────────────────────────────────────────────────────

  describe('deletePost', () => {
    it('deletes post by id', async () => {
      mockedDelete.mockResolvedValue(mockApiResponse(undefined));

      await momentsService.deletePost('p1');

      expect(mockedDelete).toHaveBeenCalledWith('/moments/p1');
    });
  });

  // ── addMedia ─────────────────────────────────────────────────────────────

  describe('addMedia', () => {
    it('posts media array', async () => {
      mockedPost.mockResolvedValue(mockApiResponse(undefined));

      await momentsService.addMedia('p1', [
        { url: 'http://example.com/img.jpg', type: 1, sortOrder: 0 },
      ]);

      expect(mockedPost).toHaveBeenCalledWith('/moments/p1/media', {
        media: [{ url: 'http://example.com/img.jpg', type: 1, sortOrder: 0 }],
      });
    });
  });

  // ── getUserPosts ─────────────────────────────────────────────────────────

  describe('getUserPosts', () => {
    it('fetches user posts and normalizes list', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([{ id: 'p1' }]));

      const result = await momentsService.getUserPosts('u1', { page: 1 });

      expect(mockedGet).toHaveBeenCalledWith('/moments/user/u1', { params: { page: 1 } });
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('_normalized', true);
    });
  });

  // ── likePost / unlikePost ────────────────────────────────────────────────

  describe('likePost', () => {
    it('posts like request', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ liked: true }));

      const result = await momentsService.likePost('p1');

      expect(mockedPost).toHaveBeenCalledWith('/moments/p1/like');
      expect(result.data).toEqual({ liked: true });
    });
  });

  describe('unlikePost', () => {
    it('deletes unlike request', async () => {
      mockedDelete.mockResolvedValue(mockApiResponse(undefined));

      await momentsService.unlikePost('p1');

      expect(mockedDelete).toHaveBeenCalledWith('/moments/p1/like');
    });
  });

  // ── getLikes ─────────────────────────────────────────────────────────────

  describe('getLikes', () => {
    it('fetches likes and normalizes list', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([{ user_id: 'u1' }, { user_id: 'u2' }]));

      const result = await momentsService.getLikes('p1');

      expect(mockedGet).toHaveBeenCalledWith('/moments/p1/likes');
      expect(result).toHaveLength(2);
    });
  });

  // ── createComment ────────────────────────────────────────────────────────

  describe('createComment', () => {
    it('creates comment with content', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ id: 'c1', content: 'Nice!' }));

      const result = await momentsService.createComment('p1', { content: 'Nice!' });

      expect(mockedPost).toHaveBeenCalledWith('/moments/p1/comments', { content: 'Nice!' });
      expect(result.data).toHaveProperty('_normalized', true);
    });

    it('creates comment with parentId', async () => {
      mockedPost.mockResolvedValue(mockApiResponse({ id: 'c2' }));

      await momentsService.createComment('p1', { content: 'Reply', parentId: 'c1' });

      expect(mockedPost).toHaveBeenCalledWith('/moments/p1/comments', {
        content: 'Reply',
        parentId: 'c1',
      });
    });
  });

  // ── deleteComment ────────────────────────────────────────────────────────

  describe('deleteComment', () => {
    it('deletes comment by id', async () => {
      mockedDelete.mockResolvedValue(mockApiResponse(undefined));

      await momentsService.deleteComment('c1');

      expect(mockedDelete).toHaveBeenCalledWith('/moments/comments/c1');
    });
  });

  // ── getComments ──────────────────────────────────────────────────────────

  describe('getComments', () => {
    it('fetches comments and normalizes list', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([{ id: 'c1' }, { id: 'c2' }]));

      const result = await momentsService.getComments('p1');

      expect(mockedGet).toHaveBeenCalledWith('/moments/p1/comments');
      expect(result).toHaveLength(2);
    });
  });

  // ── getNotifications ─────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('fetches notifications and normalizes list', async () => {
      mockedGet.mockResolvedValue(mockApiResponse([{ type: 'like' }, { type: 'comment' }]));

      const result = await momentsService.getNotifications();

      expect(mockedGet).toHaveBeenCalledWith('/moments/notifications');
      expect(result).toHaveLength(2);
    });
  });

  // ── markNotificationsRead ────────────────────────────────────────────────

  describe('markNotificationsRead', () => {
    it('puts mark read request', async () => {
      mockedPut.mockResolvedValue(mockApiResponse(undefined));

      await momentsService.markNotificationsRead();

      expect(mockedPut).toHaveBeenCalledWith('/moments/notifications/read');
    });
  });
});
