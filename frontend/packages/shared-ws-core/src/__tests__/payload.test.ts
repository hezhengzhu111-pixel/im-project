import { describe, it, expect } from "vitest";
import {
  parseWebSocketPayload,
  isMessagePayload,
  isMessageStatusChangedPayload,
  isOnlineStatusPayload,
  isReadReceiptPayload,
  isSystemPayload,
  isHeartbeatPayload,
  isFriendRequestPayload,
  isFriendAcceptedPayload,
  isE2eeNegotiationPayload,
} from "../payload.js";

// ---------------------------------------------------------------------------
// W11 — payload parse / envelope type guard
// W13 — message event routing (type guard classification)
// W14 — online status / presence (payload guard)
// W15 — read receipt event (payload guard)
// W16 — friend request / friend accepted (payload guard)
// W17 — system message command (payload guard)
// W20 — E2EE_NEGOTIATION event boundary (payload guard)
// W23 — 阶段四禁止事项 (no behavior change, test-only)
// W24 — 冲突处理规则 (protocol-level guard parity across Web/Mobile)
// ---------------------------------------------------------------------------

// ===== 1. Valid JSON payload parse =====
describe("parseWebSocketPayload — valid JSON", () => {
  it("parses a standard envelope object", () => {
    const raw = '{"type":"MESSAGE","data":{"id":"123","content":"hello"}}';
    const result = parseWebSocketPayload(raw);
    expect(result).toEqual({ type: "MESSAGE", data: { id: "123", content: "hello" } });
  });

  it("parses an envelope with nested data", () => {
    const raw = JSON.stringify({
      type: "ONLINE_STATUS",
      data: { userId: "u1", status: "ONLINE" },
    });
    expect(parseWebSocketPayload(raw)).toEqual({
      type: "ONLINE_STATUS",
      data: { userId: "u1", status: "ONLINE" },
    });
  });

  it("parses a JSON array", () => {
    expect(parseWebSocketPayload("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("parses JSON primitives", () => {
    expect(parseWebSocketPayload('"hello"')).toBe("hello");
    expect(parseWebSocketPayload("42")).toBe(42);
    expect(parseWebSocketPayload("true")).toBe(true);
  });

  it("parses null literal", () => {
    expect(parseWebSocketPayload("null")).toBeNull();
  });

  it("parses an empty object", () => {
    expect(parseWebSocketPayload("{}")).toEqual({});
  });
});

// ===== 2. Non-JSON payload returns null =====
describe("parseWebSocketPayload — invalid / non-JSON", () => {
  it("returns null for plain text", () => {
    expect(parseWebSocketPayload("not json")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseWebSocketPayload("")).toBeNull();
  });

  it("returns null for truncated JSON", () => {
    expect(parseWebSocketPayload("{broken")).toBeNull();
  });

  it("returns null for undefined text", () => {
    expect(parseWebSocketPayload("undefined")).toBeNull();
  });

  it("returns null for partial string", () => {
    expect(parseWebSocketPayload('"unclosed')).toBeNull();
  });
});

// ===== 3. MESSAGE =====
describe("isMessagePayload", () => {
  it("returns true for type MESSAGE", () => {
    expect(isMessagePayload({ type: "MESSAGE", data: {} })).toBe(true);
  });

  it("returns true with populated data", () => {
    expect(
      isMessagePayload({
        type: "MESSAGE",
        data: { id: "1", content: "hi", messageType: "TEXT" },
      }),
    ).toBe(true);
  });

  it("returns false for non-MESSAGE type", () => {
    expect(isMessagePayload({ type: "HEARTBEAT", data: {} })).toBe(false);
    expect(isMessagePayload({ type: "SYSTEM", data: {} })).toBe(false);
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

// ===== 4. MESSAGE_STATUS_CHANGED =====
describe("isMessageStatusChangedPayload", () => {
  it("returns true for type MESSAGE_STATUS_CHANGED", () => {
    expect(isMessageStatusChangedPayload({ type: "MESSAGE_STATUS_CHANGED", data: {} })).toBe(true);
  });

  it("returns true with status data", () => {
    expect(
      isMessageStatusChangedPayload({
        type: "MESSAGE_STATUS_CHANGED",
        data: { id: "1", status: 2 },
      }),
    ).toBe(true);
  });

  it("returns false for MESSAGE type", () => {
    expect(isMessageStatusChangedPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isMessageStatusChangedPayload(null)).toBe(false);
    expect(isMessageStatusChangedPayload(123)).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isMessageStatusChangedPayload({ data: {} })).toBe(false);
  });
});

// ===== 5. ONLINE_STATUS =====
describe("isOnlineStatusPayload", () => {
  it("returns true for type ONLINE_STATUS", () => {
    expect(isOnlineStatusPayload({ type: "ONLINE_STATUS", data: {} })).toBe(true);
  });

  it("returns true with presence data", () => {
    expect(
      isOnlineStatusPayload({
        type: "ONLINE_STATUS",
        data: { userId: "u1", status: "ONLINE" },
      }),
    ).toBe(true);
  });

  it("returns false for MESSAGE type", () => {
    expect(isOnlineStatusPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isOnlineStatusPayload(null)).toBe(false);
    expect(isOnlineStatusPayload("string")).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isOnlineStatusPayload({ status: "ONLINE" })).toBe(false);
  });
});

// ===== 6. READ_RECEIPT =====
describe("isReadReceiptPayload", () => {
  it("returns true for type READ_RECEIPT", () => {
    expect(isReadReceiptPayload({ type: "READ_RECEIPT", data: {} })).toBe(true);
  });

  it("returns true with receipt data", () => {
    expect(
      isReadReceiptPayload({
        type: "READ_RECEIPT",
        data: { readerId: "u1", lastReadMessageId: "m1" },
      }),
    ).toBe(true);
  });

  it("returns false for MESSAGE type", () => {
    expect(isReadReceiptPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isReadReceiptPayload(null)).toBe(false);
    expect(isReadReceiptPayload(undefined)).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isReadReceiptPayload({ readerId: "u1" })).toBe(false);
  });
});

// ===== 7. FRIEND_REQUEST =====
describe("isFriendRequestPayload", () => {
  it("returns true for type FRIEND_REQUEST", () => {
    expect(isFriendRequestPayload({ type: "FRIEND_REQUEST", data: {} })).toBe(true);
  });

  it("returns true with request data", () => {
    expect(
      isFriendRequestPayload({
        type: "FRIEND_REQUEST",
        data: { applicantId: "u1", targetUserId: "u2" },
      }),
    ).toBe(true);
  });

  it("returns false for FRIEND_ACCEPTED type", () => {
    expect(isFriendRequestPayload({ type: "FRIEND_ACCEPTED", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isFriendRequestPayload(null)).toBe(false);
    expect(isFriendRequestPayload(0)).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isFriendRequestPayload({ applicantId: "u1" })).toBe(false);
  });
});

// ===== 8. FRIEND_ACCEPTED =====
describe("isFriendAcceptedPayload", () => {
  it("returns true for type FRIEND_ACCEPTED", () => {
    expect(isFriendAcceptedPayload({ type: "FRIEND_ACCEPTED", data: {} })).toBe(true);
  });

  it("returns true with accepted data", () => {
    expect(
      isFriendAcceptedPayload({
        type: "FRIEND_ACCEPTED",
        data: { friendId: "u2" },
      }),
    ).toBe(true);
  });

  it("returns false for FRIEND_REQUEST type", () => {
    expect(isFriendAcceptedPayload({ type: "FRIEND_REQUEST", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isFriendAcceptedPayload(null)).toBe(false);
    expect(isFriendAcceptedPayload(false)).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isFriendAcceptedPayload({ friendId: "u2" })).toBe(false);
  });
});

// ===== 9. SYSTEM =====
describe("isSystemPayload", () => {
  it("returns true for type SYSTEM", () => {
    expect(isSystemPayload({ type: "SYSTEM", data: {} })).toBe(true);
  });

  it("returns true with system command content", () => {
    expect(
      isSystemPayload({
        type: "SYSTEM",
        data: { content: "::CMD:REFRESH_FRIEND_REQUESTS" },
      }),
    ).toBe(true);
  });

  it("returns false for MESSAGE type", () => {
    expect(isSystemPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isSystemPayload(null)).toBe(false);
    expect(isSystemPayload("SYSTEM")).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isSystemPayload({ content: "::CMD:REFRESH_FRIEND_LIST" })).toBe(false);
  });
});

// ===== 10. HEARTBEAT =====
describe("isHeartbeatPayload", () => {
  it("returns true for type HEARTBEAT", () => {
    expect(isHeartbeatPayload({ type: "HEARTBEAT", data: {} })).toBe(true);
  });

  it("returns true with timestamp data", () => {
    expect(
      isHeartbeatPayload({
        type: "HEARTBEAT",
        data: { timestamp: Date.now() },
      }),
    ).toBe(true);
  });

  it("returns false for MESSAGE type", () => {
    expect(isHeartbeatPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isHeartbeatPayload(null)).toBe(false);
    expect(isHeartbeatPayload(42)).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isHeartbeatPayload({ timestamp: Date.now() })).toBe(false);
  });
});

// ===== 11. E2EE_NEGOTIATION =====
describe("isE2eeNegotiationPayload", () => {
  it("returns true for type E2EE_NEGOTIATION", () => {
    expect(isE2eeNegotiationPayload({ type: "E2EE_NEGOTIATION", data: {} })).toBe(true);
  });

  it("returns true with negotiation data", () => {
    expect(
      isE2eeNegotiationPayload({
        type: "E2EE_NEGOTIATION",
        data: { sessionId: "s1", action: "request" },
      }),
    ).toBe(true);
  });

  it("returns false for MESSAGE type", () => {
    expect(isE2eeNegotiationPayload({ type: "MESSAGE", data: {} })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isE2eeNegotiationPayload(null)).toBe(false);
    expect(isE2eeNegotiationPayload("E2EE")).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isE2eeNegotiationPayload({ sessionId: "s1" })).toBe(false);
  });
});

// ===== 12. data 缺失时 type guard 不误判 =====
describe("type guards — data field absent", () => {
  const guards = [
    { name: "isMessagePayload", guard: isMessagePayload, type: "MESSAGE" },
    { name: "isMessageStatusChangedPayload", guard: isMessageStatusChangedPayload, type: "MESSAGE_STATUS_CHANGED" },
    { name: "isOnlineStatusPayload", guard: isOnlineStatusPayload, type: "ONLINE_STATUS" },
    { name: "isReadReceiptPayload", guard: isReadReceiptPayload, type: "READ_RECEIPT" },
    { name: "isSystemPayload", guard: isSystemPayload, type: "SYSTEM" },
    { name: "isHeartbeatPayload", guard: isHeartbeatPayload, type: "HEARTBEAT" },
    { name: "isFriendRequestPayload", guard: isFriendRequestPayload, type: "FRIEND_REQUEST" },
    { name: "isFriendAcceptedPayload", guard: isFriendAcceptedPayload, type: "FRIEND_ACCEPTED" },
    { name: "isE2eeNegotiationPayload", guard: isE2eeNegotiationPayload, type: "E2EE_NEGOTIATION" },
  ];

  for (const { name, guard, type } of guards) {
    it(`${name}: returns true when data is undefined (type-level check only)`, () => {
      // Per W11, guards check envelope type, not data presence.
      // Data absence is handled by dispatch, not by the guard.
      expect(guard({ type })).toBe(true);
    });

    it(`${name}: returns false when type is missing entirely`, () => {
      expect(guard({ data: { id: "1" } })).toBe(false);
    });

    it(`${name}: returns false for empty object`, () => {
      expect(guard({})).toBe(false);
    });
  }
});

// ===== 13. 嵌套 messageType/type 的兼容 =====
describe("type guards — nested messageType/type compatibility", () => {
  it("isMessagePayload: outer type MESSAGE with inner messageType TEXT still matches", () => {
    expect(
      isMessagePayload({
        type: "MESSAGE",
        data: { messageType: "TEXT", content: "hi" },
      }),
    ).toBe(true);
  });

  it("isMessagePayload: outer type MESSAGE with inner messageType SYSTEM still matches envelope", () => {
    // Per W11, guard checks envelope type only.
    // Inner SYSTEM dispatch is a sequential concern (W12), not a guard concern.
    expect(
      isMessagePayload({
        type: "MESSAGE",
        data: { messageType: "SYSTEM", content: "::CMD:REFRESH" },
      }),
    ).toBe(true);
  });

  it("isMessagePayload: outer type MESSAGE with inner type field still matches", () => {
    // Some messages use data.type instead of data.messageType
    expect(
      isMessagePayload({
        type: "MESSAGE",
        data: { type: "IMAGE", mediaUrl: "http://example.com/img.png" },
      }),
    ).toBe(true);
  });

  it("isMessageStatusChangedPayload: envelope matches regardless of inner messageType", () => {
    expect(
      isMessageStatusChangedPayload({
        type: "MESSAGE_STATUS_CHANGED",
        data: { id: "1", messageType: "TEXT", status: 3 },
      }),
    ).toBe(true);
  });

  it("isSystemPayload: inner type field does not affect SYSTEM envelope match", () => {
    expect(
      isSystemPayload({
        type: "SYSTEM",
        data: { type: "notification", content: "Server maintenance" },
      }),
    ).toBe(true);
  });

  it("a MESSAGE envelope with data.type=SYSTEM is still a MESSAGE, not SYSTEM", () => {
    const payload = {
      type: "MESSAGE",
      data: { type: "SYSTEM", content: "::CMD:REFRESH_FRIEND_LIST" },
    };
    expect(isMessagePayload(payload)).toBe(true);
    expect(isSystemPayload(payload)).toBe(false);
  });

  it("a SYSTEM envelope is not misclassified as MESSAGE", () => {
    const payload = {
      type: "SYSTEM",
      data: { content: "::CMD:REFRESH_FRIEND_REQUESTS" },
    };
    expect(isSystemPayload(payload)).toBe(true);
    expect(isMessagePayload(payload)).toBe(false);
  });

  it("HEARTBEAT with nested data.type is still HEARTBEAT", () => {
    expect(
      isHeartbeatPayload({
        type: "HEARTBEAT",
        data: { type: "ping", timestamp: Date.now() },
      }),
    ).toBe(true);
    expect(isMessagePayload({ type: "HEARTBEAT", data: { type: "ping" } })).toBe(false);
  });
});

// ===== Cross-guard isolation =====
describe("type guards — cross-guard isolation", () => {
  const allTypes = [
    "MESSAGE",
    "MESSAGE_STATUS_CHANGED",
    "ONLINE_STATUS",
    "READ_RECEIPT",
    "SYSTEM",
    "HEARTBEAT",
    "FRIEND_REQUEST",
    "FRIEND_ACCEPTED",
    "E2EE_NEGOTIATION",
  ] as const;

  const guardMap: Record<string, (data: unknown) => boolean> = {
    MESSAGE: isMessagePayload,
    MESSAGE_STATUS_CHANGED: isMessageStatusChangedPayload,
    ONLINE_STATUS: isOnlineStatusPayload,
    READ_RECEIPT: isReadReceiptPayload,
    SYSTEM: isSystemPayload,
    HEARTBEAT: isHeartbeatPayload,
    FRIEND_REQUEST: isFriendRequestPayload,
    FRIEND_ACCEPTED: isFriendAcceptedPayload,
    E2EE_NEGOTIATION: isE2eeNegotiationPayload,
  };

  for (const expectedType of allTypes) {
    it(`${expectedType} guard matches only its own type`, () => {
      const guard = guardMap[expectedType];
      for (const otherType of allTypes) {
        const payload = { type: otherType, data: {} };
        if (otherType === expectedType) {
          expect(guard(payload)).toBe(true);
        } else {
          expect(guard(payload)).toBe(false);
        }
      }
    });
  }
});

// ===== parse + guard integration =====
describe("parseWebSocketPayload + guard integration", () => {
  it("parse then isMessagePayload for a raw MESSAGE string", () => {
    const raw = JSON.stringify({ type: "MESSAGE", data: { id: "1", content: "hello" } });
    const parsed = parseWebSocketPayload(raw);
    expect(isMessagePayload(parsed)).toBe(true);
  });

  it("parse then isHeartbeatPayload for a raw HEARTBEAT string", () => {
    const raw = JSON.stringify({ type: "HEARTBEAT", data: { timestamp: 123 } });
    const parsed = parseWebSocketPayload(raw);
    expect(isHeartbeatPayload(parsed)).toBe(true);
  });

  it("parse returns null for invalid JSON, guards return false on null", () => {
    const parsed = parseWebSocketPayload("not-json");
    expect(parsed).toBeNull();
    expect(isMessagePayload(parsed)).toBe(false);
    expect(isSystemPayload(parsed)).toBe(false);
    expect(isOnlineStatusPayload(parsed)).toBe(false);
    expect(isReadReceiptPayload(parsed)).toBe(false);
    expect(isHeartbeatPayload(parsed)).toBe(false);
    expect(isFriendRequestPayload(parsed)).toBe(false);
    expect(isFriendAcceptedPayload(parsed)).toBe(false);
    expect(isE2eeNegotiationPayload(parsed)).toBe(false);
    expect(isMessageStatusChangedPayload(parsed)).toBe(false);
  });

  it("parse a READ_RECEIPT envelope, guard confirms", () => {
    const raw = JSON.stringify({
      type: "READ_RECEIPT",
      data: { readerId: "u1", conversationId: "c1", lastReadMessageId: "m10" },
    });
    const parsed = parseWebSocketPayload(raw);
    expect(isReadReceiptPayload(parsed)).toBe(true);
    expect(isMessagePayload(parsed)).toBe(false);
  });

  it("parse an E2EE_NEGOTIATION envelope, guard confirms", () => {
    const raw = JSON.stringify({
      type: "E2EE_NEGOTIATION",
      data: { sessionId: "s1", action: "request", requesterId: "u1" },
    });
    const parsed = parseWebSocketPayload(raw);
    expect(isE2eeNegotiationPayload(parsed)).toBe(true);
    expect(isMessagePayload(parsed)).toBe(false);
  });
});
