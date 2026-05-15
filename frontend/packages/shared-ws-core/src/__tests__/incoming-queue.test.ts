import { describe, it, expect } from "vitest";
import {
  getIncomingPayloadType,
  shouldQueueIncomingPayload,
} from "../index.js";

describe("getIncomingPayloadType", () => {
  it("extracts outerType and innerType from a MESSAGE + TEXT payload", () => {
    const payload = {
      type: "MESSAGE",
      data: { messageType: "TEXT", content: "hello" },
    };
    expect(getIncomingPayloadType(payload)).toEqual({
      outerType: "MESSAGE",
      innerType: "TEXT",
    });
  });

  it("extracts innerType from data.type fallback", () => {
    const payload = {
      type: "MESSAGE",
      data: { type: "IMAGE", content: "" },
    };
    expect(getIncomingPayloadType(payload)).toEqual({
      outerType: "MESSAGE",
      innerType: "IMAGE",
    });
  });

  it("returns empty innerType for non-MESSAGE envelopes", () => {
    expect(getIncomingPayloadType({ type: "HEARTBEAT", data: {} })).toEqual({
      outerType: "HEARTBEAT",
      innerType: "",
    });
    expect(
      getIncomingPayloadType({ type: "ONLINE_STATUS", data: {} }),
    ).toEqual({ outerType: "ONLINE_STATUS", innerType: "" });
    expect(
      getIncomingPayloadType({ type: "MESSAGE_STATUS_CHANGED", data: {} }),
    ).toEqual({ outerType: "MESSAGE_STATUS_CHANGED", innerType: "" });
  });

  it("returns empty innerType when payload has no type", () => {
    expect(getIncomingPayloadType({ data: {} })).toEqual({
      outerType: "",
      innerType: "",
    });
  });

  it("returns empty innerType when MESSAGE has no data", () => {
    expect(getIncomingPayloadType({ type: "MESSAGE" })).toEqual({
      outerType: "MESSAGE",
      innerType: "",
    });
  });
});

describe("shouldQueueIncomingPayload", () => {
  it("queues MESSAGE + TEXT", () => {
    expect(
      shouldQueueIncomingPayload({
        type: "MESSAGE",
        data: { messageType: "TEXT" },
      }),
    ).toBe(true);
  });

  it("queues MESSAGE + IMAGE", () => {
    expect(
      shouldQueueIncomingPayload({
        type: "MESSAGE",
        data: { messageType: "IMAGE" },
      }),
    ).toBe(true);
  });

  it("queues MESSAGE + AI_REPLY", () => {
    expect(
      shouldQueueIncomingPayload({
        type: "MESSAGE",
        data: { messageType: "AI_REPLY" },
      }),
    ).toBe(true);
  });

  it("does not queue MESSAGE + SYSTEM", () => {
    expect(
      shouldQueueIncomingPayload({
        type: "MESSAGE",
        data: { messageType: "SYSTEM" },
      }),
    ).toBe(false);
  });

  it("does not queue MESSAGE + system (case-insensitive)", () => {
    expect(
      shouldQueueIncomingPayload({
        type: "MESSAGE",
        data: { messageType: "system" },
      }),
    ).toBe(false);
  });

  it("does not queue non-message events", () => {
    expect(shouldQueueIncomingPayload({ type: "HEARTBEAT", data: {} })).toBe(false);
    expect(shouldQueueIncomingPayload({ type: "ONLINE_STATUS", data: {} })).toBe(false);
    expect(
      shouldQueueIncomingPayload({ type: "MESSAGE_STATUS_CHANGED", data: {} }),
    ).toBe(false);
    expect(shouldQueueIncomingPayload({ type: "READ_RECEIPT", data: {} })).toBe(false);
    expect(shouldQueueIncomingPayload({ type: "FRIEND_REQUEST", data: {} })).toBe(false);
    expect(shouldQueueIncomingPayload({ type: "SYSTEM", data: {} })).toBe(false);
  });
});
