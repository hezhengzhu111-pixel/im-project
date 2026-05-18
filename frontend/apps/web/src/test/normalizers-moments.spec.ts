/**
 * Tests for moments (朋友圈) normalizers re-exported from @/normalizers/moments.
 *
 * The web normalizers are re-exports from @im/shared-normalizers. These tests
 * verify both re-export identity and functional behavior of all moment-related
 * normalization functions.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizePostWithDetails as webNormalizePostWithDetails,
  normalizePostWithDetailsList as webNormalizePostWithDetailsList,
  normalizeMomentLikeList as webNormalizeMomentLikeList,
  normalizeMomentCommentList as webNormalizeMomentCommentList,
  normalizeMomentNotificationList as webNormalizeMomentNotificationList,
} from '@/normalizers/moments';
import {
  normalizePostWithDetails as sharedNormalizePostWithDetails,
  normalizePostWithDetailsList as sharedNormalizePostWithDetailsList,
  normalizeMomentLikeList as sharedNormalizeMomentLikeList,
  normalizeMomentCommentList as sharedNormalizeMomentCommentList,
  normalizeMomentNotificationList as sharedNormalizeMomentNotificationList,
} from '@im/shared-normalizers';

describe('normalizers/moments: re-export identity', () => {
  it('normalizePostWithDetails is the same reference', () => {
    expect(webNormalizePostWithDetails).toBe(sharedNormalizePostWithDetails);
  });

  it('normalizePostWithDetailsList is the same reference', () => {
    expect(webNormalizePostWithDetailsList).toBe(sharedNormalizePostWithDetailsList);
  });

  it('normalizeMomentLikeList is the same reference', () => {
    expect(webNormalizeMomentLikeList).toBe(sharedNormalizeMomentLikeList);
  });

  it('normalizeMomentCommentList is the same reference', () => {
    expect(webNormalizeMomentCommentList).toBe(sharedNormalizeMomentCommentList);
  });

  it('normalizeMomentNotificationList is the same reference', () => {
    expect(webNormalizeMomentNotificationList).toBe(sharedNormalizeMomentNotificationList);
  });

  it('produces identical output for normalizePostWithDetails', () => {
    const raw = {
      post: { id: 'p1', userId: 'u1', content: 'Hello' },
    };
    expect(webNormalizePostWithDetails(raw)).toEqual(
      sharedNormalizePostWithDetails(raw),
    );
  });
});

describe('normalizePostWithDetails', () => {
  it('normalizes nested format with post, media, and counts', () => {
    const raw = {
      post: {
        id: 'p1',
        userId: 'u1',
        content: 'Hello Moments!',
        visibility: 0,
        linkUrl: 'https://example.com',
        linkTitle: 'Example',
        linkCover: 'https://example.com/cover.jpg',
        location: 'Beijing',
        status: 1,
        createdAt: '2024-06-01T10:00:00Z',
        updatedAt: '2024-06-01T10:00:00Z',
      },
      media: [
        { id: 'm1', postId: 'p1', type: 0, url: 'https://img.jpg', sortOrder: 0 },
        { id: 'm2', postId: 'p1', type: 1, url: 'https://video.mp4', sortOrder: 1 },
      ],
      likeCount: 10,
      commentCount: 5,
      isLiked: true,
      userNickname: 'Alice',
      userAvatar: 'https://example.com/avatar.png',
    };

    const result = webNormalizePostWithDetails(raw);
    expect(result).not.toBeNull();
    expect(result!.post.id).toBe('p1');
    expect(result!.post.content).toBe('Hello Moments!');
    expect(result!.post.visibility).toBe(0);
    expect(result!.post.status).toBe(1);
    expect(result!.post.location).toBe('Beijing');
    expect(result!.media).toHaveLength(2);
    expect(result!.media[0].type).toBe(0);
    expect(result!.media[1].type).toBe(1);
    expect(result!.likeCount).toBe(10);
    expect(result!.commentCount).toBe(5);
    expect(result!.isLiked).toBe(true);
    expect(result!.userNickname).toBe('Alice');
    expect(result!.userAvatar).toBe('https://example.com/avatar.png');
  });

  it('normalizes flat format fallback', () => {
    const raw = {
      id: 'p1',
      userId: 'u1',
      content: 'Flat post',
      createdAt: '2024-06-01T10:00:00Z',
      updatedAt: '2024-06-01T10:00:00Z',
    };

    const result = webNormalizePostWithDetails(raw);
    expect(result).not.toBeNull();
    expect(result!.post.id).toBe('p1');
    expect(result!.post.content).toBe('Flat post');
    expect(result!.post.userId).toBe('u1');
    expect(result!.media).toEqual([]);
    expect(result!.likeCount).toBe(0);
    expect(result!.commentCount).toBe(0);
    expect(result!.isLiked).toBe(false);
    expect(result!.userNickname).toBeUndefined();
    expect(result!.userAvatar).toBeUndefined();
  });

  it('returns null for non-object input', () => {
    expect(webNormalizePostWithDetails(null)).toBeNull();
    expect(webNormalizePostWithDetails(undefined)).toBeNull();
    expect(webNormalizePostWithDetails('string')).toBeNull();
    expect(webNormalizePostWithDetails(123)).toBeNull();
  });

  it('returns null when nested post has no id', () => {
    const raw = { post: { content: 'no id' } };
    expect(webNormalizePostWithDetails(raw)).toBeNull();
  });

  it('filters out invalid media items', () => {
    const raw = {
      post: { id: 'p1', userId: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      media: [
        { id: 'm1', postId: 'p1', type: 0, url: 'img.jpg', sortOrder: 0 },
        null,
        { noId: true },
        { id: 'm2', postId: 'p1', type: 1, url: 'vid.mp4', sortOrder: 1 },
      ],
    };

    const result = webNormalizePostWithDetails(raw);
    expect(result).not.toBeNull();
    expect(result!.media).toHaveLength(2);
  });

  it('defaults likeCount and commentCount to 0 for nested format when missing', () => {
    const raw = {
      post: { id: 'p1', userId: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      isLiked: true,
    };

    const result = webNormalizePostWithDetails(raw);
    expect(result).not.toBeNull();
    expect(result!.likeCount).toBe(0);
    expect(result!.commentCount).toBe(0);
    expect(result!.isLiked).toBe(true);
  });

  it('handles empty media array', () => {
    const raw = {
      post: { id: 'p1', userId: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      media: [],
    };

    const result = webNormalizePostWithDetails(raw);
    expect(result).not.toBeNull();
    expect(result!.media).toEqual([]);
  });
});

describe('normalizePostWithDetailsList', () => {
  it('normalizes an array of posts (mixed nested and flat)', () => {
    const raw = [
      {
        post: { id: 'p1', userId: 'u1', content: 'Nested', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        likeCount: 3,
      },
      {
        id: 'p2', userId: 'u2', content: 'Flat', createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const result = webNormalizePostWithDetailsList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].post.id).toBe('p1');
    expect(result[0].post.content).toBe('Nested');
    expect(result[0].likeCount).toBe(3);
    expect(result[1].post.id).toBe('p2');
    expect(result[1].post.content).toBe('Flat');
    expect(result[1].likeCount).toBe(0);
  });

  it('filters out invalid items', () => {
    const raw = [
      { post: { id: 'p1', userId: 'u1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' } },
      null,
      { noId: true },
      { id: 'p2', userId: 'u2', createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
    ];

    const result = webNormalizePostWithDetailsList(raw);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for non-array input', () => {
    expect(webNormalizePostWithDetailsList(null)).toEqual([]);
    expect(webNormalizePostWithDetailsList(undefined)).toEqual([]);
    expect(webNormalizePostWithDetailsList({})).toEqual([]);
    expect(webNormalizePostWithDetailsList('string')).toEqual([]);
  });

  it('returns empty array for empty input array', () => {
    expect(webNormalizePostWithDetailsList([])).toEqual([]);
  });
});

describe('normalizeMomentLikeList', () => {
  it('normalizes an array of likes', () => {
    const raw = [
      { id: 'l1', postId: 'p1', userId: 'u1', createdAt: '2024-01-01T00:00:00Z', nickname: 'Alice' },
      { id: 'l2', postId: 'p1', userId: 'u2', createdAt: '2024-01-01T01:00:00Z', nickname: 'Bob', avatar: 'av.png' },
    ];

    const result = webNormalizeMomentLikeList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('l1');
    expect(result[0].nickname).toBe('Alice');
    expect(result[1].id).toBe('l2');
    expect(result[1].nickname).toBe('Bob');
    expect(result[1].avatar).toBe('av.png');
  });

  it('filters out invalid items', () => {
    const raw = [
      { id: 'l1', postId: 'p1', userId: 'u1' },
      null,
      { noId: true },
      { id: 'l2', postId: 'p2', userId: 'u2' },
    ];

    const result = webNormalizeMomentLikeList(raw);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for non-array input', () => {
    expect(webNormalizeMomentLikeList(null)).toEqual([]);
    expect(webNormalizeMomentLikeList(undefined)).toEqual([]);
    expect(webNormalizeMomentLikeList('string')).toEqual([]);
    expect(webNormalizeMomentLikeList(123)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(webNormalizeMomentLikeList([])).toEqual([]);
  });

  it('handles likes without optional nickname/avatar', () => {
    const raw = [
      { id: 'l1', postId: 'p1', userId: 'u1', createdAt: '2024-01-01T00:00:00Z' },
    ];

    const result = webNormalizeMomentLikeList(raw);
    expect(result).toHaveLength(1);
    expect(result[0].nickname).toBeUndefined();
    expect(result[0].avatar).toBeUndefined();
  });
});

describe('normalizeMomentCommentList', () => {
  it('normalizes an array of comments', () => {
    const raw = [
      {
        id: 'c1', postId: 'p1', userId: 'u1', content: 'Great post!',
        createdAt: '2024-01-01T00:00:00Z', nickname: 'Alice',
      },
      {
        id: 'c2', postId: 'p1', userId: 'u2', content: 'Thanks!',
        parentId: 'c1', createdAt: '2024-01-01T01:00:00Z',
      },
    ];

    const result = webNormalizeMomentCommentList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('c1');
    expect(result[0].content).toBe('Great post!');
    expect(result[0].nickname).toBe('Alice');
    expect(result[0].parentId).toBeUndefined();
    expect(result[1].id).toBe('c2');
    expect(result[1].content).toBe('Thanks!');
    expect(result[1].parentId).toBe('c1');
    expect(result[1].nickname).toBeUndefined();
  });

  it('filters out invalid items', () => {
    const raw = [
      { id: 'c1', postId: 'p1', userId: 'u1', content: 'Valid' },
      { noId: true },
      null as unknown as Record<string, unknown>,
    ];

    const result = webNormalizeMomentCommentList(raw);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Valid');
  });

  it('returns empty array for non-array input', () => {
    expect(webNormalizeMomentCommentList(null)).toEqual([]);
    expect(webNormalizeMomentCommentList({})).toEqual([]);
  });
});

describe('normalizeMomentNotificationList', () => {
  it('normalizes an array of notifications', () => {
    const raw = [
      {
        id: 'n1', userId: 'u1', actorId: 'u2', notificationType: 'like',
        postId: 'p1', isRead: false, createdAt: '2024-01-01T00:00:00Z',
        actorNickname: 'Alice',
      },
      {
        id: 'n2', userId: 'u1', actorId: 'u3', notificationType: 'comment',
        postId: 'p1', commentId: 'c1', isRead: true,
        createdAt: '2024-01-01T01:00:00Z',
      },
    ];

    const result = webNormalizeMomentNotificationList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].notificationType).toBe('like');
    expect(result[0].isRead).toBe(false);
    expect(result[0].actorNickname).toBe('Alice');
    expect(result[1].notificationType).toBe('comment');
    expect(result[1].commentId).toBe('c1');
    expect(result[1].isRead).toBe(true);
  });

  it('filters out invalid items', () => {
    const raw = [
      { id: 'n1', notificationType: 'like', postId: 'p1' },
      { noId: true, notificationType: 'like' },
      null as unknown as Record<string, unknown>,
    ];

    const result = webNormalizeMomentNotificationList(raw);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for non-array input', () => {
    expect(webNormalizeMomentNotificationList(null)).toEqual([]);
    expect(webNormalizeMomentNotificationList(123)).toEqual([]);
  });

  it('normalizes unknown notification type to "like"', () => {
    const raw = [
      { id: 'n1', notificationType: 'unknown', postId: 'p1' },
    ];

    const result = webNormalizeMomentNotificationList(raw);
    expect(result).toHaveLength(1);
    expect(result[0].notificationType).toBe('like');
  });

  it('handles notifications without optional actor info', () => {
    const raw = [
      { id: 'n1', userId: 'u1', actorId: 'u2', notificationType: 'like', postId: 'p1', createdAt: '2024-01-01T00:00:00Z' },
    ];

    const result = webNormalizeMomentNotificationList(raw);
    expect(result[0].actorNickname).toBeUndefined();
    expect(result[0].actorAvatar).toBeUndefined();
    expect(result[0].commentId).toBeUndefined();
  });
});
