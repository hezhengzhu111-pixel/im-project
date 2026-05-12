import { describe, it, expect } from "vitest";
import {
  toBigIntId,
  compareIds,
  buildSessionId,
  sortMessagesAscending,
  dedupeMessages,
  limitMessageWindow,
  mergeMessagesChronologically,
  messageIdentityValues,
  hasSameMessageIdentity,
  MESSAGE_WINDOW_SIZE,
} from "../index.js";
import type { Message } from "@im/shared-types";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "1",
    senderId: "u1",
    isGroupChat: false,
    messageType: "TEXT",
    content: "",
    sendTime: "2024-01-01T00:00:00.000Z",
    status: "SENT",
    ...overrides,
  };
}

describe("toBigIntId", () => {
  it("converts a numeric string to bigint", () => {
    expect(toBigIntId("12345678901234567890")).toBe(12345678901234567890n);
  });

  it("converts a safe integer number to bigint", () => {
    expect(toBigIntId(42)).toBe(42n);
  });

  it("converts a bigint directly", () => {
    expect(toBigIntId(999n)).toBe(999n);
  });

  it("returns null for null/undefined", () => {
    expect(toBigIntId(null)).toBeNull();
    expect(toBigIntId(undefined)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(toBigIntId("abc")).toBeNull();
    expect(toBigIntId("")).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(toBigIntId(NaN)).toBeNull();
  });

  it("returns null for Infinity", () => {
    expect(toBigIntId(Infinity)).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(toBigIntId(-1)).toBeNull();
  });

  it("returns null for unsafe integers", () => {
    expect(toBigIntId(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });

  it("returns null for non-integer numbers", () => {
    expect(toBigIntId(1.5)).toBeNull();
  });
});

describe("compareIds", () => {
  it("returns 0 for equal numeric IDs", () => {
    expect(compareIds("100", "100")).toBe(0);
  });

  it("returns -1 when left < right", () => {
    expect(compareIds("1", "2")).toBe(-1);
  });

  it("returns 1 when left > right", () => {
    expect(compareIds("2", "1")).toBe(1);
  });

  it("compares bigint-safe large numbers correctly", () => {
    expect(compareIds("9007199254740993", "9007199254740994")).toBe(-1);
  });

  it("falls back to string comparison for non-numeric IDs", () => {
    expect(compareIds("abc", "def")).toBeLessThan(0);
    expect(compareIds("def", "abc")).toBeGreaterThan(0);
    expect(compareIds("abc", "abc")).toBe(0);
  });
});

describe("buildSessionId", () => {
  it("builds group session ID", () => {
    expect(buildSessionId("group", "u1", "g1")).toBe("group_g1");
  });

  it("builds private session ID with smaller ID first", () => {
    expect(buildSessionId("private", "100", "200")).toBe("100_200");
    expect(buildSessionId("private", "200", "100")).toBe("100_200");
  });

  it("builds private session ID for equal IDs", () => {
    expect(buildSessionId("private", "100", "100")).toBe("100_100");
  });
});

describe("sortMessagesAscending", () => {
  it("sorts by sendTime ascending", () => {
    const messages = [
      makeMessage({ id: "1", sendTime: "2024-01-03T00:00:00.000Z" }),
      makeMessage({ id: "2", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "3", sendTime: "2024-01-02T00:00:00.000Z" }),
    ];
    const sorted = messages.slice().sort(sortMessagesAscending);
    expect(sorted.map((m) => m.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by id when times are equal", () => {
    const messages = [
      makeMessage({ id: "b", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "a", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const sorted = messages.slice().sort(sortMessagesAscending);
    expect(sorted.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("dedupeMessages", () => {
  it("removes duplicates by id", () => {
    const messages = [
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "2", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("removes duplicates by messageId", () => {
    const messages = [
      makeMessage({ id: "1", messageId: "m1", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "2", messageId: "m1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(1);
  });

  it("removes duplicates by clientMessageId", () => {
    const messages = [
      makeMessage({ id: "1", clientMessageId: "cm1", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "2", clientMessageId: "cm1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(1);
  });

  it("keeps all unique messages", () => {
    const messages = [
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "2", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "3", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(3);
  });

  it("handles empty array", () => {
    expect(dedupeMessages([])).toEqual([]);
  });
});

describe("limitMessageWindow", () => {
  it("returns all messages if within window size", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMessage({ id: String(i), sendTime: `2024-01-01T00:00:0${i}.000Z` }),
    );
    const result = limitMessageWindow(messages);
    expect(result).toHaveLength(10);
  });

  it("limits to latest messages by default", () => {
    const messages = Array.from({ length: 60 }, (_, i) =>
      makeMessage({ id: String(i), sendTime: `2024-01-01T00:${String(i).padStart(2, "0")}:00.000Z` }),
    );
    const result = limitMessageWindow(messages);
    expect(result).toHaveLength(MESSAGE_WINDOW_SIZE);
    // Should keep the latest 50
    expect(result[0].id).toBe("10");
    expect(result[result.length - 1].id).toBe("59");
  });

  it("limits to oldest messages when keep='oldest'", () => {
    const messages = Array.from({ length: 60 }, (_, i) =>
      makeMessage({ id: String(i), sendTime: `2024-01-01T00:${String(i).padStart(2, "0")}:00.000Z` }),
    );
    const result = limitMessageWindow(messages, "oldest");
    expect(result).toHaveLength(MESSAGE_WINDOW_SIZE);
    expect(result[0].id).toBe("0");
    expect(result[result.length - 1].id).toBe("49");
  });

  it("sorts messages before limiting", () => {
    const messages = [
      makeMessage({ id: "2", sendTime: "2024-01-01T00:01:00.000Z" }),
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = limitMessageWindow(messages);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("uses custom window size", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMessage({ id: String(i), sendTime: `2024-01-01T00:00:0${i}.000Z` }),
    );
    const result = limitMessageWindow(messages, "latest", 3);
    expect(result).toHaveLength(3);
  });
});

describe("mergeMessagesChronologically", () => {
  it("merges two lists in chronological order", () => {
    const list1 = [
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "3", sendTime: "2024-01-03T00:00:00.000Z" }),
    ];
    const list2 = [
      makeMessage({ id: "2", sendTime: "2024-01-02T00:00:00.000Z" }),
      makeMessage({ id: "4", sendTime: "2024-01-04T00:00:00.000Z" }),
    ];
    const result = mergeMessagesChronologically(list1, list2);
    expect(result.map((m) => m.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("deduplicates by identity across lists", () => {
    const list1 = [
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const list2 = [
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z", content: "updated" }),
    ];
    const result = mergeMessagesChronologically(list1, list2);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("updated");
  });

  it("handles empty lists", () => {
    expect(mergeMessagesChronologically([], [])).toEqual([]);
  });

  it("handles single list", () => {
    const list = [
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = mergeMessagesChronologically(list);
    expect(result).toHaveLength(1);
  });
});

describe("messageIdentityValues", () => {
  it("returns id, messageId, clientMessageId", () => {
    const msg = makeMessage({ id: "1", messageId: "m1", clientMessageId: "cm1" });
    const result = messageIdentityValues(msg);
    expect(result).toContain("1");
    expect(result).toContain("m1");
    expect(result).toContain("cm1");
  });

  it("filters out empty strings", () => {
    const msg = makeMessage({ id: "1" });
    const result = messageIdentityValues(msg);
    expect(result).toEqual(["1"]);
  });
});

describe("hasSameMessageIdentity", () => {
  it("returns true when messages share an id", () => {
    const left = makeMessage({ id: "1" });
    const right = makeMessage({ id: "1", messageId: "m2" });
    expect(hasSameMessageIdentity(left, right)).toBe(true);
  });

  it("returns true when messages share a messageId", () => {
    const left = makeMessage({ id: "1", messageId: "m1" });
    const right = makeMessage({ id: "2", messageId: "m1" });
    expect(hasSameMessageIdentity(left, right)).toBe(true);
  });

  it("returns false when messages share no identity", () => {
    const left = makeMessage({ id: "1" });
    const right = makeMessage({ id: "2" });
    expect(hasSameMessageIdentity(left, right)).toBe(false);
  });
});
