import { describe, expect, it } from "vitest";
import { AUTH_ENDPOINTS } from "../auth.endpoints.js";

describe("AUTH_ENDPOINTS", () => {
  it("contains all expected auth endpoints", () => {
    const expected = ["PARSE", "REFRESH", "WS_TICKET"];
    expect(Object.keys(AUTH_ENDPOINTS)).toEqual(expected);
  });

  it("PARSE has correct path format", () => {
    expect(AUTH_ENDPOINTS.PARSE).toBe("/auth/parse");
  });

  it("REFRESH has correct path format", () => {
    expect(AUTH_ENDPOINTS.REFRESH).toBe("/auth/refresh");
  });

  it("WS_TICKET has correct path format", () => {
    expect(AUTH_ENDPOINTS.WS_TICKET).toBe("/auth/ws-ticket");
  });

  it("all paths start with /auth/ prefix", () => {
    Object.values(AUTH_ENDPOINTS).forEach((path) => {
      expect(path).toMatch(/^\/auth\//);
    });
  });

  it("all paths are non-empty strings", () => {
    Object.values(AUTH_ENDPOINTS).forEach((path) => {
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
    });
  });

  it("each value is unique (no duplicate paths)", () => {
    const values = Object.values(AUTH_ENDPOINTS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it("is declared with as const — values are literal path strings", () => {
    // TypeScript 'as const' provides type safety at compile time;
    // at runtime the object is a plain object (not frozen).
    for (const path of Object.values(AUTH_ENDPOINTS)) {
      expect(typeof path).toBe("string");
    }
  });
});
