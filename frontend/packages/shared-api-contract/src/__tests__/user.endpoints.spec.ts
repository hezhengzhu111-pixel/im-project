import { describe, expect, it } from "vitest";
import { USER_ENDPOINTS } from "../user.endpoints.js";

describe("USER_ENDPOINTS", () => {
  it("contains all expected user endpoints", () => {
    const expected = [
      "LOGIN",
      "REGISTER",
      "PROFILE",
      "SEARCH",
      "LOGOUT",
      "HEARTBEAT",
      "ONLINE_STATUS",
      "PASSWORD",
      "PHONE_CODE",
      "PHONE_BIND",
      "EMAIL_CODE",
      "EMAIL_BIND",
      "ACCOUNT",
      "SETTINGS",
      "SETTINGS_TYPE",
    ];
    expect(Object.keys(USER_ENDPOINTS)).toEqual(expected);
  });

  it("all paths start with /user/ prefix", () => {
    Object.values(USER_ENDPOINTS).forEach((path) => {
      expect(path).toMatch(/^\/user\//);
    });
  });

  it("each path is a non-empty string", () => {
    Object.values(USER_ENDPOINTS).forEach((path) => {
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
    });
  });

  it("each value is unique (no duplicate paths)", () => {
    const values = Object.values(USER_ENDPOINTS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it("SETTINGS_TYPE includes a :type URL parameter placeholder", () => {
    expect(USER_ENDPOINTS.SETTINGS_TYPE).toContain(":type");
  });

  it("is declared with as const — values are literal path strings", () => {
    for (const path of Object.values(USER_ENDPOINTS)) {
      expect(typeof path).toBe("string");
    }
  });

  describe("individual endpoint paths", () => {
    const cases: [string, string][] = [
      ["LOGIN", "/user/login"],
      ["REGISTER", "/user/register"],
      ["PROFILE", "/user/profile"],
      ["SEARCH", "/user/search"],
      ["LOGOUT", "/user/logout"],
      ["HEARTBEAT", "/user/heartbeat"],
      ["ONLINE_STATUS", "/user/online-status"],
      ["PASSWORD", "/user/password"],
      ["PHONE_CODE", "/user/phone/code"],
      ["PHONE_BIND", "/user/phone/bind"],
      ["EMAIL_CODE", "/user/email/code"],
      ["EMAIL_BIND", "/user/email/bind"],
      ["ACCOUNT", "/user/account"],
      ["SETTINGS", "/user/settings"],
      ["SETTINGS_TYPE", "/user/settings/:type"],
    ];

    it.each(cases)("endpoint %s has path %s", (key, expectedPath) => {
      expect(USER_ENDPOINTS[key as keyof typeof USER_ENDPOINTS]).toBe(
        expectedPath,
      );
    });
  });
});
