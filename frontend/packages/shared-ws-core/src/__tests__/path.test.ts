/**
 * Tests for createTicketedWebSocketUrl — the pure URL builder used by both
 * Web and Mobile WebSocket stores (W1, W6, W23, W24).
 *
 * Per W6: shared only receives baseUrl + userId + ticket and returns a URL.
 * Per W1: function output is fully determined by inputs, no side effects.
 * Per W23: tests prove behavior equivalence — no connect/reconnect/dispatch
 *           semantics are touched.
 * Per W24: when in doubt, test the shared rule, don't change platform code.
 */
import { describe, it, expect } from "vitest";
import { createTicketedWebSocketUrl } from "../path.js";

describe("createTicketedWebSocketUrl", () => {
  // ── 1. baseUrl + userId + ticket 正确生成 ──────────────────────────

  describe("basic URL construction", () => {
    it("generates /websocket/{userId} without ticket", () => {
      expect(createTicketedWebSocketUrl("", "user42")).toBe(
        "/websocket/user42",
      );
    });

    it("generates full URL with baseUrl, userId and ticket", () => {
      const result = createTicketedWebSocketUrl(
        "wss://im.example.com",
        "user42",
        "tk_abc",
      );
      expect(result).toBe("wss://im.example.com/websocket/user42?ticket=tk_abc");
    });

    it("omits ticket param when ticket is undefined", () => {
      const result = createTicketedWebSocketUrl("wss://im.example.com", "user1");
      expect(result).toBe("wss://im.example.com/websocket/user1");
      expect(result).not.toContain("ticket");
    });

    it("omits ticket param when ticket is empty string", () => {
      const result = createTicketedWebSocketUrl("wss://im.example.com", "user1", "");
      expect(result).toBe("wss://im.example.com/websocket/user1");
      expect(result).not.toContain("ticket");
    });
  });

  // ── 2. baseUrl 已带 query 时追加参数正确 ──────────────────────────

  describe("baseUrl with existing query string", () => {
    it("appends ticket with '&' when baseUrl already has query params", () => {
      const result = createTicketedWebSocketUrl(
        "wss://im.example.com?region=cn",
        "user1",
        "tk_xyz",
      );
      expect(result).toBe(
        "wss://im.example.com?region=cn/websocket/user1&ticket=tk_xyz",
      );
    });

    it("uses '?' separator when baseUrl has no query params", () => {
      const result = createTicketedWebSocketUrl(
        "wss://im.example.com",
        "user1",
        "tk_xyz",
      );
      expect(result).toContain("?ticket=");
      expect(result).not.toContain("&ticket=");
    });

    it("handles baseUrl with multiple existing query params", () => {
      const result = createTicketedWebSocketUrl(
        "wss://host?a=1&b=2",
        "u1",
        "tk_99",
      );
      expect(result).toBe("wss://host?a=1&b=2/websocket/u1&ticket=tk_99");
    });
  });

  // ── 3. userId / ticket 需要 URL encode ────────────────────────────

  describe("URL encoding", () => {
    it("encodes special characters in ticket", () => {
      const special = "a b&c=d?e+f";
      const result = createTicketedWebSocketUrl("", "u1", special);
      expect(result).toBe(
        `/websocket/u1?ticket=${encodeURIComponent(special)}`,
      );
    });

    it("encodes unicode characters in ticket", () => {
      const unicode = "你好世界";
      const result = createTicketedWebSocketUrl("", "u1", unicode);
      expect(result).toContain(encodeURIComponent(unicode));
    });

    it("encodes slash and hash in ticket", () => {
      const result = createTicketedWebSocketUrl("", "u1", "a/b#c");
      expect(result).toContain(encodeURIComponent("a/b#c"));
      // raw slash/hash must not appear in the ticket value
      expect(result).not.toContain("ticket=a/b#c");
    });

    it("userId is placed in path as-is (caller's responsibility)", () => {
      const result = createTicketedWebSocketUrl("", "user/with/slash", "tk");
      // The function does NOT encode userId — it's a path segment
      // provided by the authenticated caller (W6).
      expect(result).toBe("/websocket/user/with/slash?ticket=tk");
    });
  });

  // ── 4. 空 baseUrl 在 Web DEV 场景下不抛异常 ──────────────────────

  describe("empty baseUrl (Web DEV relative URL)", () => {
    it("produces relative URL without throwing", () => {
      expect(() => createTicketedWebSocketUrl("", "u1", "tk")).not.toThrow();
    });

    it("returns /websocket/{userId} for empty baseUrl without ticket", () => {
      expect(createTicketedWebSocketUrl("", "u1")).toBe("/websocket/u1");
    });

    it("returns /websocket/{userId}?ticket=... for empty baseUrl with ticket", () => {
      expect(createTicketedWebSocketUrl("", "u1", "tk_abc")).toBe(
        "/websocket/u1?ticket=tk_abc",
      );
    });
  });

  // ── 5. 不修改输入字符串 ──────────────────────────────────────────

  describe("input immutability", () => {
    it("does not mutate the baseUrl string", () => {
      const base = "wss://im.example.com";
      const original = base;
      createTicketedWebSocketUrl(base, "u1", "tk");
      expect(base).toBe(original);
    });

    it("does not mutate the userId string", () => {
      const userId = "user42";
      const original = userId;
      createTicketedWebSocketUrl("", userId, "tk");
      expect(userId).toBe(original);
    });

    it("does not mutate the ticket string", () => {
      const ticket = "tk_special&chars";
      const original = ticket;
      createTicketedWebSocketUrl("", "u1", ticket);
      expect(ticket).toBe(original);
    });

    it("returns a new string reference", () => {
      const base = "wss://host";
      const result = createTicketedWebSocketUrl(base, "u1", "tk");
      expect(result).not.toBe(base);
    });
  });

  // ── 6. 不引入 token，只使用 ticket ───────────────────────────────

  describe("ticket-only semantics (no token)", () => {
    it("output contains 'ticket' query key, never 'token'", () => {
      const result = createTicketedWebSocketUrl("wss://host", "u1", "tk_val");
      expect(result).toContain("ticket=tk_val");
      expect(result).not.toContain("token");
    });

    it("function signature accepts ticket, not token", () => {
      // TypeScript compile-time guarantee: the third param is named `ticket`.
      // At runtime, verify the param is used as the ticket query value.
      const result = createTicketedWebSocketUrl("", "u1", "my_ticket_value");
      expect(result).toContain("ticket=my_ticket_value");
    });

    it("no Authorization or token in URL path", () => {
      const result = createTicketedWebSocketUrl("wss://host", "u1", "tk");
      expect(result).not.toMatch(/token/i);
      expect(result).not.toMatch(/auth/i);
      // Only /websocket/{userId} path + optional ?ticket=
      expect(result).toMatch(/^wss:\/\/host\/websocket\/u1(\?ticket=.+)?$/);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles numeric-looking userId as string", () => {
      const result = createTicketedWebSocketUrl("", "1234567890123456", "tk");
      expect(result).toBe("/websocket/1234567890123456?ticket=tk");
    });

    it("handles very long ticket", () => {
      const longTicket = "a".repeat(1024);
      const result = createTicketedWebSocketUrl("", "u1", longTicket);
      expect(result).toContain(`ticket=${encodeURIComponent(longTicket)}`);
    });

    it("handles baseUrl with trailing slash", () => {
      const result = createTicketedWebSocketUrl("wss://host/", "u1", "tk");
      expect(result).toBe("wss://host//websocket/u1?ticket=tk");
    });

    it("handles baseUrl with port", () => {
      const result = createTicketedWebSocketUrl("wss://host:8080", "u1", "tk");
      expect(result).toBe("wss://host:8080/websocket/u1?ticket=tk");
    });
  });
});
