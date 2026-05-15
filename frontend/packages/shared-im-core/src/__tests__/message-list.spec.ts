import { describe, it, expect } from "vitest";
import { applyIncomingMessageToList, MESSAGE_WINDOW_SIZE } from "../index.js";
import type { Message } from "@im/shared-types";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "1",
    senderId: "u1",
    isGroupChat: false,
    messageType: "TEXT",
    content: "",
    sendTime: "2024-01-01T00:00:00.000Z",
    status: "SENT",
    ...overrides,
  };
}

describe("applyIncomingMessageToList", () => {
  it("appends a new message to an empty list", () => {
    const incoming = makeMessage({ id: "10", content: "hello" });
    const result = applyIncomingMessageToList([], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("hello");
  });

  it("appends a new message with different identity", () => {
    const existing = makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00Z" });
    const incoming = makeMessage({ id: "2", sendTime: "2024-01-01T00:00:01Z" });
    const result = applyIncomingMessageToList([existing], incoming);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("deduplicates by id", () => {
    const existing = makeMessage({
      id: "100",
      content: "old",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const incoming = makeMessage({
      id: "100",
      content: "updated",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const result = applyIncomingMessageToList([existing], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("updated");
  });

  it("deduplicates by messageId", () => {
    const existing = makeMessage({
      id: "local_1",
      messageId: "msg_999",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const incoming = makeMessage({
      id: "server_999",
      messageId: "msg_999",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const result = applyIncomingMessageToList([existing], incoming);
    expect(result).toHaveLength(1);
  });

  it("merges pending local with server echo via clientMessageId", () => {
    const pending = makeMessage({
      id: "local_abc",
      clientMessageId: "cid_123",
      content: "pending text",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const server = makeMessage({
      id: "500",
      clientMessageId: "cid_123",
      content: "server text",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const result = applyIncomingMessageToList([pending], server);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("500");
    expect(result[0].clientMessageId).toBe("cid_123");
  });

  it("preserves server id when merging pending and server echo", () => {
    const pending = makeMessage({
      id: "local_xyz",
      clientMessageId: "cid_456",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const server = makeMessage({
      id: "777",
      clientMessageId: "cid_456",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const result = applyIncomingMessageToList([pending], server);
    expect(result[0].id).toBe("777");
  });

  it("merges by clientMessageId alone when no id/messageId match", () => {
    const pending = makeMessage({
      id: "local_1",
      clientMessageId: "unique_cid",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const server = makeMessage({
      id: "200",
      clientMessageId: "unique_cid",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const result = applyIncomingMessageToList([pending], server);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("200");
  });

  it("sorts messages by sendTime ascending", () => {
    const later = makeMessage({
      id: "2",
      sendTime: "2024-06-15T12:00:00Z",
    });
    const earlier = makeMessage({
      id: "1",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const result = applyIncomingMessageToList([later], earlier);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("trims to window limit with keep=latest (default)", () => {
    const existing: Message[] = [];
    for (let i = 0; i < MESSAGE_WINDOW_SIZE; i++) {
      existing.push(
        makeMessage({
          id: String(i),
          sendTime: `2024-01-01T00:00:${String(i).padStart(2, "0")}Z`,
        }),
      );
    }
    const incoming = makeMessage({
      id: "new",
      sendTime: "2024-12-31T23:59:59Z",
    });
    const result = applyIncomingMessageToList(existing, incoming);
    expect(result).toHaveLength(MESSAGE_WINDOW_SIZE);
    expect(result[result.length - 1].id).toBe("new");
  });

  it("trims to custom windowLimit", () => {
    const existing: Message[] = [];
    for (let i = 0; i < 5; i++) {
      existing.push(
        makeMessage({
          id: String(i),
          sendTime: `2024-01-01T00:00:${String(i).padStart(2, "0")}Z`,
        }),
      );
    }
    const incoming = makeMessage({
      id: "new",
      sendTime: "2024-12-31T23:59:59Z",
    });
    const result = applyIncomingMessageToList(existing, incoming, {
      windowLimit: 3,
    });
    expect(result).toHaveLength(3);
    expect(result[result.length - 1].id).toBe("new");
  });

  it("keeps all messages with keep=all", () => {
    const existing: Message[] = [];
    for (let i = 0; i < MESSAGE_WINDOW_SIZE + 10; i++) {
      existing.push(
        makeMessage({
          id: String(i),
          sendTime: `2024-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
        }),
      );
    }
    const incoming = makeMessage({
      id: "new",
      sendTime: "2024-12-31T23:59:59Z",
    });
    const result = applyIncomingMessageToList(existing, incoming, {
      keep: "all",
    });
    expect(result).toHaveLength(existing.length + 1);
  });

  it("does not mutate the input array", () => {
    const existing = [
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00Z" }),
    ];
    const originalLength = existing.length;
    const incoming = makeMessage({
      id: "2",
      sendTime: "2024-01-01T00:00:01Z",
    });
    applyIncomingMessageToList(existing, incoming);
    expect(existing).toHaveLength(originalLength);
    expect(existing[0].id).toBe("1");
  });

  it("does not mutate the input message objects", () => {
    const existing = makeMessage({
      id: "1",
      content: "original",
      sendTime: "2024-01-01T00:00:00Z",
    });
    const incoming = makeMessage({
      id: "2",
      content: "incoming",
      sendTime: "2024-01-01T00:00:01Z",
    });
    const originalExistingContent = existing.content;
    const originalIncomingContent = incoming.content;
    applyIncomingMessageToList([existing], incoming);
    expect(existing.content).toBe(originalExistingContent);
    expect(incoming.content).toBe(originalIncomingContent);
  });
});
