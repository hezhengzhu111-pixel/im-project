import { describe, it, expect } from "vitest";
import {
  getMessageDedupKey,
  shouldDropRecentMessage,
  rememberRecentMessage,
  cleanupRecentMessages,
} from "../duplicate-message";

// ── getMessageDedupKey ────────────────────────────────────────────────

describe("getMessageDedupKey", () => {
  it("优先使用 id（string）", () => {
    expect(
      getMessageDedupKey({
        id: "msg-001",
        messageId: "msg-002",
        clientMessageId: "local_003",
      }),
    ).toBe("msg-001");
  });

  it("id 为 number 时转为 string", () => {
    expect(getMessageDedupKey({ id: 12345 })).toBe("12345");
  });

  it("无 id 时使用 messageId（string）", () => {
    expect(
      getMessageDedupKey({
        messageId: "msg-002",
        clientMessageId: "local_003",
      }),
    ).toBe("msg-002");
  });

  it("messageId 为 number 时转为 string", () => {
    expect(getMessageDedupKey({ messageId: 99999 })).toBe("99999");
  });

  it("无 id/messageId 时使用 clientMessageId", () => {
    expect(
      getMessageDedupKey({ clientMessageId: "local_abc" }),
    ).toBe("local_abc");
  });

  it("三者都缺失时返回空字符串", () => {
    expect(getMessageDedupKey({})).toBe("");
    expect(getMessageDedupKey({ content: "hello" })).toBe("");
  });

  it("空字符串 id 被跳过，回退到 messageId", () => {
    expect(
      getMessageDedupKey({ id: "", messageId: "fallback" }),
    ).toBe("fallback");
  });
});

// ── shouldDropRecentMessage ───────────────────────────────────────────

describe("shouldDropRecentMessage", () => {
  const TTL = 60_000;

  it("空 key 不 drop", () => {
    const map = new Map([["k", 1000]]);
    expect(shouldDropRecentMessage(map, "", 2000, TTL)).toBe(false);
  });

  it("key 不在 map 中不 drop", () => {
    const map = new Map<string, number>();
    expect(shouldDropRecentMessage(map, "unknown", 2000, TTL)).toBe(false);
  });

  it("TTL 内重复 drop", () => {
    const map = new Map([["k", 1000]]);
    expect(shouldDropRecentMessage(map, "k", 1000 + TTL - 1, TTL)).toBe(true);
    expect(shouldDropRecentMessage(map, "k", 1000 + TTL - 100, TTL)).toBe(
      true,
    );
  });

  it("TTL 外不 drop", () => {
    const map = new Map([["k", 1000]]);
    expect(shouldDropRecentMessage(map, "k", 1000 + TTL, TTL)).toBe(false);
    expect(shouldDropRecentMessage(map, "k", 1000 + TTL + 1, TTL)).toBe(
      false,
    );
  });

  it("刚好等于 TTL 边界时不 drop（nowMs - previous === ttlMs）", () => {
    const map = new Map([["k", 1000]]);
    expect(shouldDropRecentMessage(map, "k", 1000 + TTL, TTL)).toBe(false);
  });
});

// ── rememberRecentMessage ─────────────────────────────────────────────

describe("rememberRecentMessage", () => {
  it("空 key 返回新 Map 但不插入条目", () => {
    const original = new Map([["a", 1]]);
    const result = rememberRecentMessage(original, "", 100, 100, 60_000);
    expect(result.size).toBe(1);
    expect(result.get("a")).toBe(1);
    expect(result).not.toBe(original); // 不是同一个引用
  });

  it("插入新 key 并返回新 Map", () => {
    const original = new Map<string, number>();
    const result = rememberRecentMessage(original, "k", 500, 100, 60_000);
    expect(result.get("k")).toBe(500);
    expect(result).not.toBe(original);
    expect(original.size).toBe(0); // 输入未被修改
  });

  it("覆盖已存在的 key 的时间戳", () => {
    const original = new Map([["k", 100]]);
    const result = rememberRecentMessage(original, "k", 999, 100, 60_000);
    expect(result.get("k")).toBe(999);
    expect(original.get("k")).toBe(100); // 输入未被修改
  });

  it("超过 maxSize 时先清理过期条目", () => {
    const ttl = 1000;
    const original = new Map([
      ["old1", 10],
      ["old2", 20],
      ["keep", 900],
    ]);
    // maxSize=3, 插入后=4, 先删过期（10,20 < 1000-1000=0 不过期），再删最老
    const result = rememberRecentMessage(original, "new", 1000, 3, ttl);
    expect(result.size).toBeLessThanOrEqual(3);
  });

  it("超过 maxSize 时清理最老条目", () => {
    const original = new Map([
      ["a", 100],
      ["b", 200],
      ["c", 300],
    ]);
    // maxSize=3, 插入后=4, 没有过期条目，删最老的 "a"
    const result = rememberRecentMessage(original, "d", 400, 3, 60_000);
    expect(result.size).toBe(3);
    expect(result.has("a")).toBe(false); // 最老的被删
    expect(result.has("d")).toBe(true);
  });

  it("输入 Map 不被修改", () => {
    const original = new Map([
      ["x", 1],
      ["y", 2],
    ]);
    const originalSize = original.size;
    const originalSnapshot = new Map(original);

    rememberRecentMessage(original, "z", 99, 2, 60_000);

    expect(original.size).toBe(originalSize);
    for (const [k, v] of originalSnapshot) {
      expect(original.get(k)).toBe(v);
    }
  });
});

// ── cleanupRecentMessages ─────────────────────────────────────────────

describe("cleanupRecentMessages", () => {
  it("移除过期条目", () => {
    const original = new Map([
      ["old", 100],
      ["keep", 900],
    ]);
    const result = cleanupRecentMessages(original, 1000, 200);
    // cutoff = 1000-200=800, "old"(100) 过期, "keep"(900) 保留
    expect(result.has("old")).toBe(false);
    expect(result.has("keep")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("所有条目都过期时返回空 Map", () => {
    const original = new Map([
      ["a", 10],
      ["b", 20],
    ]);
    const result = cleanupRecentMessages(original, 1000, 100);
    expect(result.size).toBe(0);
  });

  it("没有过期条目时返回新 Map（相同内容）", () => {
    const original = new Map([
      ["a", 900],
      ["b", 950],
    ]);
    const result = cleanupRecentMessages(original, 1000, 200);
    expect(result.size).toBe(2);
    expect(result.get("a")).toBe(900);
    expect(result.get("b")).toBe(950);
    expect(result).not.toBe(original); // 不是同一个引用
  });

  it("空 Map 返回空 Map", () => {
    const original = new Map<string, number>();
    const result = cleanupRecentMessages(original, 1000, 200);
    expect(result.size).toBe(0);
    expect(result).not.toBe(original);
  });

  it("输入 Map 不被修改", () => {
    const original = new Map([
      ["old", 100],
      ["keep", 900],
    ]);
    const originalSize = original.size;

    cleanupRecentMessages(original, 1000, 200);

    expect(original.size).toBe(originalSize);
    expect(original.has("old")).toBe(true); // 原始 Map 未被修改
  });
});

// ── immutability contract ─────────────────────────────────────────────

describe("输入 Map 不被修改（不可变性契约）", () => {
  it("所有函数均不修改输入 Map", () => {
    const original = new Map([
      ["msg-1", 1000],
      ["msg-2", 2000],
      ["msg-3", 3000],
    ]);
    const snapshot = new Map(original);

    shouldDropRecentMessage(original, "msg-1", 1500, 60_000);
    rememberRecentMessage(original, "msg-4", 4000, 5, 60_000);
    cleanupRecentMessages(original, 5000, 60_000);

    // 验证原始 Map 完全未变
    expect(original.size).toBe(snapshot.size);
    for (const [k, v] of snapshot) {
      expect(original.get(k)).toBe(v);
    }
  });
});
