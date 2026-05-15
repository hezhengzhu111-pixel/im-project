import { describe, expect, it } from "vitest";
import { applyMessageToSession } from "../index.js";
import type { ChatSession, Message } from "@im/shared-types";

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: "s1",
  type: "private",
  targetId: "u1",
  targetName: "User 1",
  unreadCount: 0,
  ...overrides,
});

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "m1",
  senderId: "u2",
  senderName: "User 2",
  isGroupChat: false,
  messageType: "TEXT",
  content: "hello",
  sendTime: "2026-05-15T10:00:00Z",
  status: "SENT",
  ...overrides,
});

describe("applyMessageToSession", () => {
  it("returns the session fields that must be updated from a message", () => {
    const session = makeSession({ lastActiveTime: "2026-05-15T08:00:00Z" });
    const message = makeMessage({ sendTime: "2026-05-15T10:00:00Z" });

    const result = applyMessageToSession(session, message);

    expect(result).toEqual({
      lastMessage: message,
      lastMessageTime: "2026-05-15T10:00:00Z",
      lastActiveTime: "2026-05-15T10:00:00Z",
      unreadIncrement: false,
    });
  });

  it("reports unreadIncrement when requested by the platform caller", () => {
    const result = applyMessageToSession(makeSession(), makeMessage(), {
      incrementUnread: true,
    });

    expect(result.unreadIncrement).toBe(true);
  });

  it("does not mutate the input session or message", () => {
    const session = makeSession({ unreadCount: 1 });
    const message = makeMessage();
    const originalSession = { ...session };
    const originalMessage = { ...message };

    applyMessageToSession(session, message, { incrementUnread: true });

    expect(session).toEqual(originalSession);
    expect(message).toEqual(originalMessage);
  });
});
