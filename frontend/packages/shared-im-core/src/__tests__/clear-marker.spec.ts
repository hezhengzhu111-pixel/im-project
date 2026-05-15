import { describe, it, expect } from "vitest";
import type { Message } from "@im/shared-types";
import {
  shouldHideClearedMessage,
  createClearMarkerFromMessages,
  type ConversationClearMarker,
} from "../clear-marker.js";

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "100",
  senderId: "1",
  isGroupChat: false,
  messageType: "TEXT",
  content: "",
  sendTime: "2026-01-01T00:00:00.000Z",
  status: "SENT",
  ...overrides,
});

describe("shouldHideClearedMessage", () => {
  it("returns false when marker is undefined", () => {
    const message = makeMessage();
    expect(shouldHideClearedMessage(message, undefined)).toBe(false);
  });

  it("hides message when server id <= marker lastServerMessageId", () => {
    const marker: ConversationClearMarker = {
      clearedAtMs: 0,
      lastServerMessageId: "200",
    };
    const message = makeMessage({ id: "100" });
    expect(shouldHideClearedMessage(message, marker)).toBe(true);
  });

  it("hides message when server id equals marker lastServerMessageId", () => {
    const marker: ConversationClearMarker = {
      clearedAtMs: 0,
      lastServerMessageId: "200",
    };
    const message = makeMessage({ id: "200" });
    expect(shouldHideClearedMessage(message, marker)).toBe(true);
  });

  it("does not hide message when server id > marker lastServerMessageId", () => {
    const marker: ConversationClearMarker = {
      clearedAtMs: 0,
      lastServerMessageId: "200",
    };
    const message = makeMessage({ id: "300" });
    expect(shouldHideClearedMessage(message, marker)).toBe(false);
  });

  it("falls back to time comparison when id cannot be parsed", () => {
    const marker: ConversationClearMarker = {
      clearedAtMs: new Date("2026-01-02T00:00:00.000Z").getTime(),
    };
    const message = makeMessage({
      id: "local_abc",
      sendTime: "2026-01-01T00:00:00.000Z",
    });
    expect(shouldHideClearedMessage(message, marker)).toBe(true);
  });

  it("does not hide when sendTime > clearedAtMs (time fallback)", () => {
    const marker: ConversationClearMarker = {
      clearedAtMs: new Date("2026-01-01T00:00:00.000Z").getTime(),
    };
    const message = makeMessage({
      id: "local_abc",
      sendTime: "2026-01-02T00:00:00.000Z",
    });
    expect(shouldHideClearedMessage(message, marker)).toBe(false);
  });

  it("does not hide when both id and time are unparseable", () => {
    const marker: ConversationClearMarker = {
      clearedAtMs: 1000,
    };
    const message = makeMessage({
      id: "local_abc",
      sendTime: "invalid-date",
    });
    expect(shouldHideClearedMessage(message, marker)).toBe(false);
  });

  it("prefers server id over time when marker has lastServerMessageId", () => {
    const marker: ConversationClearMarker = {
      clearedAtMs: new Date("2026-12-31T00:00:00.000Z").getTime(),
      lastServerMessageId: "200",
    };
    const message = makeMessage({
      id: "100",
      sendTime: "2026-12-31T00:00:00.000Z",
    });
    expect(shouldHideClearedMessage(message, marker)).toBe(true);
  });
});

describe("createClearMarkerFromMessages", () => {
  it("takes the max server id from messages", () => {
    const messages = [
      makeMessage({ id: "100" }),
      makeMessage({ id: "300" }),
      makeMessage({ id: "200" }),
    ];
    const marker = createClearMarkerFromMessages(messages);
    expect(marker.lastServerMessageId).toBe("300");
  });

  it("takes the max sendTime from messages", () => {
    const messages = [
      makeMessage({ sendTime: "2026-01-01T00:00:00.000Z" }),
      makeMessage({ sendTime: "2026-03-01T00:00:00.000Z" }),
      makeMessage({ sendTime: "2026-02-01T00:00:00.000Z" }),
    ];
    const marker = createClearMarkerFromMessages(messages);
    expect(marker.clearedAtMs).toBe(new Date("2026-03-01T00:00:00.000Z").getTime());
  });

  it("ignores local_ ids when computing max server id", () => {
    const messages = [
      makeMessage({ id: "local_abc" }),
      makeMessage({ id: "200" }),
    ];
    const marker = createClearMarkerFromMessages(messages);
    expect(marker.lastServerMessageId).toBe("200");
  });

  it("uses nowMs when no valid sendTime exists", () => {
    const messages = [makeMessage({ sendTime: "invalid-date" })];
    const marker = createClearMarkerFromMessages(messages, 999999);
    expect(marker.clearedAtMs).toBe(999999);
  });

  it("returns 0 for clearedAtMs when no messages and no nowMs", () => {
    const marker = createClearMarkerFromMessages([]);
    expect(marker.clearedAtMs).toBe(0);
    expect(marker.lastServerMessageId).toBeUndefined();
  });

  it("does not mutate input array or messages", () => {
    const msg1 = makeMessage({ id: "100", sendTime: "2026-01-01T00:00:00.000Z" });
    const msg2 = makeMessage({ id: "200", sendTime: "2026-02-01T00:00:00.000Z" });
    const messages = [msg1, msg2];
    const snapshot = messages.map((m) => ({ ...m }));

    createClearMarkerFromMessages(messages);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(msg1);
    expect(messages[1]).toBe(msg2);
    expect(messages[0]).toEqual(snapshot[0]);
    expect(messages[1]).toEqual(snapshot[1]);
  });
});
