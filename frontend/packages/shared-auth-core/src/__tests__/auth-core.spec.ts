import { describe, it, expect } from "vitest";
import {
  isTokenExpired,
  getUserIdFromToken,
  classifyRefreshFailureStatus,
  shouldSkipRefreshEndpoint,
  getUserRolesFromToken,
} from "../index.js";

/**
 * Build a minimal JWT token for testing.
 * Creates header.payload.signature with base64-encoded JSON.
 */
function buildTestToken(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "");
  return `${encode(header)}.${encode(payload)}.test-sig`;
}

describe("isTokenExpired", () => {
  it("returns true for empty string", () => {
    expect(isTokenExpired("")).toBe(true);
  });

  it("returns true for malformed token", () => {
    expect(isTokenExpired("not-a-jwt")).toBe(true);
  });

  it("returns true for expired token", () => {
    // exp in the past (year 2020)
    const token = buildTestToken({ exp: 1577836800 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it("returns true for token expiring within 5 minutes", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Expires in 2 minutes (within the 5-minute safety margin)
    const token = buildTestToken({ exp: nowSeconds + 120 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it("returns false for valid token with far-future exp", () => {
    // Expires in 1 hour
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = buildTestToken({ exp: nowSeconds + 3600 });
    expect(isTokenExpired(token)).toBe(false);
  });
});

describe("getUserIdFromToken", () => {
  it("returns null for empty string", () => {
    expect(getUserIdFromToken("")).toBeNull();
  });

  it("returns null for malformed token", () => {
    expect(getUserIdFromToken("bad")).toBeNull();
  });

  it("extracts userId from 'sub' claim", () => {
    const token = buildTestToken({ sub: "user123" });
    expect(getUserIdFromToken(token)).toBe("user123");
  });

  it("extracts userId from 'userId' claim", () => {
    const token = buildTestToken({ userId: "user456" });
    expect(getUserIdFromToken(token)).toBe("user456");
  });

  it("extracts userId from 'id' claim", () => {
    const token = buildTestToken({ id: "user789" });
    expect(getUserIdFromToken(token)).toBe("user789");
  });

  it("prefers 'sub' over other claims", () => {
    const token = buildTestToken({ sub: "sub-value", userId: "uid-value", id: "id-value" });
    expect(getUserIdFromToken(token)).toBe("sub-value");
  });

  it("converts numeric userId to string", () => {
    const token = buildTestToken({ sub: 12345 });
    expect(getUserIdFromToken(token)).toBe("12345");
  });

  it("returns null when no userId claims present", () => {
    const token = buildTestToken({ exp: 9999999999 });
    expect(getUserIdFromToken(token)).toBeNull();
  });
});

describe("getUserRolesFromToken", () => {
  it("returns empty array for empty string", () => {
    expect(getUserRolesFromToken("")).toEqual([]);
  });

  it("returns empty array for malformed token", () => {
    expect(getUserRolesFromToken("bad")).toEqual([]);
  });

  it("extracts roles from 'roles' claim", () => {
    const token = buildTestToken({ roles: ["admin", "user"] });
    expect(getUserRolesFromToken(token)).toEqual(["admin", "user"]);
  });

  it("extracts roles from 'authorities' claim", () => {
    const token = buildTestToken({ authorities: ["ROLE_ADMIN"] });
    expect(getUserRolesFromToken(token)).toEqual(["ROLE_ADMIN"]);
  });

  it("returns empty array when no roles present", () => {
    const token = buildTestToken({ sub: "user1" });
    expect(getUserRolesFromToken(token)).toEqual([]);
  });
});

describe("classifyRefreshFailureStatus", () => {
  it("returns authInvalid for 400", () => {
    expect(classifyRefreshFailureStatus(400)).toBe("authInvalid");
  });

  it("returns authInvalid for 401", () => {
    expect(classifyRefreshFailureStatus(401)).toBe("authInvalid");
  });

  it("returns authInvalid for 403", () => {
    expect(classifyRefreshFailureStatus(403)).toBe("authInvalid");
  });

  it("returns transientError for 500", () => {
    expect(classifyRefreshFailureStatus(500)).toBe("transientError");
  });

  it("returns transientError for 502", () => {
    expect(classifyRefreshFailureStatus(502)).toBe("transientError");
  });

  it("returns transientError for 503", () => {
    expect(classifyRefreshFailureStatus(503)).toBe("transientError");
  });

  it("returns transientError for network-like status codes", () => {
    expect(classifyRefreshFailureStatus(0)).toBe("transientError");
    expect(classifyRefreshFailureStatus(408)).toBe("transientError");
    expect(classifyRefreshFailureStatus(429)).toBe("transientError");
  });
});

describe("shouldSkipRefreshEndpoint", () => {
  it("returns true for /auth/parse", () => {
    expect(shouldSkipRefreshEndpoint("/api/auth/parse")).toBe(true);
  });

  it("returns true for /auth/refresh", () => {
    expect(shouldSkipRefreshEndpoint("/api/auth/refresh")).toBe(true);
  });

  it("returns true for /user/login", () => {
    expect(shouldSkipRefreshEndpoint("/api/user/login")).toBe(true);
  });

  it("returns true for /user/register", () => {
    expect(shouldSkipRefreshEndpoint("/api/user/register")).toBe(true);
  });

  it("returns true for /user/logout", () => {
    expect(shouldSkipRefreshEndpoint("/api/user/logout")).toBe(true);
  });

  it("returns true for /user/offline", () => {
    expect(shouldSkipRefreshEndpoint("/api/user/offline")).toBe(true);
  });

  it("returns true for /user/heartbeat", () => {
    expect(shouldSkipRefreshEndpoint("/api/user/heartbeat")).toBe(true);
  });

  it("returns false for non-auth endpoints", () => {
    expect(shouldSkipRefreshEndpoint("/api/message/send")).toBe(false);
    expect(shouldSkipRefreshEndpoint("/api/user/profile")).toBe(false);
    expect(shouldSkipRefreshEndpoint("/api/friend/list")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(shouldSkipRefreshEndpoint("")).toBe(false);
  });
});
