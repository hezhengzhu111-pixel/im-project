import { describe, it, expect } from "vitest";
import { extractFriendRequestList } from "../friendRequest.js";
import { normalizeFriendRequest } from "../user.js";

describe("extractFriendRequestList", () => {
  it("returns array directly", () => {
    const arr = [{ id: "1" }, { id: "2" }];
    expect(extractFriendRequestList(arr)).toBe(arr);
  });

  it("extracts from content field", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ content: arr })).toEqual(arr);
  });

  it("extracts from records field", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ records: arr })).toEqual(arr);
  });

  it("extracts from list field", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ list: arr })).toEqual(arr);
  });

  it("extracts from items field", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ items: arr })).toEqual(arr);
  });

  it("extracts from data.content when data is object", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ data: { content: arr } })).toEqual(arr);
  });

  it("extracts from data.list when data is object", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ data: { list: arr } })).toEqual(arr);
  });

  it("extracts from data.records when data is object", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ data: { records: arr } })).toEqual(arr);
  });

  it("extracts from data.items when data is object", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ data: { items: arr } })).toEqual(arr);
  });

  it("returns data directly when data is an array", () => {
    const arr = [{ id: "1" }];
    expect(extractFriendRequestList({ data: arr })).toEqual(arr);
  });

  it("returns empty array for null input", () => {
    expect(extractFriendRequestList(null)).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(extractFriendRequestList({})).toEqual([]);
  });

  it("returns empty array for non-object non-array input", () => {
    expect(extractFriendRequestList("string")).toEqual([]);
    expect(extractFriendRequestList(123)).toEqual([]);
  });
});

describe("normalizeFriendRequest", () => {
  describe("id / requestId", () => {
    it("prefers id over requestId", () => {
      const raw = { id: "r1", requestId: "r2", applicantId: "a1", applicantUsername: "u" };
      expect(normalizeFriendRequest(raw).id).toBe("r1");
    });

    it("falls back to requestId", () => {
      const raw = { requestId: "r2", applicantId: "a1", applicantUsername: "u" };
      expect(normalizeFriendRequest(raw).id).toBe("r2");
    });
  });

  describe("applicantId / fromUserId", () => {
    it("prefers applicantId", () => {
      const raw = { id: "r1", applicantId: "a1", fromUserId: "a2", applicantUsername: "u" };
      expect(normalizeFriendRequest(raw).applicantId).toBe("a1");
    });

    it("falls back to fromUserId", () => {
      const raw = { id: "r1", fromUserId: "a2", applicantUsername: "u" };
      expect(normalizeFriendRequest(raw).applicantId).toBe("a2");
    });

    it("falls back to from_user_id", () => {
      const raw = { id: "r1", from_user_id: "a3", applicantUsername: "u" };
      expect(normalizeFriendRequest(raw).applicantId).toBe("a3");
    });

    it("falls back to senderId", () => {
      const raw = { id: "r1", senderId: "a4", applicantUsername: "u" };
      expect(normalizeFriendRequest(raw).applicantId).toBe("a4");
    });
  });

  describe("applicantUsername / username", () => {
    it("prefers applicantUsername", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "alice", username: "bob" };
      expect(normalizeFriendRequest(raw).applicantUsername).toBe("alice");
    });

    it("falls back to fromUser.username", () => {
      const raw = { id: "r1", applicantId: "a1", fromUser: { username: "charlie" } };
      expect(normalizeFriendRequest(raw).applicantUsername).toBe("charlie");
    });

    it("falls back to top-level username", () => {
      const raw = { id: "r1", applicantId: "a1", username: "dave" };
      expect(normalizeFriendRequest(raw).applicantUsername).toBe("dave");
    });
  });

  describe("applicantNickname / nickname", () => {
    it("prefers applicantNickname", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", applicantNickname: "Nick", nickname: "N" };
      expect(normalizeFriendRequest(raw).applicantNickname).toBe("Nick");
    });

    it("falls back to fromUser.nickname", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", fromUser: { nickname: "FN" } };
      expect(normalizeFriendRequest(raw).applicantNickname).toBe("FN");
    });

    it("falls back to top-level nickname", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", nickname: "TN" };
      expect(normalizeFriendRequest(raw).applicantNickname).toBe("TN");
    });

    it("is undefined when all sources empty", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u" };
      expect(normalizeFriendRequest(raw).applicantNickname).toBeUndefined();
    });
  });

  describe("applicantAvatar / avatar", () => {
    it("prefers applicantAvatar", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", applicantAvatar: "av1.png", avatar: "av2.png" };
      expect(normalizeFriendRequest(raw).applicantAvatar).toBe("av1.png");
    });

    it("falls back to fromUser.avatar", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", fromUser: { avatar: "fav.png" } };
      expect(normalizeFriendRequest(raw).applicantAvatar).toBe("fav.png");
    });

    it("falls back to top-level avatar", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", avatar: "tav.png" };
      expect(normalizeFriendRequest(raw).applicantAvatar).toBe("tav.png");
    });
  });

  describe("targetUserId / toUserId", () => {
    it("prefers targetUserId", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", targetUserId: "t1", toUserId: "t2" };
      expect(normalizeFriendRequest(raw).targetUserId).toBe("t1");
    });

    it("falls back to toUserId", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", toUserId: "t2" };
      expect(normalizeFriendRequest(raw).targetUserId).toBe("t2");
    });

    it("falls back to to_user_id", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", to_user_id: "t3" };
      expect(normalizeFriendRequest(raw).targetUserId).toBe("t3");
    });

    it("falls back to receiverId", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", receiverId: "t4" };
      expect(normalizeFriendRequest(raw).targetUserId).toBe("t4");
    });
  });

  describe("reason", () => {
    it("prefers reason over message", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", reason: "hello", message: "hi" };
      expect(normalizeFriendRequest(raw).reason).toBe("hello");
    });

    it("falls back to message", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u", message: "hi" };
      expect(normalizeFriendRequest(raw).reason).toBe("hi");
    });

    it("is undefined when both empty", () => {
      const raw = { id: "r1", applicantId: "a1", applicantUsername: "u" };
      expect(normalizeFriendRequest(raw).reason).toBeUndefined();
    });
  });

  describe("status normalization", () => {
    const base = { id: "r1", applicantId: "a1", applicantUsername: "u" };

    it("PENDING string → PENDING", () => {
      expect(normalizeFriendRequest({ ...base, status: "PENDING" }).status).toBe("PENDING");
    });

    it("0 → PENDING", () => {
      expect(normalizeFriendRequest({ ...base, status: "0" }).status).toBe("PENDING");
    });

    it("ACCEPTED string → ACCEPTED", () => {
      expect(normalizeFriendRequest({ ...base, status: "ACCEPTED" }).status).toBe("ACCEPTED");
    });

    it("1 → ACCEPTED", () => {
      expect(normalizeFriendRequest({ ...base, status: "1" }).status).toBe("ACCEPTED");
    });

    it("'已同意' → ACCEPTED", () => {
      expect(normalizeFriendRequest({ ...base, status: "已同意" }).status).toBe("ACCEPTED");
    });

    it("REJECTED string → REJECTED", () => {
      expect(normalizeFriendRequest({ ...base, status: "REJECTED" }).status).toBe("REJECTED");
    });

    it("2 → REJECTED", () => {
      expect(normalizeFriendRequest({ ...base, status: "2" }).status).toBe("REJECTED");
    });

    it("'已拒绝' → REJECTED", () => {
      expect(normalizeFriendRequest({ ...base, status: "已拒绝" }).status).toBe("REJECTED");
    });

    it("unknown status → PENDING", () => {
      expect(normalizeFriendRequest({ ...base, status: "UNKNOWN" }).status).toBe("PENDING");
    });

    it("numeric 3 → PENDING", () => {
      expect(normalizeFriendRequest({ ...base, status: "3" }).status).toBe("PENDING");
    });
  });

  describe("createTime / createdAt / updateTime", () => {
    const base = { id: "r1", applicantId: "a1", applicantUsername: "u" };

    it("prefers createTime", () => {
      const raw = { ...base, createTime: "2024-01-01", createdAt: "2024-02-01" };
      expect(normalizeFriendRequest(raw).createTime).toBe("2024-01-01");
    });

    it("falls back to createdAt", () => {
      const raw = { ...base, createdAt: "2024-02-01" };
      expect(normalizeFriendRequest(raw).createTime).toBe("2024-02-01");
    });

    it("falls back to created_at", () => {
      const raw = { ...base, created_at: "2024-03-01" };
      expect(normalizeFriendRequest(raw).createTime).toBe("2024-03-01");
    });

    it("prefers updateTime", () => {
      const raw = { ...base, updateTime: "2024-06-01", updatedAt: "2024-07-01" };
      expect(normalizeFriendRequest(raw).updateTime).toBe("2024-06-01");
    });

    it("falls back to updatedAt", () => {
      const raw = { ...base, updatedAt: "2024-07-01" };
      expect(normalizeFriendRequest(raw).updateTime).toBe("2024-07-01");
    });

    it("falls back to updated_at", () => {
      const raw = { ...base, updated_at: "2024-08-01" };
      expect(normalizeFriendRequest(raw).updateTime).toBe("2024-08-01");
    });

    it("updateTime is undefined when all sources absent", () => {
      expect(normalizeFriendRequest(base).updateTime).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles null input gracefully", () => {
      const result = normalizeFriendRequest(null);
      expect(result.id).toBe("");
      expect(result.applicantId).toBe("");
      expect(result.status).toBe("PENDING");
    });

    it("handles fromUser nested object", () => {
      const raw = {
        id: "r1",
        applicantId: "a1",
        fromUser: { username: "nested_user", nickname: "Nested", avatar: "n.png" },
      };
      expect(normalizeFriendRequest(raw).applicantUsername).toBe("nested_user");
      expect(normalizeFriendRequest(raw).applicantNickname).toBe("Nested");
      expect(normalizeFriendRequest(raw).applicantAvatar).toBe("n.png");
    });
  });
});
