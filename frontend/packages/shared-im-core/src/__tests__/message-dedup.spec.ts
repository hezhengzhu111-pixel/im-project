import { describe, expect, it } from "vitest";
import {
  dedupeMessages,
  mergeMessagesChronologically,
  mergeServerMessageWithPending,
  applyMessageToMessageList,
} from "../message-dedup.js";
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

describe("dedupeMessages", () => {
  it("removes duplicates by id", () => {
    const messages = [
      makeMessage({ id: "1", content: "first" }),
      makeMessage({ id: "1", content: "second" }),
      makeMessage({ id: "2" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("first");
    expect(result[1].id).toBe("2");
  });

  it("removes duplicates by messageId", () => {
    const messages = [
      makeMessage({ id: "1", messageId: "m1" }),
      makeMessage({ id: "2", messageId: "m1" }),
      makeMessage({ id: "3", messageId: "m2" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("3");
  });

  it("removes duplicates by clientMessageId", () => {
    const messages = [
      makeMessage({ id: "local_1", clientMessageId: "cm1" }),
      makeMessage({ id: "server_1", clientMessageId: "cm1" }),
      makeMessage({ id: "3" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("local_1");
    expect(result[1].id).toBe("3");
  });

  it("keeps first occurrence when multiple identities match", () => {
    const messages = [
      makeMessage({ id: "1", messageId: "m1", clientMessageId: "cm1" }),
      makeMessage({ id: "2", messageId: "m1" }),
      makeMessage({ id: "3", clientMessageId: "cm1" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns empty array for empty input", () => {
    expect(dedupeMessages([])).toEqual([]);
  });

  it("returns all unique messages", () => {
    const messages = [
      makeMessage({ id: "1" }),
      makeMessage({ id: "2" }),
      makeMessage({ id: "3" }),
    ];
    const result = dedupeMessages(messages);
    expect(result).toHaveLength(3);
  });

  it("does not mutate input array", () => {
    const msg = makeMessage({ id: "1" });
    const messages = [msg, makeMessage({ id: "2" })];
    const originalLength = messages.length;
    dedupeMessages(messages);
    expect(messages).toHaveLength(originalLength);
  });
});

describe("mergeMessagesChronologically", () => {
  it("merges two lists in chronological order", () => {
    const list1 = [
      makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" }),
      makeMessage({ id: "3", sendTime: "2024-01-03T00:00:00.000Z" }),
    ];
    const list2 = [
      makeMessage({ id: "2", sendTime: "2024-01-02T00:00:00.000Z" }),
      makeMessage({ id: "4", sendTime: "2024-01-04T00:00:00.000Z" }),
    ];
    const result = mergeMessagesChronologically(list1, list2);
    expect(result.map((m) => m.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("deduplicates by id and keeps later occurrence", () => {
    const list1 = [
      makeMessage({ id: "1", content: "old", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const list2 = [
      makeMessage({ id: "1", content: "new", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = mergeMessagesChronologically(list1, list2);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("new");
  });

  it("deduplicates by messageId", () => {
    const list1 = [
      makeMessage({ id: "local_1", messageId: "m1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const list2 = [
      makeMessage({ id: "server_1", messageId: "m1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = mergeMessagesChronologically(list1, list2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server_1");
  });

  it("deduplicates by clientMessageId", () => {
    const list1 = [
      makeMessage({ id: "local_1", clientMessageId: "cm1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const list2 = [
      makeMessage({ id: "server_1", clientMessageId: "cm1", sendTime: "2024-01-01T00:00:00.000Z" }),
    ];
    const result = mergeMessagesChronologically(list1, list2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server_1");
  });

  it("preserves server id when merging pending and server echo", () => {
    const pending = makeMessage({
      id: "local_abc",
      clientMessageId: "cm1",
      content: "pending",
      sendTime: "2024-01-01T00:00:00.000Z",
    });
    const server = makeMessage({
      id: "server_123",
      clientMessageId: "cm1",
      content: "server",
      sendTime: "2024-01-01T00:00:00.000Z",
    });
    const result = mergeMessagesChronologically([pending], [server]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server_123");
    expect(result[0].content).toBe("server");
  });

  it("handles three lists", () => {
    const list1 = [makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" })];
    const list2 = [makeMessage({ id: "2", sendTime: "2024-01-02T00:00:00.000Z" })];
    const list3 = [makeMessage({ id: "3", sendTime: "2024-01-03T00:00:00.000Z" })];
    const result = mergeMessagesChronologically(list1, list2, list3);
    expect(result.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("handles empty lists", () => {
    expect(mergeMessagesChronologically([], [])).toEqual([]);
  });

  it("handles single list", () => {
    const list = [makeMessage({ id: "1" })];
    const result = mergeMessagesChronologically(list);
    expect(result).toHaveLength(1);
  });

  it("does not mutate input arrays", () => {
    const msg1 = makeMessage({ id: "1" });
    const msg2 = makeMessage({ id: "2" });
    const list1 = [msg1];
    const list2 = [msg2];
    mergeMessagesChronologically(list1, list2);
    expect(list1).toHaveLength(1);
    expect(list2).toHaveLength(1);
    expect(list1[0]).toBe(msg1);
    expect(list2[0]).toBe(msg2);
  });
});

describe("mergeServerMessageWithPending", () => {
  it("merges pending message with server echo", () => {
    const pending = makeMessage({
      id: "local_abc",
      clientMessageId: "cm1",
      content: "pending text",
      senderId: "u1",
      status: "SENDING",
    });
    const server = makeMessage({
      id: "server_123",
      clientMessageId: "cm1",
      content: "server text",
      senderId: "u1",
      status: "SENT",
    });
    const result = mergeServerMessageWithPending(pending, server);
    expect(result.id).toBe("server_123");
    expect(result.clientMessageId).toBe("cm1");
    expect(result.content).toBe("server text");
    expect(result.status).toBe("SENT");
  });

  it("preserves server id over pending id", () => {
    const pending = makeMessage({ id: "local_abc" });
    const server = makeMessage({ id: "server_123" });
    const result = mergeServerMessageWithPending(pending, server);
    expect(result.id).toBe("server_123");
  });

  it("preserves server messageId", () => {
    const pending = makeMessage({ id: "local_abc", messageId: "local_msg" });
    const server = makeMessage({ id: "server_123", messageId: "server_msg" });
    const result = mergeServerMessageWithPending(pending, server);
    expect(result.messageId).toBe("server_msg");
  });

  it("falls back to pending messageId when server has none", () => {
    const pending = makeMessage({ id: "local_abc", messageId: "pending_msg" });
    const server = makeMessage({ id: "server_123", messageId: undefined });
    const result = mergeServerMessageWithPending(pending, server);
    expect(result.messageId).toBe("pending_msg");
  });

  it("falls back to pending clientMessageId when server has none", () => {
    const pending = makeMessage({ id: "local_abc", clientMessageId: "cm1" });
    const server = makeMessage({ id: "server_123", clientMessageId: undefined });
    const result = mergeServerMessageWithPending(pending, server);
    expect(result.clientMessageId).toBe("cm1");
  });

  it("merges all fields from server message", () => {
    const pending = makeMessage({
      id: "local_abc",
      content: "old",
      senderName: "Old Name",
    });
    const server = makeMessage({
      id: "server_123",
      content: "new",
      senderName: "New Name",
      extra: { foo: "bar" },
    });
    const result = mergeServerMessageWithPending(pending, server);
    expect(result.content).toBe("new");
    expect(result.senderName).toBe("New Name");
    expect(result.extra).toEqual({ foo: "bar" });
  });

  it("does not mutate input messages", () => {
    const pending = makeMessage({ id: "local_abc", content: "pending" });
    const server = makeMessage({ id: "server_123", content: "server" });
    const originalPending = { ...pending };
    const originalServer = { ...server };
    mergeServerMessageWithPending(pending, server);
    expect(pending).toEqual(originalPending);
    expect(server).toEqual(originalServer);
  });

  it("prefers server sendTime over pending sendTime", () => {
    const pending: Message = {
      id: "local_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "TEXT",
      content: "hello",
      sendTime: "2024-06-01T10:00:00Z",
      status: "SENDING",
    };
    const server: Message = {
      id: "srv_1",
      messageId: "srv_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "TEXT",
      content: "hello",
      sendTime: "2024-06-01T10:00:01Z",
      status: "SENT",
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.sendTime).toBe("2024-06-01T10:00:01Z");
  });

  it("preserves local mediaUrl when server has no mediaUrl", () => {
    const pending: Message = {
      id: "local_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "IMAGE",
      content: "",
      mediaUrl: "file:///local/photo.jpg",
      sendTime: "2024-06-01T10:00:00Z",
      status: "SENDING",
    };
    const server: Message = {
      id: "srv_1",
      messageId: "srv_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "IMAGE",
      content: "",
      mediaUrl: undefined,
      sendTime: "2024-06-01T10:00:01Z",
      status: "SENT",
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.mediaUrl).toBe("file:///local/photo.jpg");
  });

  it("uses server mediaUrl when server has mediaUrl", () => {
    const pending: Message = {
      id: "local_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "IMAGE",
      content: "",
      mediaUrl: "file:///local/photo.jpg",
      sendTime: "2024-06-01T10:00:00Z",
      status: "SENDING",
    };
    const server: Message = {
      id: "srv_1",
      messageId: "srv_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "IMAGE",
      content: "",
      mediaUrl: "https://cdn.example.com/photo.jpg",
      sendTime: "2024-06-01T10:00:01Z",
      status: "SENT",
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.mediaUrl).toBe("https://cdn.example.com/photo.jpg");
  });

  it("preserves local thumbnailUrl when server has none", () => {
    const pending: Message = {
      id: "local_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "IMAGE",
      content: "",
      thumbnailUrl: "file:///local/thumb.jpg",
      sendTime: "2024-06-01T10:00:00Z",
      status: "SENDING",
    };
    const server: Message = {
      id: "srv_1",
      messageId: "srv_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "IMAGE",
      content: "",
      thumbnailUrl: undefined,
      sendTime: "2024-06-01T10:00:01Z",
      status: "SENT",
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.thumbnailUrl).toBe("file:///local/thumb.jpg");
  });

  it("preserves local mediaName and mediaSize when server has none", () => {
    const pending: Message = {
      id: "local_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "FILE",
      content: "",
      mediaName: "document.pdf",
      mediaSize: 1024,
      sendTime: "2024-06-01T10:00:00Z",
      status: "SENDING",
    };
    const server: Message = {
      id: "srv_1",
      messageId: "srv_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "FILE",
      content: "",
      mediaName: undefined,
      mediaSize: undefined,
      sendTime: "2024-06-01T10:00:01Z",
      status: "SENT",
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.mediaName).toBe("document.pdf");
    expect(merged.mediaSize).toBe(1024);
  });

  it("falls back to pending sendTime when server has none", () => {
    const pending: Message = {
      id: "local_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "TEXT",
      content: "hello",
      sendTime: "2024-06-01T10:00:00Z",
      status: "SENDING",
    };
    const server: Message = {
      id: "srv_1",
      messageId: "srv_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "TEXT",
      content: "hello",
      sendTime: undefined as unknown as string,
      status: "SENT",
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.sendTime).toBe("2024-06-01T10:00:00Z");
  });

  it("prefers server status", () => {
    const pending: Message = {
      id: "local_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "TEXT",
      content: "hello",
      sendTime: "2024-06-01T10:00:00Z",
      status: "SENDING",
    };
    const server: Message = {
      id: "srv_1",
      messageId: "srv_1",
      clientMessageId: "cm_1",
      senderId: "u1",
      isGroupChat: false,
      messageType: "TEXT",
      content: "hello",
      sendTime: "2024-06-01T10:00:01Z",
      status: "DELIVERED",
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.status).toBe("DELIVERED");
  });
});

describe("applyMessageToMessageList", () => {
  it("appends new message to empty list", () => {
    const incoming = makeMessage({ id: "1", content: "hello" });
    const result = applyMessageToMessageList([], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("hello");
  });

  it("appends new message with different identity", () => {
    const existing = makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" });
    const incoming = makeMessage({ id: "2", sendTime: "2024-01-02T00:00:00.000Z" });
    const result = applyMessageToMessageList([existing], incoming);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("deduplicates by id", () => {
    const existing = makeMessage({ id: "1", content: "old", sendTime: "2024-01-01T00:00:00.000Z" });
    const incoming = makeMessage({ id: "1", content: "new", sendTime: "2024-01-01T00:00:00.000Z" });
    const result = applyMessageToMessageList([existing], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("new");
  });

  it("merges pending with server echo", () => {
    const pending = makeMessage({
      id: "local_abc",
      clientMessageId: "cm1",
      content: "pending",
      sendTime: "2024-01-01T00:00:00.000Z",
    });
    const server = makeMessage({
      id: "server_123",
      clientMessageId: "cm1",
      content: "server",
      sendTime: "2024-01-01T00:00:00.000Z",
    });
    const result = applyMessageToMessageList([pending], server);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server_123");
    expect(result[0].content).toBe("server");
  });

  it("sorts messages by sendTime ascending", () => {
    const later = makeMessage({ id: "2", sendTime: "2024-01-02T00:00:00.000Z" });
    const earlier = makeMessage({ id: "1", sendTime: "2024-01-01T00:00:00.000Z" });
    const result = applyMessageToMessageList([later], earlier);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("does not mutate input array", () => {
    const existing = [makeMessage({ id: "1" })];
    const originalLength = existing.length;
    const incoming = makeMessage({ id: "2" });
    applyMessageToMessageList(existing, incoming);
    expect(existing).toHaveLength(originalLength);
  });
});
