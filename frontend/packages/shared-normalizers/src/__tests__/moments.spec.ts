import { describe, it, expect } from "vitest";
import {
  normalizePost,
  normalizeMedia,
  normalizePostWithDetails,
  normalizePostWithDetailsList,
  normalizeMomentLike,
  normalizeMomentLikeList,
  normalizeMomentComment,
  normalizeMomentCommentList,
  normalizeMomentNotification,
  normalizeMomentNotificationList,
} from "../moments.js";

describe("normalizePost", () => {
  it("normalizes a valid post", () => {
    const raw = {
      id: "p1",
      userId: "u1",
      content: "Hello world",
      visibility: 0,
      linkUrl: "https://example.com",
      linkTitle: "Example",
      linkCover: "https://example.com/cover.jpg",
      location: "Beijing",
      status: 0,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const result = normalizePost(raw);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("p1");
    expect(result!.userId).toBe("u1");
    expect(result!.content).toBe("Hello world");
    expect(result!.visibility).toBe(0);
    expect(result!.linkUrl).toBe("https://example.com");
    expect(result!.linkTitle).toBe("Example");
    expect(result!.linkCover).toBe("https://example.com/cover.jpg");
    expect(result!.location).toBe("Beijing");
    expect(result!.status).toBe(0);
    expect(result!.createdAt).toBe("2024-01-01T00:00:00Z");
  });

  it("returns null for non-object input", () => {
    expect(normalizePost(null)).toBeNull();
    expect(normalizePost(undefined)).toBeNull();
    expect(normalizePost("string")).toBeNull();
    expect(normalizePost(123)).toBeNull();
  });

  it("returns null when id is missing", () => {
    expect(normalizePost({ userId: "u1" })).toBeNull();
  });

  it("defaults visibility and status", () => {
    const result = normalizePost({ id: "p1" });
    expect(result).not.toBeNull();
    expect(result!.visibility).toBe(0);
    expect(result!.status).toBe(0);
  });

  it("handles snake_case fields via string coercion", () => {
    const raw = { id: "p1", user_id: "u1" };
    const result = normalizePost(raw);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("");
  });
});

describe("normalizeMedia", () => {
  it("normalizes a valid media item", () => {
    const raw = { id: "m1", postId: "p1", type: 0, url: "https://img.jpg", sortOrder: 1 };
    const result = normalizeMedia(raw);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("m1");
    expect(result!.postId).toBe("p1");
    expect(result!.type).toBe(0);
    expect(result!.url).toBe("https://img.jpg");
    expect(result!.sortOrder).toBe(1);
  });

  it("returns null for non-object input", () => {
    expect(normalizeMedia(null)).toBeNull();
    expect(normalizeMedia(123)).toBeNull();
  });

  it("returns null when id is missing", () => {
    expect(normalizeMedia({ url: "test.jpg" })).toBeNull();
  });

  it("defaults sortOrder to 0", () => {
    const result = normalizeMedia({ id: "m1", url: "test.jpg" });
    expect(result).not.toBeNull();
    expect(result!.sortOrder).toBe(0);
  });
});

describe("normalizeMomentLike", () => {
  it("normalizes a valid like", () => {
    const raw = {
      id: "l1",
      postId: "p1",
      userId: "u1",
      createdAt: "2024-01-01T00:00:00Z",
      nickname: "Alice",
      avatar: "av.png",
    };
    const result = normalizeMomentLike(raw);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("l1");
    expect(result!.postId).toBe("p1");
    expect(result!.userId).toBe("u1");
    expect(result!.createdAt).toBe("2024-01-01T00:00:00Z");
    expect(result!.nickname).toBe("Alice");
    expect(result!.avatar).toBe("av.png");
  });

  it("returns null for non-object input", () => {
    expect(normalizeMomentLike(null)).toBeNull();
    expect(normalizeMomentLike("string")).toBeNull();
  });

  it("returns null when id is missing", () => {
    expect(normalizeMomentLike({ postId: "p1" })).toBeNull();
  });

  it("handles missing optional fields", () => {
    const result = normalizeMomentLike({ id: "l1", postId: "p1", userId: "u1" });
    expect(result).not.toBeNull();
    expect(result!.nickname).toBeUndefined();
    expect(result!.avatar).toBeUndefined();
    expect(result!.createdAt).toBe("");
  });
});

describe("normalizeMomentLikeList", () => {
  it("normalizes an array of likes", () => {
    const raw = [
      { id: "l1", postId: "p1", userId: "u1" },
      { id: "l2", postId: "p1", userId: "u2" },
    ];
    const result = normalizeMomentLikeList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("l1");
    expect(result[1].id).toBe("l2");
  });

  it("filters out invalid items", () => {
    const raw = [{ id: "l1" }, null, { noId: true }, { id: "l2" }];
    const result = normalizeMomentLikeList(raw);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeMomentLikeList(null)).toEqual([]);
    expect(normalizeMomentLikeList(undefined)).toEqual([]);
    expect(normalizeMomentLikeList("string")).toEqual([]);
  });
});

describe("normalizeMomentComment", () => {
  it("normalizes a valid comment", () => {
    const raw = {
      id: "c1",
      postId: "p1",
      userId: "u1",
      parentId: "c0",
      content: "Nice post!",
      createdAt: "2024-01-01T00:00:00Z",
      nickname: "Bob",
      avatar: "av.png",
    };
    const result = normalizeMomentComment(raw);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("c1");
    expect(result!.postId).toBe("p1");
    expect(result!.userId).toBe("u1");
    expect(result!.parentId).toBe("c0");
    expect(result!.content).toBe("Nice post!");
    expect(result!.createdAt).toBe("2024-01-01T00:00:00Z");
    expect(result!.nickname).toBe("Bob");
    expect(result!.avatar).toBe("av.png");
  });

  it("returns null for non-object input", () => {
    expect(normalizeMomentComment(null)).toBeNull();
    expect(normalizeMomentComment(123)).toBeNull();
  });

  it("returns null when id is missing", () => {
    expect(normalizeMomentComment({ content: "test" })).toBeNull();
  });

  it("handles missing optional fields", () => {
    const result = normalizeMomentComment({ id: "c1", postId: "p1", userId: "u1", content: "test" });
    expect(result).not.toBeNull();
    expect(result!.parentId).toBeUndefined();
    expect(result!.nickname).toBeUndefined();
    expect(result!.avatar).toBeUndefined();
  });
});

describe("normalizeMomentCommentList", () => {
  it("normalizes an array of comments", () => {
    const raw = [
      { id: "c1", postId: "p1", userId: "u1", content: "Hello" },
      { id: "c2", postId: "p1", userId: "u2", content: "World" },
    ];
    const result = normalizeMomentCommentList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("Hello");
    expect(result[1].content).toBe("World");
  });

  it("filters out invalid items", () => {
    const raw = [{ id: "c1" }, null, { content: "no id" }];
    const result = normalizeMomentCommentList(raw);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeMomentCommentList(null)).toEqual([]);
    expect(normalizeMomentCommentList({})).toEqual([]);
  });
});

describe("normalizeMomentNotification", () => {
  it("normalizes a like notification", () => {
    const raw = {
      id: "n1",
      userId: "u1",
      actorId: "u2",
      notificationType: "like",
      postId: "p1",
      isRead: false,
      createdAt: "2024-01-01T00:00:00Z",
      actorNickname: "Alice",
      actorAvatar: "av.png",
    };
    const result = normalizeMomentNotification(raw);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("n1");
    expect(result!.userId).toBe("u1");
    expect(result!.actorId).toBe("u2");
    expect(result!.notificationType).toBe("like");
    expect(result!.postId).toBe("p1");
    expect(result!.isRead).toBe(false);
    expect(result!.actorNickname).toBe("Alice");
    expect(result!.actorAvatar).toBe("av.png");
  });

  it("normalizes a comment notification", () => {
    const raw = {
      id: "n2",
      userId: "u1",
      actorId: "u2",
      notificationType: "comment",
      postId: "p1",
      commentId: "c1",
      isRead: true,
      createdAt: "2024-01-01T00:00:00Z",
    };
    const result = normalizeMomentNotification(raw);
    expect(result).not.toBeNull();
    expect(result!.notificationType).toBe("comment");
    expect(result!.commentId).toBe("c1");
    expect(result!.isRead).toBe(true);
  });

  it("defaults to like for unknown notificationType", () => {
    const raw = { id: "n1", notificationType: "unknown" };
    const result = normalizeMomentNotification(raw);
    expect(result).not.toBeNull();
    expect(result!.notificationType).toBe("like");
  });

  it("returns null for non-object input", () => {
    expect(normalizeMomentNotification(null)).toBeNull();
    expect(normalizeMomentNotification("string")).toBeNull();
  });

  it("returns null when id is missing", () => {
    expect(normalizeMomentNotification({ postId: "p1" })).toBeNull();
  });
});

describe("normalizeMomentNotificationList", () => {
  it("normalizes an array of notifications", () => {
    const raw = [
      { id: "n1", notificationType: "like", postId: "p1" },
      { id: "n2", notificationType: "comment", postId: "p1" },
    ];
    const result = normalizeMomentNotificationList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].notificationType).toBe("like");
    expect(result[1].notificationType).toBe("comment");
  });

  it("filters out invalid items", () => {
    const raw = [{ id: "n1" }, null, { noId: true }];
    const result = normalizeMomentNotificationList(raw);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeMomentNotificationList(null)).toEqual([]);
    expect(normalizeMomentNotificationList(123)).toEqual([]);
  });
});

describe("normalizePostWithDetails", () => {
  it("normalizes nested format", () => {
    const raw = {
      post: { id: "p1", userId: "u1", content: "Hello" },
      media: [{ id: "m1", postId: "p1", type: 0, url: "img.jpg", sortOrder: 0 }],
      likeCount: 5,
      commentCount: 3,
      isLiked: true,
      userNickname: "Alice",
      userAvatar: "av.png",
    };
    const result = normalizePostWithDetails(raw);
    expect(result).not.toBeNull();
    expect(result!.post.id).toBe("p1");
    expect(result!.media).toHaveLength(1);
    expect(result!.media[0].id).toBe("m1");
    expect(result!.likeCount).toBe(5);
    expect(result!.commentCount).toBe(3);
    expect(result!.isLiked).toBe(true);
    expect(result!.userNickname).toBe("Alice");
  });

  it("normalizes flat format fallback", () => {
    const raw = { id: "p1", userId: "u1", content: "Hello" };
    const result = normalizePostWithDetails(raw);
    expect(result).not.toBeNull();
    expect(result!.post.id).toBe("p1");
    expect(result!.media).toEqual([]);
    expect(result!.likeCount).toBe(0);
    expect(result!.isLiked).toBe(false);
  });

  it("returns null for non-object input", () => {
    expect(normalizePostWithDetails(null)).toBeNull();
    expect(normalizePostWithDetails(undefined)).toBeNull();
  });

  it("filters out invalid media items", () => {
    const raw = {
      post: { id: "p1" },
      media: [{ id: "m1", url: "test.jpg" }, null, { noId: true }],
    };
    const result = normalizePostWithDetails(raw);
    expect(result).not.toBeNull();
    expect(result!.media).toHaveLength(1);
  });
});

describe("normalizePostWithDetailsList", () => {
  it("normalizes an array of posts", () => {
    const raw = [
      { post: { id: "p1", userId: "u1" } },
      { id: "p2", userId: "u2" },
    ];
    const result = normalizePostWithDetailsList(raw);
    expect(result).toHaveLength(2);
  });

  it("filters out invalid items", () => {
    const raw = [{ post: { id: "p1" } }, null, { noId: true }];
    const result = normalizePostWithDetailsList(raw);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizePostWithDetailsList(null)).toEqual([]);
    expect(normalizePostWithDetailsList({})).toEqual([]);
  });
});
