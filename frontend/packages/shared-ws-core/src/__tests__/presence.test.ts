import { describe, it, expect } from "vitest";
import {
  normalizePresenceUserId,
  isOnlineStatusValue,
  applyPresenceToRecord,
  applyPresenceToSet,
} from "../presence.js";

// ---------------------------------------------------------------------------
// W14 — online status / presence pure functions
// W23 — 阶段四禁止事项 (test-only, no behavior change)
// W24 — 冲突处理规则 (unified Web Set / Mobile Record semantics)
// ---------------------------------------------------------------------------

// ===== 1. normalizePresenceUserId =====
describe("normalizePresenceUserId", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizePresenceUserId("  user1  ")).toBe("user1");
  });

  it("trims tabs and newlines", () => {
    expect(normalizePresenceUserId("\t\n user2 \n\t")).toBe("user2");
  });

  it("returns empty string for empty string input", () => {
    expect(normalizePresenceUserId("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizePresenceUserId("   ")).toBe("");
  });

  it("returns empty string for null", () => {
    expect(normalizePresenceUserId(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizePresenceUserId(undefined)).toBe("");
  });

  it("converts number to string and trims", () => {
    expect(normalizePresenceUserId(12345)).toBe("12345");
  });

  it("preserves a valid userId without extra spaces", () => {
    expect(normalizePresenceUserId("abc-123")).toBe("abc-123");
  });
});

// ===== 2. isOnlineStatusValue =====
describe("isOnlineStatusValue", () => {
  // ONLINE cases
  it("returns true for string 'ONLINE'", () => {
    expect(isOnlineStatusValue("ONLINE")).toBe(true);
  });

  it("returns true for string 'online'", () => {
    expect(isOnlineStatusValue("online")).toBe(true);
  });

  it("returns true for boolean true", () => {
    expect(isOnlineStatusValue(true)).toBe(true);
  });

  it("returns true for mixed case 'Online'", () => {
    expect(isOnlineStatusValue("Online")).toBe(true);
  });

  // OFFLINE cases
  it("returns false for string 'OFFLINE'", () => {
    expect(isOnlineStatusValue("OFFLINE")).toBe(false);
  });

  it("returns false for string 'offline'", () => {
    expect(isOnlineStatusValue("offline")).toBe(false);
  });

  it("returns false for boolean false", () => {
    expect(isOnlineStatusValue(false)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isOnlineStatusValue(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isOnlineStatusValue(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isOnlineStatusValue("")).toBe(false);
  });

  it("returns false for number 1", () => {
    expect(isOnlineStatusValue(1)).toBe(false);
  });

  it("returns false for number 0", () => {
    expect(isOnlineStatusValue(0)).toBe(false);
  });
});

// ===== 3. applyPresenceToRecord — immutability =====
describe("applyPresenceToRecord", () => {
  it("does not mutate the input record", () => {
    const original: Record<string, boolean> = { u1: true };
    const snapshot = { ...original };
    applyPresenceToRecord(original, "u2", "ONLINE");
    expect(original).toEqual(snapshot);
  });

  it("returns the same reference when userId is empty", () => {
    const record: Record<string, boolean> = { u1: true };
    const result = applyPresenceToRecord(record, "", "ONLINE");
    expect(result).toBe(record);
  });

  it("returns the same reference when userId is whitespace-only", () => {
    const record: Record<string, boolean> = { u1: true };
    const result = applyPresenceToRecord(record, "   ", "ONLINE");
    expect(result).toBe(record);
  });

  it("adds a new online user", () => {
    const record: Record<string, boolean> = { u1: true };
    const result = applyPresenceToRecord(record, "u2", "ONLINE");
    expect(result).toEqual({ u1: true, u2: true });
  });

  it("sets user to false for OFFLINE", () => {
    const record: Record<string, boolean> = { u1: true, u2: true };
    const result = applyPresenceToRecord(record, "u1", "OFFLINE");
    expect(result).toEqual({ u1: false, u2: true });
  });

  it("sets user to false for offline (lowercase)", () => {
    const record: Record<string, boolean> = { u1: true };
    const result = applyPresenceToRecord(record, "u1", "offline");
    expect(result).toEqual({ u1: false });
  });

  it("sets user to true for boolean true", () => {
    const record: Record<string, boolean> = {};
    const result = applyPresenceToRecord(record, "u1", true);
    expect(result).toEqual({ u1: true });
  });

  it("sets user to false for boolean false", () => {
    const record: Record<string, boolean> = { u1: true };
    const result = applyPresenceToRecord(record, "u1", false);
    expect(result).toEqual({ u1: false });
  });

  it("returns same reference when status does not change (already online)", () => {
    const record: Record<string, boolean> = { u1: true };
    const result = applyPresenceToRecord(record, "u1", "ONLINE");
    expect(result).toBe(record);
  });

  it("returns same reference when status does not change (already offline)", () => {
    const record: Record<string, boolean> = { u1: false };
    const result = applyPresenceToRecord(record, "u1", "OFFLINE");
    expect(result).toBe(record);
  });

  it("trims userId before applying", () => {
    const record: Record<string, boolean> = {};
    const result = applyPresenceToRecord(record, "  user1  ", "ONLINE");
    expect(result).toEqual({ user1: true });
  });

  it("handles empty record", () => {
    const record: Record<string, boolean> = {};
    const result = applyPresenceToRecord(record, "u1", "ONLINE");
    expect(result).toEqual({ u1: true });
  });
});

// ===== 4. applyPresenceToSet — immutability =====
describe("applyPresenceToSet", () => {
  it("does not mutate the input set", () => {
    const original = new Set(["u1"]);
    const snapshot = new Set(original);
    applyPresenceToSet(original, "u2", "ONLINE");
    expect(original).toEqual(snapshot);
  });

  it("returns the same reference when userId is empty", () => {
    const set = new Set(["u1"]);
    const result = applyPresenceToSet(set, "", "ONLINE");
    expect(result).toBe(set);
  });

  it("returns the same reference when userId is whitespace-only", () => {
    const set = new Set(["u1"]);
    const result = applyPresenceToSet(set, "   ", "ONLINE");
    expect(result).toBe(set);
  });

  it("adds a user when status is ONLINE", () => {
    const set = new Set(["u1"]);
    const result = applyPresenceToSet(set, "u2", "ONLINE");
    expect(result.has("u1")).toBe(true);
    expect(result.has("u2")).toBe(true);
    expect(result.size).toBe(2);
  });

  it("removes a user when status is OFFLINE", () => {
    const set = new Set(["u1", "u2"]);
    const result = applyPresenceToSet(set, "u1", "OFFLINE");
    expect(result.has("u1")).toBe(false);
    expect(result.has("u2")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("removes a user when status is offline (lowercase)", () => {
    const set = new Set(["u1"]);
    const result = applyPresenceToSet(set, "u1", "offline");
    expect(result.has("u1")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("adds a user for boolean true", () => {
    const set = new Set<string>();
    const result = applyPresenceToSet(set, "u1", true);
    expect(result.has("u1")).toBe(true);
  });

  it("removes a user for boolean false", () => {
    const set = new Set(["u1"]);
    const result = applyPresenceToSet(set, "u1", false);
    expect(result.has("u1")).toBe(false);
  });

  it("returns same reference when user already in set and status is ONLINE", () => {
    const set = new Set(["u1"]);
    const result = applyPresenceToSet(set, "u1", "ONLINE");
    expect(result).toBe(set);
  });

  it("returns same reference when user not in set and status is OFFLINE", () => {
    const set = new Set(["u1"]);
    const result = applyPresenceToSet(set, "u2", "OFFLINE");
    expect(result).toBe(set);
  });

  it("trims userId before applying", () => {
    const set = new Set<string>();
    const result = applyPresenceToSet(set, "  user1  ", "ONLINE");
    expect(result.has("user1")).toBe(true);
  });

  it("handles empty set", () => {
    const set = new Set<string>();
    const result = applyPresenceToSet(set, "u1", "ONLINE");
    expect(result.has("u1")).toBe(true);
    expect(result.size).toBe(1);
  });
});

// ===== 5. Repeated application stability =====
describe("repeated application stability", () => {
  it("applying ONLINE twice to Record yields same result", () => {
    const record: Record<string, boolean> = {};
    const first = applyPresenceToRecord(record, "u1", "ONLINE");
    const second = applyPresenceToRecord(first, "u1", "ONLINE");
    expect(first).toEqual({ u1: true });
    expect(second).toBe(first); // same reference, no change
  });

  it("applying OFFLINE twice to Record yields same result", () => {
    const record: Record<string, boolean> = { u1: true };
    const first = applyPresenceToRecord(record, "u1", "OFFLINE");
    const second = applyPresenceToRecord(first, "u1", "OFFLINE");
    expect(first).toEqual({ u1: false });
    expect(second).toBe(first);
  });

  it("applying ONLINE twice to Set yields same result", () => {
    const set = new Set<string>();
    const first = applyPresenceToSet(set, "u1", "ONLINE");
    const second = applyPresenceToSet(first, "u1", "ONLINE");
    expect(first.has("u1")).toBe(true);
    expect(second).toBe(first);
  });

  it("applying OFFLINE twice to Set yields same result", () => {
    const set = new Set(["u1"]);
    const first = applyPresenceToSet(set, "u1", "OFFLINE");
    const second = applyPresenceToSet(first, "u1", "OFFLINE");
    expect(first.has("u1")).toBe(false);
    expect(second).toBe(first);
  });

  it("toggle Record: ONLINE → OFFLINE → ONLINE is stable", () => {
    const record: Record<string, boolean> = {};
    const step1 = applyPresenceToRecord(record, "u1", "ONLINE");
    const step2 = applyPresenceToRecord(step1, "u1", "OFFLINE");
    const step3 = applyPresenceToRecord(step2, "u1", "ONLINE");
    expect(step1).toEqual({ u1: true });
    expect(step2).toEqual({ u1: false });
    expect(step3).toEqual({ u1: true });
    // Each step produced a new reference
    expect(step1).not.toBe(record);
    expect(step2).not.toBe(step1);
    expect(step3).not.toBe(step2);
  });

  it("toggle Set: ONLINE → OFFLINE → ONLINE is stable", () => {
    const set = new Set<string>();
    const step1 = applyPresenceToSet(set, "u1", "ONLINE");
    const step2 = applyPresenceToSet(step1, "u1", "OFFLINE");
    const step3 = applyPresenceToSet(step2, "u1", "ONLINE");
    expect(step1.has("u1")).toBe(true);
    expect(step2.has("u1")).toBe(false);
    expect(step3.has("u1")).toBe(true);
    expect(step1).not.toBe(set);
    expect(step2).not.toBe(step1);
    expect(step3).not.toBe(step2);
  });
});
