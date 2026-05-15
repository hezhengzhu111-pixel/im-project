import { describe, it, expect } from "vitest";
import { normalizeGroup, normalizeGroupMember } from "../group.js";

describe("normalizeGroup", () => {
  describe("id / groupId", () => {
    it("prefers id", () => {
      const raw = { id: "g1", groupId: "g2", ownerId: "u1" };
      expect(normalizeGroup(raw).id).toBe("g1");
    });

    it("falls back to groupId", () => {
      const raw = { groupId: "g2", ownerId: "u1" };
      expect(normalizeGroup(raw).id).toBe("g2");
    });

    it("falls back to group_id", () => {
      const raw = { group_id: "g3", ownerId: "u1" };
      expect(normalizeGroup(raw).id).toBe("g3");
    });

    it("converts numeric id to string", () => {
      const raw = { id: 12345, ownerId: "u1" };
      expect(normalizeGroup(raw).id).toBe("12345");
    });
  });

  describe("groupName / name", () => {
    it("prefers groupName", () => {
      const raw = { id: "g1", ownerId: "u1", groupName: "My Group", name: "Alt" };
      expect(normalizeGroup(raw).groupName).toBe("My Group");
    });

    it("falls back to group_name", () => {
      const raw = { id: "g1", ownerId: "u1", group_name: "Snake Group" };
      expect(normalizeGroup(raw).groupName).toBe("Snake Group");
    });

    it("falls back to name", () => {
      const raw = { id: "g1", ownerId: "u1", name: "Name Group" };
      expect(normalizeGroup(raw).groupName).toBe("Name Group");
    });

    it("maps name separately", () => {
      const raw = { id: "g1", ownerId: "u1", name: "Team Name" };
      expect(normalizeGroup(raw).name).toBe("Team Name");
    });

    it("name is undefined when empty", () => {
      const raw = { id: "g1", ownerId: "u1" };
      expect(normalizeGroup(raw).name).toBeUndefined();
    });
  });

  describe("avatar / announcement / description", () => {
    it("maps avatar", () => {
      const raw = { id: "g1", ownerId: "u1", avatar: "gav.png" };
      expect(normalizeGroup(raw).avatar).toBe("gav.png");
    });

    it("avatar is undefined when empty", () => {
      const raw = { id: "g1", ownerId: "u1", avatar: "" };
      expect(normalizeGroup(raw).avatar).toBeUndefined();
    });

    it("maps announcement", () => {
      const raw = { id: "g1", ownerId: "u1", announcement: "Welcome!" };
      expect(normalizeGroup(raw).announcement).toBe("Welcome!");
    });

    it("announcement is undefined when empty", () => {
      const raw = { id: "g1", ownerId: "u1" };
      expect(normalizeGroup(raw).announcement).toBeUndefined();
    });

    it("description prefers explicit description", () => {
      const raw = { id: "g1", ownerId: "u1", description: "Desc", announcement: "Ann" };
      expect(normalizeGroup(raw).description).toBe("Desc");
    });

    it("description falls back to announcement", () => {
      const raw = { id: "g1", ownerId: "u1", announcement: "Ann only" };
      expect(normalizeGroup(raw).description).toBe("Ann only");
    });
  });

  describe("ownerId", () => {
    it("maps ownerId", () => {
      const raw = { id: "g1", ownerId: "owner1" };
      expect(normalizeGroup(raw).ownerId).toBe("owner1");
    });

    it("falls back to owner_id", () => {
      const raw = { id: "g1", owner_id: "owner2" };
      expect(normalizeGroup(raw).ownerId).toBe("owner2");
    });

    it("converts numeric ownerId to string", () => {
      const raw = { id: "g1", ownerId: 999 };
      expect(normalizeGroup(raw).ownerId).toBe("999");
    });
  });

  describe("memberCount", () => {
    it("maps numeric memberCount", () => {
      const raw = { id: "g1", ownerId: "u1", memberCount: 42 };
      expect(normalizeGroup(raw).memberCount).toBe(42);
    });

    it("falls back to member_count", () => {
      const raw = { id: "g1", ownerId: "u1", member_count: 10 };
      expect(normalizeGroup(raw).memberCount).toBe(10);
    });

    it("converts string memberCount to number", () => {
      const raw = { id: "g1", ownerId: "u1", memberCount: "25" };
      expect(normalizeGroup(raw).memberCount).toBe(25);
    });

    it("defaults to 0 when absent", () => {
      const raw = { id: "g1", ownerId: "u1" };
      expect(normalizeGroup(raw).memberCount).toBe(0);
    });
  });

  describe("lastMessageTime / lastActivityAt", () => {
    it("maps lastMessageTime", () => {
      const raw = { id: "g1", ownerId: "u1", lastMessageTime: "2024-06-01T12:00:00Z" };
      expect(normalizeGroup(raw).lastMessageTime).toBe("2024-06-01T12:00:00Z");
    });

    it("lastMessageTime is undefined when absent", () => {
      const raw = { id: "g1", ownerId: "u1" };
      expect(normalizeGroup(raw).lastMessageTime).toBeUndefined();
    });

    it("maps lastActivityAt", () => {
      const raw = { id: "g1", ownerId: "u1", lastActivityAt: "2024-06-02T12:00:00Z" };
      expect(normalizeGroup(raw).lastActivityAt).toBe("2024-06-02T12:00:00Z");
    });

    it("lastActivityAt is undefined when absent", () => {
      const raw = { id: "g1", ownerId: "u1" };
      expect(normalizeGroup(raw).lastActivityAt).toBeUndefined();
    });
  });

  describe("other fields", () => {
    it("maps type", () => {
      expect(normalizeGroup({ id: "g1", ownerId: "u1", type: 1 }).type).toBe(1);
    });

    it("maps status", () => {
      expect(normalizeGroup({ id: "g1", ownerId: "u1", status: 1 }).status).toBe(1);
    });

    it("maps maxMembers", () => {
      expect(normalizeGroup({ id: "g1", ownerId: "u1", maxMembers: 500 }).maxMembers).toBe(500);
    });

    it("maxMembers is undefined for non-finite", () => {
      expect(normalizeGroup({ id: "g1", ownerId: "u1", maxMembers: "abc" } as Record<string, unknown>).maxMembers).toBeUndefined();
    });

    it("maps unreadCount", () => {
      expect(normalizeGroup({ id: "g1", ownerId: "u1", unreadCount: 5 }).unreadCount).toBe(5);
    });

    it("unreadCount is undefined for non-finite", () => {
      expect(normalizeGroup({ id: "g1", ownerId: "u1", unreadCount: "abc" } as Record<string, unknown>).unreadCount).toBeUndefined();
    });

    it("maps createTime", () => {
      expect(normalizeGroup({ id: "g1", ownerId: "u1", createTime: "2024-01-01" }).createTime).toBe("2024-01-01");
    });
  });

  describe("edge cases", () => {
    it("handles null input", () => {
      const result = normalizeGroup(null);
      expect(result.id).toBe("");
      expect(result.ownerId).toBe("");
      expect(result.memberCount).toBe(0);
      expect(result.createTime).toBe("");
    });

    it("all optional fields are undefined for minimal input", () => {
      const result = normalizeGroup({ id: "g1", ownerId: "u1" });
      expect(result.name).toBeUndefined();
      expect(result.avatar).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.announcement).toBeUndefined();
      expect(result.type).toBeUndefined();
      expect(result.maxMembers).toBeUndefined();
      expect(result.status).toBeUndefined();
      expect(result.unreadCount).toBeUndefined();
      expect(result.lastMessageTime).toBeUndefined();
      expect(result.lastActivityAt).toBeUndefined();
    });
  });
});

describe("normalizeGroupMember", () => {
  describe("userId", () => {
    it("prefers userId", () => {
      const raw = { userId: "u1", id: "i1", role: 1 };
      expect(normalizeGroupMember(raw).userId).toBe("u1");
    });

    it("falls back to user_id", () => {
      const raw = { user_id: "u2", role: 1 };
      expect(normalizeGroupMember(raw).userId).toBe("u2");
    });

    it("falls back to id when userId and user_id absent", () => {
      const raw = { id: "u3", role: 1 };
      expect(normalizeGroupMember(raw).userId).toBe("u3");
    });
  });

  describe("username / nickname / avatar", () => {
    it("maps username", () => {
      const raw = { userId: "u1", username: "alice", role: 1 };
      expect(normalizeGroupMember(raw).username).toBe("alice");
    });

    it("username is undefined when absent", () => {
      const raw = { userId: "u1", role: 1 };
      expect(normalizeGroupMember(raw).username).toBeUndefined();
    });

    it("maps nickname", () => {
      const raw = { userId: "u1", nickname: "Alice", role: 1 };
      expect(normalizeGroupMember(raw).nickname).toBe("Alice");
    });

    it("maps avatar", () => {
      const raw = { userId: "u1", avatar: "av.png", role: 1 };
      expect(normalizeGroupMember(raw).avatar).toBe("av.png");
    });
  });

  describe("role normalization", () => {
    it("3 → OWNER", () => {
      expect(normalizeGroupMember({ userId: "u1", role: 3 }).role).toBe("OWNER");
    });

    it("'3' → OWNER", () => {
      expect(normalizeGroupMember({ userId: "u1", role: "3" }).role).toBe("OWNER");
    });

    it("'OWNER' → OWNER", () => {
      expect(normalizeGroupMember({ userId: "u1", role: "OWNER" }).role).toBe("OWNER");
    });

    it("2 → ADMIN", () => {
      expect(normalizeGroupMember({ userId: "u1", role: 2 }).role).toBe("ADMIN");
    });

    it("'2' → ADMIN", () => {
      expect(normalizeGroupMember({ userId: "u1", role: "2" }).role).toBe("ADMIN");
    });

    it("'ADMIN' → ADMIN", () => {
      expect(normalizeGroupMember({ userId: "u1", role: "ADMIN" }).role).toBe("ADMIN");
    });

    it("1 → MEMBER", () => {
      expect(normalizeGroupMember({ userId: "u1", role: 1 }).role).toBe("MEMBER");
    });

    it("'1' → MEMBER", () => {
      expect(normalizeGroupMember({ userId: "u1", role: "1" }).role).toBe("MEMBER");
    });

    it("unknown role → MEMBER", () => {
      expect(normalizeGroupMember({ userId: "u1", role: 99 }).role).toBe("MEMBER");
      expect(normalizeGroupMember({ userId: "u1", role: "MODERATOR" }).role).toBe("MEMBER");
    });
  });

  describe("id and groupId", () => {
    it("maps id", () => {
      const raw = { id: "m1", userId: "u1", role: 1 };
      expect(normalizeGroupMember(raw).id).toBe("m1");
    });

    it("id is undefined when absent", () => {
      const raw = { userId: "u1", role: 1 };
      expect(normalizeGroupMember(raw).id).toBeUndefined();
    });

    it("maps groupId", () => {
      const raw = { userId: "u1", groupId: "g1", role: 1 };
      expect(normalizeGroupMember(raw).groupId).toBe("g1");
    });

    it("falls back to group_id", () => {
      const raw = { userId: "u1", group_id: "g2", role: 1 };
      expect(normalizeGroupMember(raw).groupId).toBe("g2");
    });
  });

  describe("joinTime", () => {
    it("maps joinTime", () => {
      const raw = { userId: "u1", role: 1, joinTime: "2024-01-01" };
      expect(normalizeGroupMember(raw).joinTime).toBe("2024-01-01");
    });

    it("joinTime defaults to empty string when absent", () => {
      const raw = { userId: "u1", role: 1 };
      expect(normalizeGroupMember(raw).joinTime).toBe("");
    });
  });

  describe("edge cases", () => {
    it("handles null input", () => {
      const result = normalizeGroupMember(null);
      expect(result.userId).toBe("");
      expect(result.role).toBe("MEMBER");
      expect(result.joinTime).toBe("");
    });
  });
});
