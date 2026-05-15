import { describe, it, expect } from "vitest";
import {
  classifyContactRefreshFromWsType,
  classifyContactRefreshFromSystemContent,
  mergeContactRefreshActions,
} from "../contact-refresh.js";

// ---------------------------------------------------------------------------
// W16 — friend request / friend accepted / contact refresh action classification
// W17 — system message command parsing
// W23 — 阶段四禁止事项 (test-only, no behavior change)
// W24 — 冲突处理规则 (unified Web/Mobile contact refresh semantics)
// ---------------------------------------------------------------------------

// ===== 1. classifyContactRefreshFromWsType =====
describe("classifyContactRefreshFromWsType", () => {
  // --- FRIEND_REQUEST ---
  it("FRIEND_REQUEST: sets loadFriendRequests only", () => {
    const result = classifyContactRefreshFromWsType("FRIEND_REQUEST");
    expect(result).toEqual({
      loadFriendRequests: true,
      loadFriends: false,
      loadSessions: false,
      notificationTitle: "Friend request",
      notificationMessage: "You have a new friend request",
      notificationType: "info",
    });
  });

  // --- FRIEND_ACCEPTED ---
  it("FRIEND_ACCEPTED: sets loadFriends + loadSessions", () => {
    const result = classifyContactRefreshFromWsType("FRIEND_ACCEPTED");
    expect(result).toEqual({
      loadFriendRequests: false,
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "Friend accepted",
      notificationMessage: "Your friend request was accepted",
      notificationType: "success",
    });
  });

  it("returns null for unrelated ws type", () => {
    expect(classifyContactRefreshFromWsType("MESSAGE")).toBeNull();
    expect(classifyContactRefreshFromWsType("HEARTBEAT")).toBeNull();
    expect(classifyContactRefreshFromWsType("ONLINE_STATUS")).toBeNull();
    expect(classifyContactRefreshFromWsType("READ_RECEIPT")).toBeNull();
    expect(classifyContactRefreshFromWsType("SYSTEM")).toBeNull();
    expect(classifyContactRefreshFromWsType("")).toBeNull();
  });
});

// ===== 2. classifyContactRefreshFromSystemContent =====
describe("classifyContactRefreshFromSystemContent", () => {
  // --- REFRESH_FRIEND_REQUESTS command ---
  it("::CMD:REFRESH_FRIEND_REQUESTS: sets loadFriendRequests only", () => {
    const result = classifyContactRefreshFromSystemContent(
      "You have a new friend request::CMD:REFRESH_FRIEND_REQUESTS",
    );
    expect(result).toEqual({
      loadFriendRequests: true,
      loadFriends: false,
      loadSessions: false,
      notificationTitle: "Friend notification",
      notificationMessage: "You have a new friend request",
      notificationType: "info",
    });
  });

  it("::CMD:REFRESH_FRIEND_REQUESTS with empty message text", () => {
    const result = classifyContactRefreshFromSystemContent(
      "::CMD:REFRESH_FRIEND_REQUESTS",
    );
    expect(result).toEqual({
      loadFriendRequests: true,
      loadFriends: false,
      loadSessions: false,
      notificationTitle: "Friend notification",
      notificationMessage: "Received a new friend request",
      notificationType: "info",
    });
  });

  // --- REFRESH_FRIEND_LIST command ---
  it("::CMD:REFRESH_FRIEND_LIST: sets loadFriends + loadSessions", () => {
    const result = classifyContactRefreshFromSystemContent(
      "Friend list updated::CMD:REFRESH_FRIEND_LIST",
    );
    expect(result).toEqual({
      loadFriendRequests: false,
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "Friend notification",
      notificationMessage: "Friend list updated",
      notificationType: "success",
    });
  });

  it("::CMD:REFRESH_FRIEND_LIST with empty message text", () => {
    const result = classifyContactRefreshFromSystemContent(
      "::CMD:REFRESH_FRIEND_LIST",
    );
    expect(result).toEqual({
      loadFriendRequests: false,
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "Friend notification",
      notificationMessage: "Friend list updated",
      notificationType: "success",
    });
  });

  // --- 中文"好友申请" ---
  it("中文'好友申请' triggers full refresh", () => {
    const result = classifyContactRefreshFromSystemContent(
      "你收到了一条好友申请",
    );
    expect(result).toEqual({
      loadFriendRequests: true,
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "System notification",
      notificationMessage: "你收到了一条好友申请",
      notificationType: "info",
    });
  });

  // --- 中文"同意" ---
  it("中文'同意' triggers full refresh", () => {
    const result = classifyContactRefreshFromSystemContent(
      "对方同意了你的好友请求",
    );
    expect(result).toEqual({
      loadFriendRequests: true,
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "System notification",
      notificationMessage: "对方同意了你的好友请求",
      notificationType: "info",
    });
  });

  // --- 英文 "friend request" ---
  it("english 'friend request' triggers full refresh (case-insensitive)", () => {
    const result = classifyContactRefreshFromSystemContent(
      "You received a new Friend Request",
    );
    expect(result).toEqual({
      loadFriendRequests: true,
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "System notification",
      notificationMessage: "You received a new Friend Request",
      notificationType: "info",
    });
  });

  it("english 'FRIEND REQUEST' uppercase triggers full refresh", () => {
    const result = classifyContactRefreshFromSystemContent(
      "FRIEND REQUEST from Alice",
    );
    expect(result).toEqual({
      loadFriendRequests: true,
      loadFriends: true,
      loadSessions: true,
      notificationTitle: "System notification",
      notificationMessage: "FRIEND REQUEST from Alice",
      notificationType: "info",
    });
  });

  // --- 无关 system content 返回 null ---
  it("unrelated system content returns null", () => {
    expect(classifyContactRefreshFromSystemContent("")).toBeNull();
    expect(classifyContactRefreshFromSystemContent("Hello world")).toBeNull();
    expect(classifyContactRefreshFromSystemContent("系统维护通知")).toBeNull();
    expect(classifyContactRefreshFromSystemContent("Your message was recalled")).toBeNull();
    expect(classifyContactRefreshFromSystemContent("::CMD:UNKNOWN_CMD")).toBeNull();
  });
});

// ===== 3. mergeContactRefreshActions =====
describe("mergeContactRefreshActions", () => {
  const empty = {
    loadFriendRequests: false,
    loadFriends: false,
    loadSessions: false,
  };

  it("OR-merges boolean flags (both false → false)", () => {
    const result = mergeContactRefreshActions(empty, empty);
    expect(result.loadFriendRequests).toBe(false);
    expect(result.loadFriends).toBe(false);
    expect(result.loadSessions).toBe(false);
  });

  it("OR-merges boolean flags (left true wins)", () => {
    const left = { ...empty, loadFriendRequests: true };
    const result = mergeContactRefreshActions(left, empty);
    expect(result.loadFriendRequests).toBe(true);
  });

  it("OR-merges boolean flags (right true wins)", () => {
    const right = { ...empty, loadFriends: true };
    const result = mergeContactRefreshActions(empty, right);
    expect(result.loadFriends).toBe(true);
  });

  it("OR-merges boolean flags (both true → true)", () => {
    const left = { ...empty, loadFriendRequests: true, loadSessions: true };
    const right = { ...empty, loadFriends: true, loadSessions: true };
    const result = mergeContactRefreshActions(left, right);
    expect(result.loadFriendRequests).toBe(true);
    expect(result.loadFriends).toBe(true);
    expect(result.loadSessions).toBe(true);
  });

  it("left notification fields take precedence over right", () => {
    const left = {
      ...empty,
      notificationTitle: "Left title",
      notificationMessage: "Left message",
      notificationType: "info" as const,
    };
    const right = {
      ...empty,
      notificationTitle: "Right title",
      notificationMessage: "Right message",
      notificationType: "success" as const,
    };
    const result = mergeContactRefreshActions(left, right);
    expect(result.notificationTitle).toBe("Left title");
    expect(result.notificationMessage).toBe("Left message");
    expect(result.notificationType).toBe("info");
  });

  it("right notification fields fill in when left is empty", () => {
    const left = { ...empty };
    const right = {
      ...empty,
      notificationTitle: "Right title",
      notificationMessage: "Right message",
      notificationType: "success" as const,
    };
    const result = mergeContactRefreshActions(left, right);
    expect(result.notificationTitle).toBe("Right title");
    expect(result.notificationMessage).toBe("Right message");
    expect(result.notificationType).toBe("success");
  });

  it("merge is idempotent when merging identical actions", () => {
    const action = {
      loadFriendRequests: true,
      loadFriends: false,
      loadSessions: true,
      notificationTitle: "Title",
      notificationMessage: "Msg",
      notificationType: "info" as const,
    };
    const result = mergeContactRefreshActions(action, action);
    expect(result).toEqual(action);
  });
});
