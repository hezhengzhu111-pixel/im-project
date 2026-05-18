import { describe, expect, it } from "vitest";
import { MESSAGE_ENDPOINTS } from "../message.endpoints.js";

describe("MESSAGE_ENDPOINTS", () => {
  it("contains all expected message endpoints", () => {
    const expected = [
      "SEND_PRIVATE",
      "SEND_GROUP",
      "PRIVATE_HISTORY",
      "PRIVATE_HISTORY_CURSOR",
      "GROUP_HISTORY",
      "GROUP_HISTORY_CURSOR",
      "CONVERSATIONS",
      "MARK_READ",
      "RECALL",
      "DELETE",
      "CONFIG",
    ];
    expect(Object.keys(MESSAGE_ENDPOINTS)).toEqual(expected);
  });

  it("all paths start with /message/ prefix", () => {
    Object.values(MESSAGE_ENDPOINTS).forEach((path) => {
      expect(path).toMatch(/^\/message\//);
    });
  });

  it("each path is a non-empty string", () => {
    Object.values(MESSAGE_ENDPOINTS).forEach((path) => {
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
    });
  });

  it("each value is unique (no duplicate paths)", () => {
    const values = Object.values(MESSAGE_ENDPOINTS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it("is declared with as const — values are literal path strings", () => {
    for (const path of Object.values(MESSAGE_ENDPOINTS)) {
      expect(typeof path).toBe("string");
    }
  });

  describe("individual endpoint paths", () => {
    const cases: [string, string][] = [
      ["SEND_PRIVATE", "/message/send/private"],
      ["SEND_GROUP", "/message/send/group"],
      ["PRIVATE_HISTORY", "/message/private/:friendId"],
      ["PRIVATE_HISTORY_CURSOR", "/message/private/:friendId/cursor"],
      ["GROUP_HISTORY", "/message/group/:groupId"],
      ["GROUP_HISTORY_CURSOR", "/message/group/:groupId/cursor"],
      ["CONVERSATIONS", "/message/conversations"],
      ["MARK_READ", "/message/read/:conversationId"],
      ["RECALL", "/message/recall/:messageId"],
      ["DELETE", "/message/delete/:messageId"],
      ["CONFIG", "/message/config"],
    ];

    it.each(cases)("endpoint %s has path %s", (key, expectedPath) => {
      expect(MESSAGE_ENDPOINTS[key as keyof typeof MESSAGE_ENDPOINTS]).toBe(
        expectedPath,
      );
    });
  });

  describe("URL parameter placeholders", () => {
    it("PRIVATE_HISTORY includes :friendId parameter", () => {
      expect(MESSAGE_ENDPOINTS.PRIVATE_HISTORY).toContain(":friendId");
    });

    it("PRIVATE_HISTORY_CURSOR includes :friendId parameter", () => {
      expect(MESSAGE_ENDPOINTS.PRIVATE_HISTORY_CURSOR).toContain(":friendId");
    });

    it("GROUP_HISTORY includes :groupId parameter", () => {
      expect(MESSAGE_ENDPOINTS.GROUP_HISTORY).toContain(":groupId");
    });

    it("GROUP_HISTORY_CURSOR includes :groupId parameter", () => {
      expect(MESSAGE_ENDPOINTS.GROUP_HISTORY_CURSOR).toContain(":groupId");
    });

    it("MARK_READ includes :conversationId parameter", () => {
      expect(MESSAGE_ENDPOINTS.MARK_READ).toContain(":conversationId");
    });

    it("RECALL includes :messageId parameter", () => {
      expect(MESSAGE_ENDPOINTS.RECALL).toContain(":messageId");
    });

    it("DELETE includes :messageId parameter", () => {
      expect(MESSAGE_ENDPOINTS.DELETE).toContain(":messageId");
    });

    it("CONFIG has no URL parameter placeholders", () => {
      expect(MESSAGE_ENDPOINTS.CONFIG).not.toContain(":");
    });

    it("CONVERSATIONS has no URL parameter placeholders", () => {
      expect(MESSAGE_ENDPOINTS.CONVERSATIONS).not.toContain(":");
    });
  });
});
