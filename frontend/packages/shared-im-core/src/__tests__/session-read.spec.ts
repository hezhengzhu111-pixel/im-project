import { describe, expect, it } from "vitest";
import { markSessionRead, markSessionsRead } from "../session-read.js";
import type { ChatSession, Message } from "@im/shared-types";

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: "s1",
  type: "private",
  targetId: "u1",
  targetName: "User 1",
  unreadCount: 5,
  ...overrides,
});

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "m1",
  senderId: "u2",
  isGroupChat: false,
  messageType: "TEXT",
  content: "hello",
  sendTime: "2026-05-15T10:00:00Z",
  status: "SENT",
  ...overrides,
});

describe("markSessionRead", () => {
  it("unreadCount 清零", () => {
    const session = makeSession({ unreadCount: 10 });
    const result = markSessionRead(session);
    expect(result.unreadCount).toBe(0);
  });

  it("保留 lastMessage", () => {
    const msg = makeMessage();
    const session = makeSession({ lastMessage: msg, unreadCount: 3 });
    const result = markSessionRead(session);
    expect(result.lastMessage).toBe(msg);
  });

  it("保留 lastActiveTime", () => {
    const session = makeSession({
      lastActiveTime: "2026-05-15T10:00:00Z",
      unreadCount: 1,
    });
    const result = markSessionRead(session);
    expect(result.lastActiveTime).toBe("2026-05-15T10:00:00Z");
  });

  it("保留 pinned / muted 状态", () => {
    const session = makeSession({
      isPinned: true,
      pinned: true,
      isMuted: true,
      muted: true,
      unreadCount: 2,
    });
    const result = markSessionRead(session);
    expect(result.isPinned).toBe(true);
    expect(result.pinned).toBe(true);
    expect(result.isMuted).toBe(true);
    expect(result.muted).toBe(true);
  });

  it("输入对象不被修改", () => {
    const session = makeSession({ unreadCount: 5 });
    const original = { ...session };
    markSessionRead(session);
    expect(session.unreadCount).toBe(original.unreadCount);
    expect(session).toEqual(original);
  });

  it("unreadCount 已为 0 时返回同一引用", () => {
    const session = makeSession({ unreadCount: 0 });
    const result = markSessionRead(session);
    expect(result).toBe(session);
  });
});

describe("markSessionsRead", () => {
  it("目标 session 的 unreadCount 清零", () => {
    const sessions = [
      makeSession({ id: "a", unreadCount: 3 }),
      makeSession({ id: "b", unreadCount: 7 }),
      makeSession({ id: "c", unreadCount: 1 }),
    ];
    const result = markSessionsRead(sessions, "b");
    expect(result.find((s) => s.id === "b")?.unreadCount).toBe(0);
  });

  it("非目标 session 不变", () => {
    const sessions = [
      makeSession({ id: "a", unreadCount: 3 }),
      makeSession({ id: "b", unreadCount: 7 }),
      makeSession({ id: "c", unreadCount: 1 }),
    ];
    const result = markSessionsRead(sessions, "b");
    expect(result.find((s) => s.id === "a")?.unreadCount).toBe(3);
    expect(result.find((s) => s.id === "c")?.unreadCount).toBe(1);
  });

  it("输入数组不被修改", () => {
    const sessions = [
      makeSession({ id: "a", unreadCount: 3 }),
      makeSession({ id: "b", unreadCount: 7 }),
    ];
    const originalIds = sessions.map((s) => s.id);
    const originalUnread = sessions.map((s) => s.unreadCount);
    markSessionsRead(sessions, "b");
    expect(sessions.map((s) => s.id)).toEqual(originalIds);
    expect(sessions.map((s) => s.unreadCount)).toEqual(originalUnread);
  });

  it("输入数组中的对象不被修改", () => {
    const sessionB = makeSession({ id: "b", unreadCount: 7 });
    const sessions = [makeSession({ id: "a", unreadCount: 3 }), sessionB];
    markSessionsRead(sessions, "b");
    expect(sessionB.unreadCount).toBe(7);
  });

  it("保留目标 session 的 pinned/muted/lastMessage", () => {
    const msg = makeMessage();
    const sessions = [
      makeSession({
        id: "a",
        unreadCount: 5,
        isPinned: true,
        isMuted: true,
        lastMessage: msg,
        lastActiveTime: "2026-05-15T10:00:00Z",
      }),
    ];
    const result = markSessionsRead(sessions, "a");
    const target = result[0];
    expect(target.unreadCount).toBe(0);
    expect(target.isPinned).toBe(true);
    expect(target.isMuted).toBe(true);
    expect(target.lastMessage).toBe(msg);
    expect(target.lastActiveTime).toBe("2026-05-15T10:00:00Z");
  });

  it("目标 session 不存在时返回同一引用", () => {
    const sessions = [
      makeSession({ id: "a", unreadCount: 3 }),
      makeSession({ id: "b", unreadCount: 0 }),
    ];
    const result = markSessionsRead(sessions, "nonexistent");
    expect(result).toBe(sessions);
  });

  it("目标 session unreadCount 已为 0 时返回同一引用", () => {
    const sessions = [
      makeSession({ id: "a", unreadCount: 3 }),
      makeSession({ id: "b", unreadCount: 0 }),
    ];
    const result = markSessionsRead(sessions, "b");
    expect(result).toBe(sessions);
  });
});
