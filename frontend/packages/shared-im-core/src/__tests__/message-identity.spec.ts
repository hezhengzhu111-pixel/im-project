import { describe, it, expect } from "vitest";
import { messageIdentityValues, hasSameMessageIdentity } from "../message-identity.js";
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

describe("messageIdentityValues", () => {
  it("returns messageId first (highest priority)", () => {
    const message = makeMessage({
      id: "local_1",
      messageId: "srv_1",
      clientMessageId: "cm_1",
    });
    const identities = messageIdentityValues(message);
    expect(identities[0]).toBe("srv_1");
    expect(identities[1]).toBe("cm_1");
    expect(identities[2]).toBe("local_1");
  });

  it("skips empty values", () => {
    const message = makeMessage({ id: "local_1" });
    const identities = messageIdentityValues(message);
    expect(identities).toEqual(["local_1"]);
  });

  it("returns empty array when no identities", () => {
    const message = makeMessage({ id: "" });
    const identities = messageIdentityValues(message);
    expect(identities).toEqual([]);
  });
});

describe("hasSameMessageIdentity", () => {
  it("matches by messageId", () => {
    const left = makeMessage({
      id: "local_1",
      messageId: "srv_1",
      status: "SENDING",
    });
    const right = makeMessage({
      id: "srv_1",
      messageId: "srv_1",
      status: "SENT",
    });
    expect(hasSameMessageIdentity(left, right)).toBe(true);
  });

  it("matches by clientMessageId", () => {
    const left = makeMessage({
      id: "local_1",
      clientMessageId: "cm_1",
      status: "SENDING",
    });
    const right = makeMessage({
      id: "srv_1",
      clientMessageId: "cm_1",
      sendTime: "2024-06-01T10:00:01Z",
      status: "SENT",
    });
    expect(hasSameMessageIdentity(left, right)).toBe(true);
  });

  it("does not match when no shared identities", () => {
    const left = makeMessage({
      id: "local_1",
      status: "SENDING",
    });
    const right = makeMessage({
      id: "srv_1",
      sendTime: "2024-06-01T10:00:01Z",
      status: "SENT",
    });
    expect(hasSameMessageIdentity(left, right)).toBe(false);
  });
});
