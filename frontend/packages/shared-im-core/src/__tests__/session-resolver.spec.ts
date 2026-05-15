import { describe, expect, it } from "vitest";
import { resolveMessageSessionId } from "../session-resolver.js";
import type { Message } from "@im/shared-types";

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "1",
  senderId: "u1",
  isGroupChat: false,
  messageType: "TEXT",
  content: "",
  sendTime: "2024-01-01T00:00:00.000Z",
  status: "SENT",
  ...overrides,
});

describe("resolveMessageSessionId", () => {
  describe("group messages", () => {
    it("returns group session ID for group message", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u1",
        isGroupChat: true,
        groupId: "g1",
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBe("group_g1");
    });

    it("returns null for group message without groupId", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u1",
        isGroupChat: true,
        groupId: undefined,
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBeNull();
    });

    it("returns null for group message with empty groupId", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u1",
        isGroupChat: true,
        groupId: "",
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBeNull();
    });

    it("ignores currentUserId for group messages", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u2",
        isGroupChat: true,
        groupId: "g1",
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBe("group_g1");
    });
  });

  describe("private messages - current user is sender", () => {
    it("returns session ID with receiver as target", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u1",
        receiverId: "u2",
        isGroupChat: false,
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBe("u1_u2");
    });

    it("normalizes session ID with smaller ID first", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u200",
        receiverId: "u100",
        isGroupChat: false,
      });
      const result = resolveMessageSessionId(message, "u200");
      expect(result).toBe("u100_u200");
    });
  });

  describe("private messages - current user is receiver", () => {
    it("returns session ID with sender as target", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u2",
        receiverId: "u1",
        isGroupChat: false,
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBe("u1_u2");
    });

    it("normalizes session ID with smaller ID first when receiver is current user", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u50",
        receiverId: "u200",
        isGroupChat: false,
      });
      const result = resolveMessageSessionId(message, "u200");
      // targetId = senderId = "u50", currentUserId = "u200"
      // compareIds("u200", "u50") < 0 is true (string comparison: "u200" < "u50")
      // so result is "u200_u50"
      expect(result).toBe("u200_u50");
    });
  });

  describe("edge cases", () => {
    it("returns null when senderId is missing", () => {
      const message = makeMessage({
        id: "1",
        senderId: "",
        receiverId: "u2",
        isGroupChat: false,
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBeNull();
    });

    it("returns null when receiverId is missing", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u1",
        receiverId: undefined,
        isGroupChat: false,
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBeNull();
    });

    it("returns null when receiverId is empty string", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u1",
        receiverId: "",
        isGroupChat: false,
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBeNull();
    });

    it("handles message with both groupId and receiverId", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u1",
        receiverId: "u2",
        isGroupChat: true,
        groupId: "g1",
      });
      const result = resolveMessageSessionId(message, "u1");
      expect(result).toBe("group_g1");
    });

    it("handles currentUserId not in message participants", () => {
      const message = makeMessage({
        id: "1",
        senderId: "u2",
        receiverId: "u3",
        isGroupChat: false,
      });
      const result = resolveMessageSessionId(message, "u1");
      // targetId = senderId = "u2" (since "u2" !== currentUserId "u1")
      // buildSessionId("private", "u1", "u2") = "u1_u2" (u1 < u2)
      expect(result).toBe("u1_u2");
    });
  });
});
