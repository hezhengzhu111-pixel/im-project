import { describe, expect, it } from "vitest";
import { WS_MESSAGE_TYPE, API_CODES } from "../codes.js";
import type { WsMessageType } from "../codes.js";

describe("WS_MESSAGE_TYPE", () => {
  it("contains all expected WebSocket message types", () => {
    const expected = [
      "MESSAGE",
      "MESSAGE_STATUS_CHANGED",
      "HEARTBEAT",
      "ONLINE_STATUS",
      "READ_RECEIPT",
      "READ_SYNC",
      "SYSTEM",
      "FRIEND_REQUEST",
      "FRIEND_ACCEPTED",
      "E2EE_NEGOTIATION",
    ];

    const values = Object.values(WS_MESSAGE_TYPE);
    expect(values.length).toBe(expected.length);
    expected.forEach((type) => {
      expect(values).toContain(type);
    });
  });

  it("each value is unique (no duplicate string values)", () => {
    const values = Object.values(WS_MESSAGE_TYPE);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it("each value equals its key name (value mirrors key)", () => {
    for (const [key, value] of Object.entries(WS_MESSAGE_TYPE)) {
      expect(key).toBe(value);
    }
  });

  it("is declared with as const — each value is a string", () => {
    // TypeScript 'as const' ensures each property has a literal type;
    // at runtime the object is a plain object (not frozen).
    for (const value of Object.values(WS_MESSAGE_TYPE)) {
      expect(typeof value).toBe("string");
    }
  });

  it("satisfies WsMessageType discriminated union at runtime", () => {
    // Type-level check: accessing any member yields WsMessageType
    const msg: WsMessageType = WS_MESSAGE_TYPE.MESSAGE;
    expect(msg).toBe("MESSAGE");

    const heartbeat: WsMessageType = WS_MESSAGE_TYPE.HEARTBEAT;
    expect(heartbeat).toBe("HEARTBEAT");

    const system: WsMessageType = WS_MESSAGE_TYPE.SYSTEM;
    expect(system).toBe("SYSTEM");
  });
});

describe("API_CODES", () => {
  it("contains standard HTTP status codes", () => {
    expect(API_CODES.OK).toBe(200);
    expect(API_CODES.BAD_REQUEST).toBe(400);
    expect(API_CODES.UNAUTHORIZED).toBe(401);
    expect(API_CODES.FORBIDDEN).toBe(403);
    expect(API_CODES.NOT_FOUND).toBe(404);
    expect(API_CODES.INTERNAL_ERROR).toBe(500);
  });

  it("each code is unique", () => {
    const codes = Object.values(API_CODES);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it("all codes are within the expected numeric range", () => {
    const codes = Object.values(API_CODES);
    codes.forEach((code) => {
      expect(typeof code).toBe("number");
      expect(code).toBeGreaterThanOrEqual(100);
      expect(code).toBeLessThanOrEqual(599);
    });
  });

  it("is declared with as const — each value is a number", () => {
    for (const code of Object.values(API_CODES)) {
      expect(typeof code).toBe("number");
    }
  });

  it("success codes are in 2xx range", () => {
    expect(API_CODES.OK).toBeGreaterThanOrEqual(200);
    expect(API_CODES.OK).toBeLessThan(300);
  });

  it("error codes are in 4xx-5xx range", () => {
    const errorCodes = [
      API_CODES.BAD_REQUEST,
      API_CODES.UNAUTHORIZED,
      API_CODES.FORBIDDEN,
      API_CODES.NOT_FOUND,
      API_CODES.INTERNAL_ERROR,
    ];
    errorCodes.forEach((code) => {
      expect(code).toBeGreaterThanOrEqual(400);
      expect(code).toBeLessThanOrEqual(599);
    });
  });
});
