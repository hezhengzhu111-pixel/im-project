import { describe, expect, it } from "vitest";
import { compareSessions, sortSessions } from "../session-sort.js";
import type { ChatSession } from "@im/shared-types";

const makeSession = (overrides: Partial<ChatSession>): ChatSession => ({
  id: "s1",
  type: "private",
  targetId: "u1",
  targetName: "User 1",
  unreadCount: 0,
  ...overrides,
});

describe("sortSessions", () => {
  it("pinned 会话排在非 pinned 会话前面", () => {
    const sessions = [
      makeSession({ id: "a", isPinned: false, lastActiveTime: "2026-05-15T10:00:00Z" }),
      makeSession({ id: "b", isPinned: true, lastActiveTime: "2026-05-15T08:00:00Z" }),
      makeSession({ id: "c", isPinned: false, lastActiveTime: "2026-05-15T12:00:00Z" }),
    ];

    const result = sortSessions(sessions);

    expect(result.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("按 lastActiveTime 倒序排列", () => {
    const sessions = [
      makeSession({ id: "old", lastActiveTime: "2026-05-10T00:00:00Z" }),
      makeSession({ id: "new", lastActiveTime: "2026-05-15T00:00:00Z" }),
      makeSession({ id: "mid", lastActiveTime: "2026-05-12T00:00:00Z" }),
    ];

    const result = sortSessions(sessions);

    expect(result.map((s) => s.id)).toEqual(["new", "mid", "old"]);
  });

  it("无效时间按 0 处理，排到最后", () => {
    const sessions = [
      makeSession({ id: "valid", lastActiveTime: "2026-05-15T00:00:00Z" }),
      makeSession({ id: "empty", lastActiveTime: "" }),
      makeSession({ id: "undef", lastActiveTime: undefined }),
      makeSession({ id: "invalid", lastActiveTime: "not-a-date" }),
    ];

    const result = sortSessions(sessions);

    expect(result[0].id).toBe("valid");
    // 无效时间的会话排在最后，并保持输入顺序
    expect(result.slice(1).map((s) => s.id)).toEqual(["empty", "undef", "invalid"]);
  });

  it("兼容 pinned 和 isPinned 字段", () => {
    const sessions = [
      makeSession({ id: "a", isPinned: true, pinned: true, lastActiveTime: "2026-05-10T00:00:00Z" }),
      makeSession({ id: "b", isPinned: false, pinned: true, lastActiveTime: "2026-05-15T00:00:00Z" }),
      makeSession({ id: "c", isPinned: true, pinned: false, lastActiveTime: "2026-05-12T00:00:00Z" }),
      makeSession({ id: "d", isPinned: false, pinned: false, lastActiveTime: "2026-05-14T00:00:00Z" }),
    ];

    const result = sortSessions(sessions);

    // isPinned 优先于 pinned：b.isPinned=false 所以 b 不是置顶
    // 置顶组 (c, a) 按时间倒序，非置顶组 (b, d) 按时间倒序
    expect(result.map((s) => s.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("输入数组不被修改", () => {
    const sessions = [
      makeSession({ id: "a", lastActiveTime: "2026-05-10T00:00:00Z" }),
      makeSession({ id: "b", lastActiveTime: "2026-05-15T00:00:00Z" }),
    ];
    const originalOrder = [...sessions];

    const result = sortSessions(sessions);

    // 输入数组顺序不变
    expect(sessions.map((s) => s.id)).toEqual(originalOrder.map((s) => s.id));
    // 返回新数组
    expect(result).not.toBe(sessions);
    // 排序结果正确
    expect(result.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("相同时间保持输入顺序", () => {
    const sessions = [
      makeSession({ id: "c", lastActiveTime: "2026-05-15T00:00:00Z" }),
      makeSession({ id: "a", lastActiveTime: "2026-05-15T00:00:00Z" }),
      makeSession({ id: "b", lastActiveTime: "2026-05-15T00:00:00Z" }),
    ];

    const result = sortSessions(sessions);

    expect(result.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});

describe("compareSessions", () => {
  it("置顶优先于非置顶", () => {
    const pinned = makeSession({ id: "p", isPinned: true });
    const normal = makeSession({ id: "n", isPinned: false });

    expect(compareSessions(pinned, normal)).toBeLessThan(0);
    expect(compareSessions(normal, pinned)).toBeGreaterThan(0);
  });

  it("相同置顶状态按时间倒序", () => {
    const newer = makeSession({ id: "n", lastActiveTime: "2026-05-15T00:00:00Z" });
    const older = makeSession({ id: "o", lastActiveTime: "2026-05-10T00:00:00Z" });

    expect(compareSessions(newer, older)).toBeLessThan(0);
    expect(compareSessions(older, newer)).toBeGreaterThan(0);
  });

  it("时间相同返回 0", () => {
    const a = makeSession({ id: "same", lastActiveTime: "2026-05-15T00:00:00Z" });
    const b = makeSession({ id: "same", lastActiveTime: "2026-05-15T00:00:00Z" });

    expect(compareSessions(a, b)).toBe(0);
  });

  it("时间相同不按 id 排序", () => {
    const a = makeSession({ id: "aaa", lastActiveTime: "2026-05-15T00:00:00Z" });
    const b = makeSession({ id: "bbb", lastActiveTime: "2026-05-15T00:00:00Z" });

    expect(compareSessions(a, b)).toBe(0);
    expect(compareSessions(b, a)).toBe(0);
  });
});
