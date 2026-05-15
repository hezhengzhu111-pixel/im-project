import { describe, expect, it } from "vitest";
import { applyReadReceiptToMessages } from "../read-receipt.js";
import type { Message, ReadReceipt } from "@im/shared-types";

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "1",
  senderId: "u1",
  isGroupChat: false,
  messageType: "TEXT",
  content: "",
  sendTime: "2026-05-15T10:00:00.000Z",
  status: "SENT",
  ...overrides,
});

const makeReceipt = (
  overrides: Partial<ReadReceipt> = {},
): Pick<ReadReceipt, "readerId" | "lastReadMessageId" | "readAt"> => ({
  readerId: "u2",
  lastReadMessageId: "100",
  readAt: "2026-05-15T12:00:00.000Z",
  ...overrides,
});

describe("applyReadReceiptToMessages - private received mode", () => {
  it("marks messages sent by targetUserId as READ", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "u2", status: "SENT" }),
      makeMessage({ id: "2", senderId: "u2", status: "DELIVERED" }),
    ];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("READ");
    expect(result.updated[1].status).toBe("READ");
    expect(result.changed).toHaveLength(2);
  });

  it("does not mark messages NOT sent by targetUserId", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "u1", status: "SENT" }),
      makeMessage({ id: "2", senderId: "u2", status: "SENT" }),
    ];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("SENT");
    expect(result.updated[1].status).toBe("READ");
    expect(result.changed).toHaveLength(1);
  });

  it("skips messages newer than lastReadMessageId", () => {
    const messages = [
      makeMessage({ id: "50", senderId: "u2", status: "SENT" }),
      makeMessage({ id: "150", senderId: "u2", status: "SENT" }),
    ];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("READ");
    expect(result.updated[1].status).toBe("SENT");
    expect(result.changed).toHaveLength(1);
  });

  it("skips messages sent after readAt timestamp", () => {
    const messages = [
      makeMessage({
        id: "1",
        senderId: "u2",
        sendTime: "2026-05-15T11:00:00.000Z",
        status: "SENT",
      }),
      makeMessage({
        id: "2",
        senderId: "u2",
        sendTime: "2026-05-15T13:00:00.000Z",
        status: "SENT",
      }),
    ];
    const receipt = makeReceipt({
      readerId: "u1",
      lastReadMessageId: "100",
      readAt: "2026-05-15T12:00:00.000Z",
    });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("READ");
    expect(result.updated[1].status).toBe("SENT");
    expect(result.changed).toHaveLength(1);
  });

  it("sets readAt on updated messages", () => {
    const messages = [makeMessage({ id: "1", senderId: "u2", status: "SENT" })];
    const receipt = makeReceipt({
      readerId: "u1",
      lastReadMessageId: "100",
      readAt: "2026-05-15T12:00:00.000Z",
    });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.updated[0].readAt).toBe("2026-05-15T12:00:00.000Z");
    expect(result.updated[0].readStatus).toBe(1);
  });

  it("returns empty changed when no messages need update", () => {
    const messages = [makeMessage({ id: "1", senderId: "u1", status: "SENT" })];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.changed).toHaveLength(0);
  });
});

describe("applyReadReceiptToMessages - private sync mode", () => {
  it("marks messages NOT sent by targetUserId as READ", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "u1", status: "SENT" }),
      makeMessage({ id: "2", senderId: "u2", status: "SENT" }),
    ];
    const receipt = makeReceipt({ readerId: "u2", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "sync",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("READ");
    expect(result.updated[1].status).toBe("SENT");
    expect(result.changed).toHaveLength(1);
  });

  it("does not mark messages sent by targetUserId", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "u2", status: "SENT" }),
      makeMessage({ id: "2", senderId: "u1", status: "SENT" }),
    ];
    const receipt = makeReceipt({ readerId: "u2", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "sync",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("SENT");
    expect(result.updated[1].status).toBe("READ");
    expect(result.changed).toHaveLength(1);
  });

  it("skips messages newer than lastReadMessageId", () => {
    const messages = [
      makeMessage({ id: "50", senderId: "u1", status: "SENT" }),
      makeMessage({ id: "150", senderId: "u1", status: "SENT" }),
    ];
    const receipt = makeReceipt({ readerId: "u2", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "sync",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("READ");
    expect(result.updated[1].status).toBe("SENT");
    expect(result.changed).toHaveLength(1);
  });
});

describe("applyReadReceiptToMessages - group mode", () => {
  it("adds reader to readBy array for target messages", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "u2", isGroupChat: true, readBy: [] }),
      makeMessage({ id: "2", senderId: "u2", isGroupChat: true }),
    ];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: true,
    });

    expect(result.updated[0].readBy).toContain("u1");
    expect(result.updated[0].readByCount).toBe(1);
    expect(result.updated[0].readStatus).toBe(1);
    expect(result.updated[1].readBy).toContain("u1");
    expect(result.changed).toHaveLength(2);
  });

  it("does not duplicate reader in readBy array", () => {
    const messages = [
      makeMessage({
        id: "1",
        senderId: "u2",
        isGroupChat: true,
        readBy: ["u1"],
        readByCount: 1,
      }),
    ];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: true,
    });

    expect(result.updated[0].readBy).toEqual(["u1"]);
    expect(result.updated[0].readByCount).toBe(1);
    expect(result.changed).toHaveLength(0);
  });

  it("preserves existing readers when adding new one", () => {
    const messages = [
      makeMessage({
        id: "1",
        senderId: "u2",
        isGroupChat: true,
        readBy: ["u3"],
        readByCount: 1,
      }),
    ];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: true,
    });

    expect(result.updated[0].readBy).toContain("u3");
    expect(result.updated[0].readBy).toContain("u1");
    expect(result.updated[0].readByCount).toBe(2);
  });

  it("skips messages newer than lastReadMessageId in group", () => {
    const messages = [
      makeMessage({ id: "50", senderId: "u2", isGroupChat: true, readBy: [] }),
      makeMessage({ id: "150", senderId: "u2", isGroupChat: true, readBy: [] }),
    ];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: true,
    });

    expect(result.updated[0].readBy).toContain("u1");
    expect(result.updated[1].readBy).not.toContain("u1");
    expect(result.changed).toHaveLength(1);
  });

  it("skips messages sent after readAt timestamp in group", () => {
    const messages = [
      makeMessage({
        id: "1",
        senderId: "u2",
        isGroupChat: true,
        readBy: [],
        sendTime: "2026-05-15T11:00:00.000Z",
      }),
      makeMessage({
        id: "2",
        senderId: "u2",
        isGroupChat: true,
        readBy: [],
        sendTime: "2026-05-15T13:00:00.000Z",
      }),
    ];
    const receipt = makeReceipt({
      readerId: "u1",
      lastReadMessageId: "100",
      readAt: "2026-05-15T12:00:00.000Z",
    });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: true,
    });

    expect(result.updated[0].readBy).toContain("u1");
    expect(result.updated[1].readBy).not.toContain("u1");
    expect(result.changed).toHaveLength(1);
  });

  it("does not mutate input messages", () => {
    const msg = makeMessage({
      id: "1",
      senderId: "u2",
      isGroupChat: true,
      readBy: [],
    });
    const messages = [msg];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: true,
    });

    expect(msg.readBy).toEqual([]);
    expect(msg.readByCount).toBeUndefined();
  });

  it("does not mutate input array", () => {
    const msg = makeMessage({ id: "1", senderId: "u2", status: "SENT" });
    const messages = [msg];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(msg);
    expect(result.updated).not.toBe(messages);
  });
});

describe("applyReadReceiptToMessages - edge cases", () => {
  it("handles missing lastReadMessageId", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "u2", status: "SENT" }),
      makeMessage({ id: "2", senderId: "u2", status: "SENT" }),
    ];
    const receipt = makeReceipt({
      readerId: "u1",
      lastReadMessageId: undefined,
      readAt: "2026-05-15T12:00:00.000Z",
    });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("READ");
    expect(result.updated[1].status).toBe("READ");
    expect(result.changed).toHaveLength(2);
  });

  it("handles missing readAt", () => {
    const messages = [
      makeMessage({ id: "50", senderId: "u2", status: "SENT" }),
      makeMessage({ id: "150", senderId: "u2", status: "SENT" }),
    ];
    const receipt = makeReceipt({
      readerId: "u1",
      lastReadMessageId: "100",
      readAt: undefined,
    });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.updated[0].status).toBe("READ");
    expect(result.updated[1].status).toBe("SENT");
    expect(result.changed).toHaveLength(1);
  });

  it("handles empty message list", () => {
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages([], receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    expect(result.updated).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("skips messages with non-numeric IDs when lastReadMessageId is present", () => {
    const messages = [
      makeMessage({ id: "local_abc", senderId: "u2", status: "SENT" }),
    ];
    const receipt = makeReceipt({ readerId: "u1", lastReadMessageId: "100" });

    const result = applyReadReceiptToMessages(messages, receipt, {
      targetUserId: "u2",
      mode: "received",
      isGroupSession: false,
    });

    // non-numeric ID cannot be compared, so message is skipped
    expect(result.updated[0].status).toBe("SENT");
    expect(result.changed).toHaveLength(0);
  });
});
