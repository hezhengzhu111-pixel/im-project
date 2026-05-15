import { describe, expect, it } from "vitest";
import {
  classifyWsEvent,
  getWsPayloadData,
  isChatMessageEvent,
  isContactEvent,
  isPresenceEvent,
  isReadEvent,
} from "../event-classifier.js";
import type { WsEventKind } from "../event-classifier.js";

// ── classifyWsEvent ─────────────────────────────────────────────────

describe("classifyWsEvent", () => {
  const cases: Array<{ type: string; expected: WsEventKind }> = [
    { type: "MESSAGE", expected: "message" },
    { type: "MESSAGE_STATUS_CHANGED", expected: "messageStatusChanged" },
    { type: "ONLINE_STATUS", expected: "onlineStatus" },
    { type: "READ_RECEIPT", expected: "readReceipt" },
    { type: "FRIEND_REQUEST", expected: "friendRequest" },
    { type: "FRIEND_ACCEPTED", expected: "friendAccepted" },
    { type: "SYSTEM", expected: "system" },
    { type: "HEARTBEAT", expected: "heartbeat" },
    { type: "E2EE_NEGOTIATION", expected: "e2eeNegotiation" },
  ];

  it.each(cases)(
    "classifies $type as $expected",
    ({ type, expected }) => {
      expect(classifyWsEvent({ type })).toBe(expected);
    },
  );

  it("returns unknown for unrecognized type", () => {
    expect(classifyWsEvent({ type: "FOO_BAR" })).toBe("unknown");
  });

  it("returns unknown when type is missing", () => {
    expect(classifyWsEvent({})).toBe("unknown");
  });

  it("returns unknown when type is empty string", () => {
    expect(classifyWsEvent({ type: "" })).toBe("unknown");
  });
});

// ── getWsPayloadData ────────────────────────────────────────────────

describe("getWsPayloadData", () => {
  it("returns data field when present", () => {
    const data = { id: "1", content: "hello" };
    expect(getWsPayloadData({ type: "MESSAGE", data })).toBe(data);
  });

  it("returns undefined when data is absent", () => {
    expect(getWsPayloadData({ type: "HEARTBEAT" })).toBeUndefined();
  });

  it("returns null when data is explicitly null", () => {
    expect(getWsPayloadData({ type: "MESSAGE", data: null })).toBeNull();
  });
});

// ── isChatMessageEvent ──────────────────────────────────────────────

describe("isChatMessageEvent", () => {
  it("returns true for message", () => {
    expect(isChatMessageEvent("message")).toBe(true);
  });

  it.each<WsEventKind>([
    "messageStatusChanged",
    "onlineStatus",
    "readReceipt",
    "friendRequest",
    "friendAccepted",
    "system",
    "heartbeat",
    "e2eeNegotiation",
    "unknown",
  ])("returns false for %s", (kind) => {
    expect(isChatMessageEvent(kind)).toBe(false);
  });
});

// ── isContactEvent ──────────────────────────────────────────────────

describe("isContactEvent", () => {
  it.each<WsEventKind>(["friendRequest", "friendAccepted"])(
    "returns true for %s",
    (kind) => {
      expect(isContactEvent(kind)).toBe(true);
    },
  );

  it.each<WsEventKind>([
    "message",
    "messageStatusChanged",
    "onlineStatus",
    "readReceipt",
    "system",
    "heartbeat",
    "e2eeNegotiation",
    "unknown",
  ])("returns false for %s", (kind) => {
    expect(isContactEvent(kind)).toBe(false);
  });
});

// ── isPresenceEvent ─────────────────────────────────────────────────

describe("isPresenceEvent", () => {
  it("returns true for onlineStatus", () => {
    expect(isPresenceEvent("onlineStatus")).toBe(true);
  });

  it.each<WsEventKind>([
    "message",
    "messageStatusChanged",
    "readReceipt",
    "friendRequest",
    "friendAccepted",
    "system",
    "heartbeat",
    "e2eeNegotiation",
    "unknown",
  ])("returns false for %s", (kind) => {
    expect(isPresenceEvent(kind)).toBe(false);
  });
});

// ── isReadEvent ─────────────────────────────────────────────────────

describe("isReadEvent", () => {
  it("returns true for readReceipt", () => {
    expect(isReadEvent("readReceipt")).toBe(true);
  });

  it.each<WsEventKind>([
    "message",
    "messageStatusChanged",
    "onlineStatus",
    "friendRequest",
    "friendAccepted",
    "system",
    "heartbeat",
    "e2eeNegotiation",
    "unknown",
  ])("returns false for %s", (kind) => {
    expect(isReadEvent(kind)).toBe(false);
  });
});
