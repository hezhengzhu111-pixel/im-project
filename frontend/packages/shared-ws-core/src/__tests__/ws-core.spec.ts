import { describe, it, expect } from "vitest";
import {
  createHeartbeatPayload,
  createReconnectDelay,
  shouldProcessSequentially,
  parseWebSocketPayload,
  isMessagePayload,
  isOnlineStatusPayload,
  isReadReceiptPayload,
  isSystemPayload,
  createTicketedWebSocketUrl,
  DUPLICATE_CONNECTION_REASON,
} from "../index.js";

describe("createHeartbeatPayload", () => {
  it("returns a valid JSON string", () => {
    const result = createHeartbeatPayload(1700000000000);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("has type HEARTBEAT", () => {
    const result = JSON.parse(createHeartbeatPayload(1700000000000));
    expect(result.type).toBe("HEARTBEAT");
  });

  it("contains timestamp in data", () => {
    const result = JSON.parse(createHeartbeatPayload(1700000000000));
    expect(result.data).toBeDefined();
    expect(typeof result.data.timestamp).toBe("number");
    expect(result.data.timestamp).toBeGreaterThan(0);
  });

  it("contains top-level timestamp", () => {
    const result = JSON.parse(createHeartbeatPayload(1700000000000));
    expect(typeof result.timestamp).toBe("number");
    expect(result.timestamp).toBeGreaterThan(0);
  });
});

describe("createReconnectDelay", () => {
  it("returns baseInterval * attempt", () => {
    expect(createReconnectDelay(1)).toBe(1000);
    expect(createReconnectDelay(2)).toBe(2000);
    expect(createReconnectDelay(3)).toBe(3000);
  });

  it("uses custom baseInterval", () => {
    expect(createReconnectDelay(1, 500)).toBe(500);
    expect(createReconnectDelay(3, 500)).toBe(1500);
  });

  it("treats attempt < 1 as 1", () => {
    expect(createReconnectDelay(0)).toBe(1000);
    expect(createReconnectDelay(-1)).toBe(1000);
    expect(createReconnectDelay(0, 500)).toBe(500);
  });

  it("treats negative baseInterval as 0", () => {
    expect(createReconnectDelay(1, -100)).toBe(0);
    expect(createReconnectDelay(3, -500)).toBe(0);
  });
});

describe("shouldProcessSequentially", () => {
  it("returns true for MESSAGE type with non-SYSTEM inner type", () => {
    expect(shouldProcessSequentially("MESSAGE", "TEXT")).toBe(true);
    expect(shouldProcessSequentially("MESSAGE", "IMAGE")).toBe(true);
    expect(shouldProcessSequentially("MESSAGE", "AI_REPLY")).toBe(true);
  });

  it("returns false for MESSAGE type with SYSTEM inner type", () => {
    expect(shouldProcessSequentially("MESSAGE", "SYSTEM")).toBe(false);
  });

  it("returns false for non-MESSAGE types", () => {
    expect(shouldProcessSequentially("HEARTBEAT", "")).toBe(false);
    expect(shouldProcessSequentially("ONLINE_STATUS", "")).toBe(false);
    expect(shouldProcessSequentially("READ_RECEIPT", "")).toBe(false);
    expect(shouldProcessSequentially("SYSTEM", "")).toBe(false);
  });

  it("handles case-insensitive SYSTEM inner type", () => {
    expect(shouldProcessSequentially("MESSAGE", "system")).toBe(false);
    expect(shouldProcessSequentially("MESSAGE", "System")).toBe(false);
  });
});

describe("parseWebSocketPayload", () => {
  it("parses valid JSON", () => {
    const result = parseWebSocketPayload('{"type":"MESSAGE","data":{}}');
    expect(result).toEqual({ type: "MESSAGE", data: {} });
  });

  it("returns null for invalid JSON", () => {
    expect(parseWebSocketPayload("not json")).toBeNull();
    expect(parseWebSocketPayload("")).toBeNull();
    expect(parseWebSocketPayload("{broken")).toBeNull();
  });

  it("parses arrays", () => {
    const result = parseWebSocketPayload("[1,2,3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("parses primitives", () => {
    expect(parseWebSocketPayload('"hello"')).toBe("hello");
    expect(parseWebSocketPayload("42")).toBe(42);
    expect(parseWebSocketPayload("true")).toBe(true);
    expect(parseWebSocketPayload("null")).toBeNull();
  });
});

describe("isMessagePayload", () => {
  it("returns true for MESSAGE type", () => {
    expect(isMessagePayload({ type: "MESSAGE", data: {} })).toBe(true);
  });

  it("returns false for non-MESSAGE type", () => {
    expect(isMessagePayload({ type: "HEARTBEAT", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isMessagePayload(null)).toBe(false);
    expect(isMessagePayload("string")).toBe(false);
    expect(isMessagePayload(42)).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isMessagePayload({ data: {} })).toBe(false);
  });
});

describe("isOnlineStatusPayload", () => {
  it("returns true for ONLINE_STATUS type", () => {
    expect(isOnlineStatusPayload({ type: "ONLINE_STATUS", data: {} })).toBe(true);
  });

  it("returns false for non-ONLINE_STATUS type", () => {
    expect(isOnlineStatusPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isOnlineStatusPayload(null)).toBe(false);
  });
});

describe("isReadReceiptPayload", () => {
  it("returns true for READ_RECEIPT type", () => {
    expect(isReadReceiptPayload({ type: "READ_RECEIPT", data: {} })).toBe(true);
  });

  it("returns false for non-READ_RECEIPT type", () => {
    expect(isReadReceiptPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isReadReceiptPayload(null)).toBe(false);
  });
});

describe("isSystemPayload", () => {
  it("returns true for SYSTEM type", () => {
    expect(isSystemPayload({ type: "SYSTEM", data: {} })).toBe(true);
  });

  it("returns false for non-SYSTEM type", () => {
    expect(isSystemPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isSystemPayload(null)).toBe(false);
  });
});

describe("createTicketedWebSocketUrl", () => {
  it("builds URL without ticket", () => {
    expect(createTicketedWebSocketUrl("", "user1")).toBe("/websocket/user1");
  });

  it("builds URL with base URL", () => {
    expect(createTicketedWebSocketUrl("wss://example.com", "user1")).toBe(
      "wss://example.com/websocket/user1",
    );
  });

  it("builds URL with ticket", () => {
    const result = createTicketedWebSocketUrl("", "user1", "abc123");
    expect(result).toBe("/websocket/user1?ticket=abc123");
  });

  it("encodes special characters in ticket", () => {
    const result = createTicketedWebSocketUrl("", "user1", "a b&c=d");
    expect(result).toContain("ticket=");
    // The ticket should be URL-encoded
    expect(result).toContain(encodeURIComponent("a b&c=d"));
  });
});

describe("DUPLICATE_CONNECTION_REASON", () => {
  it("has the expected value", () => {
    expect(DUPLICATE_CONNECTION_REASON).toBe("duplicate_connection");
  });
});
