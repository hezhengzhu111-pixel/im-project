import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock, putMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/utils/request", () => ({
  http: {
    get: getMock,
    post: postMock,
    put: putMock,
    delete: deleteMock,
  },
}));

const makeResponse = (data: unknown) => ({
  code: 200,
  message: "success",
  data,
  success: true,
  timestamp: Date.now(),
});

const samplePost = {
  id: "post-1",
  userId: "user-1",
  content: "My first moment!",
  visibility: 0,
  status: 0,
  createdAt: "2026-05-18T10:00:00Z",
  updatedAt: "2026-05-18T10:00:00Z",
};

const samplePostWithDetails = {
  post: samplePost,
  media: [],
  likeCount: 0,
  commentCount: 0,
  isLiked: false,
};

describe("momentsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPost", () => {
    it("calls http.post to /moments with post data", async () => {
      postMock.mockResolvedValue(makeResponse(samplePost));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.createPost({
        content: "My first moment!",
        visibility: 0,
      });

      expect(postMock).toHaveBeenCalledWith("/moments", {
        content: "My first moment!",
        visibility: 0,
      });
      expect(result.data).toBeDefined();
    });
  });

  describe("getFeed", () => {
    it("calls http.get to /moments/feed and normalizes results", async () => {
      getMock.mockResolvedValue(makeResponse([samplePostWithDetails]));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getFeed();

      expect(getMock).toHaveBeenCalledWith("/moments/feed", {
        params: undefined,
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it("passes query params to the feed endpoint", async () => {
      getMock.mockResolvedValue(makeResponse([samplePostWithDetails]));

      const { momentsService } = await import("@/services/moments");
      await momentsService.getFeed({ cursor: "1", limit: 20 });

      expect(getMock).toHaveBeenCalledWith("/moments/feed", {
        params: { cursor: "1", limit: 20 },
      });
    });

    it("returns empty array for null/undefined data", async () => {
      getMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getFeed();

      expect(result).toEqual([]);
    });
  });

  describe("getPost", () => {
    it("calls http.get to /moments/:postId and normalizes", async () => {
      getMock.mockResolvedValue(makeResponse(samplePostWithDetails));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getPost("post-1");

      expect(getMock).toHaveBeenCalledWith("/moments/post-1");
      expect(result).not.toBeNull();
    });

    it("returns null for invalid post data", async () => {
      getMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getPost("post-invalid");

      expect(result).toBeNull();
    });
  });

  describe("deletePost", () => {
    it("calls http.delete to /moments/:postId", async () => {
      deleteMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      await momentsService.deletePost("post-1");

      expect(deleteMock).toHaveBeenCalledWith("/moments/post-1");
    });
  });

  describe("addMedia", () => {
    it("calls http.post to /moments/:postId/media with media array", async () => {
      postMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      await momentsService.addMedia("post-1", [
        { url: "https://example.com/img.jpg", type: 0, sortOrder: 1 },
      ]);

      expect(postMock).toHaveBeenCalledWith("/moments/post-1/media", {
        media: [{ url: "https://example.com/img.jpg", type: 0, sortOrder: 1 }],
      });
    });
  });

  describe("getUserPosts", () => {
    it("calls http.get to /moments/user/:userId", async () => {
      getMock.mockResolvedValue(makeResponse([samplePostWithDetails]));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getUserPosts("user-1");

      expect(getMock).toHaveBeenCalledWith("/moments/user/user-1", {
        params: undefined,
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it("passes query params", async () => {
      getMock.mockResolvedValue(makeResponse([samplePostWithDetails]));

      const { momentsService } = await import("@/services/moments");
      await momentsService.getUserPosts("user-1", { cursor: "1", limit: 10 });

      expect(getMock).toHaveBeenCalledWith("/moments/user/user-1", {
        params: { cursor: "1", limit: 10 },
      });
    });
  });

  describe("likePost", () => {
    it("calls http.post to /moments/:postId/like", async () => {
      postMock.mockResolvedValue(makeResponse({ liked: true }));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.likePost("post-1");

      expect(postMock).toHaveBeenCalledWith("/moments/post-1/like");
      expect(result.data.liked).toBe(true);
    });
  });

  describe("unlikePost", () => {
    it("calls http.delete to /moments/:postId/like", async () => {
      deleteMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      await momentsService.unlikePost("post-1");

      expect(deleteMock).toHaveBeenCalledWith("/moments/post-1/like");
    });
  });

  describe("getLikes", () => {
    it("calls http.get to /moments/:postId/likes and normalizes", async () => {
      getMock.mockResolvedValue(
        makeResponse([
          {
            id: "like-1",
            postId: "post-1",
            userId: "user-2",
            createdAt: "2026-05-18T11:00:00Z",
            nickname: "Alice",
          },
        ]),
      );

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getLikes("post-1");

      expect(getMock).toHaveBeenCalledWith("/moments/post-1/likes");
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array for null data", async () => {
      getMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getLikes("post-1");

      expect(result).toEqual([]);
    });
  });

  describe("createComment", () => {
    it("calls http.post to /moments/:postId/comments with content", async () => {
      postMock.mockResolvedValue(
        makeResponse({
          id: "comment-1",
          postId: "post-1",
          userId: "user-1",
          content: "Nice!",
          createdAt: "2026-05-18T12:00:00Z",
        }),
      );

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.createComment("post-1", {
        content: "Nice!",
      });

      expect(postMock).toHaveBeenCalledWith("/moments/post-1/comments", {
        content: "Nice!",
      });
      expect(result.data).toBeDefined();
    });

    it("includes parentId when replying to a comment", async () => {
      postMock.mockResolvedValue(
        makeResponse({
          id: "comment-2",
          content: "Reply!",
        }),
      );

      const { momentsService } = await import("@/services/moments");
      await momentsService.createComment("post-1", {
        content: "Reply!",
        parentId: "comment-0",
      });

      expect(postMock).toHaveBeenCalledWith("/moments/post-1/comments", {
        content: "Reply!",
        parentId: "comment-0",
      });
    });

    it("handles null parentId gracefully", async () => {
      postMock.mockResolvedValue(makeResponse({ id: "comment-3" }));

      const { momentsService } = await import("@/services/moments");
      await momentsService.createComment("post-1", {
        content: "Standalone",
        parentId: undefined,
      });

      expect(postMock).toHaveBeenCalledWith("/moments/post-1/comments", {
        content: "Standalone",
      });
    });
  });

  describe("deleteComment", () => {
    it("calls http.delete to /moments/comments/:commentId", async () => {
      deleteMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      await momentsService.deleteComment("comment-1");

      expect(deleteMock).toHaveBeenCalledWith("/moments/comments/comment-1");
    });
  });

  describe("getComments", () => {
    it("calls http.get to /moments/:postId/comments and normalizes", async () => {
      getMock.mockResolvedValue(
        makeResponse([
          {
            id: "comment-1",
            postId: "post-1",
            userId: "user-2",
            content: "Great!",
            createdAt: "2026-05-18T13:00:00Z",
          },
        ]),
      );

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getComments("post-1");

      expect(getMock).toHaveBeenCalledWith("/moments/post-1/comments");
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array for null data", async () => {
      getMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getComments("post-1");

      expect(result).toEqual([]);
    });
  });

  describe("getNotifications", () => {
    it("calls http.get to /moments/notifications and normalizes", async () => {
      getMock.mockResolvedValue(
        makeResponse([
          {
            id: "notif-1",
            userId: "user-1",
            actorId: "user-2",
            notificationType: "like",
            postId: "post-1",
            isRead: false,
            createdAt: "2026-05-18T14:00:00Z",
          },
        ]),
      );

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getNotifications();

      expect(getMock).toHaveBeenCalledWith("/moments/notifications");
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array for null data", async () => {
      getMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      const result = await momentsService.getNotifications();

      expect(result).toEqual([]);
    });
  });

  describe("markNotificationsRead", () => {
    it("calls http.put to /moments/notifications/read", async () => {
      putMock.mockResolvedValue(makeResponse(null));

      const { momentsService } = await import("@/services/moments");
      await momentsService.markNotificationsRead();

      expect(putMock).toHaveBeenCalledWith("/moments/notifications/read");
    });
  });
});
