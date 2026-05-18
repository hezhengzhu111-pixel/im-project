import { describe, expect, it } from "vitest";
import type { Message } from "@im/shared-types";

// Mock the shared-im-core module — the message-helpers re-exports from it
// We use the actual implementations since they are pure functions
// The tests here verify the API surface and core behaviors

type MessageIdentity = Pick<Message, "id" | "messageId" | "clientMessageId">;
type MessageWithTime = Pick<Message, "id" | "sendTime" | "status">;

describe("message-helpers (re-exports from @im/shared-im-core)", () => {
  it("MESSAGE_WINDOW_SIZE is exported as 50", async () => {
    const { MESSAGE_WINDOW_SIZE } = await import(
      "@/stores/modules/message-helpers"
    );
    expect(MESSAGE_WINDOW_SIZE).toBe(50);
  });

  describe("messageIdentityValues", () => {
    it("returns array of non-empty identity fields", async () => {
      const { messageIdentityValues } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = {
        id: "123",
        messageId: "mid-456",
        clientMessageId: "cid-789",
      } as Message;

      const ids = messageIdentityValues(msg);
      expect(ids).toContain("123");
      expect(ids).toContain("mid-456");
      expect(ids).toContain("cid-789");
    });

    it("filters out empty/null/undefined values", async () => {
      const { messageIdentityValues } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = { id: "123", messageId: "", clientMessageId: undefined } as Message;

      const ids = messageIdentityValues(msg);
      expect(ids).toEqual(["123"]);
    });
  });

  describe("hasSameMessageIdentity", () => {
    it("returns true when messages share an identity value", async () => {
      const { hasSameMessageIdentity } = await import(
        "@/stores/modules/message-helpers"
      );
      const a = { id: "1", messageId: "mid-1" } as Message;
      const b = { id: "2", messageId: "mid-1" } as Message;

      expect(hasSameMessageIdentity(a, b)).toBe(true);
    });

    it("returns false when messages have no shared identity", async () => {
      const { hasSameMessageIdentity } = await import(
        "@/stores/modules/message-helpers"
      );
      const a = { id: "1", messageId: "mid-1" } as Message;
      const b = { id: "2", messageId: "mid-2" } as Message;

      expect(hasSameMessageIdentity(a, b)).toBe(false);
    });
  });

  describe("messageTimeValue", () => {
    it("extracts numeric timestamp from sendTime", async () => {
      const { messageTimeValue } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = {
        sendTime: "2026-05-18T10:00:00.000Z",
      } as Message;

      const value = messageTimeValue(msg);
      expect(value).toBe(new Date("2026-05-18T10:00:00.000Z").getTime());
    });

    it("returns 0 for invalid sendTime", async () => {
      const { messageTimeValue } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = { sendTime: "invalid" } as Message;

      expect(messageTimeValue(msg)).toBe(0);
    });

    it("returns 0 for missing sendTime", async () => {
      const { messageTimeValue } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = {} as Message;

      expect(messageTimeValue(msg)).toBe(0);
    });
  });

  describe("sortMessagesAscending", () => {
    const makeMsg = (
      id: string,
      sendTime: string,
      opts?: Partial<Message>
    ): Message =>
      ({ id, sendTime, messageType: "TEXT", ...opts }) as Message;

    it("sorts messages by time ascending", async () => {
      const { sortMessagesAscending } = await import(
        "@/stores/modules/message-helpers"
      );
      const earlier = makeMsg("1", "2026-05-18T10:00:00.000Z");
      const later = makeMsg("2", "2026-05-18T10:00:01.000Z");

      expect(sortMessagesAscending(earlier, later)).toBeLessThan(0);
      expect(sortMessagesAscending(later, earlier)).toBeGreaterThan(0);
    });

    it("uses localeCompare on id when times are equal", async () => {
      const { sortMessagesAscending } = await import(
        "@/stores/modules/message-helpers"
      );
      const a = makeMsg("a", "2026-05-18T10:00:00.000Z");
      const b = makeMsg("b", "2026-05-18T10:00:00.000Z");

      expect(sortMessagesAscending(a, b)).toBeLessThan(0);
      expect(sortMessagesAscending(b, a)).toBeGreaterThan(0);
    });

    it("returns 0 for identical messages", async () => {
      const { sortMessagesAscending } = await import(
        "@/stores/modules/message-helpers"
      );
      const a = makeMsg("1", "2026-05-18T10:00:00.000Z");

      expect(sortMessagesAscending(a, a)).toBe(0);
    });
  });

  describe("mergeMessagesChronologically", () => {
    const makeMsg = (
      id: string,
      sendTime: string,
      opts?: Partial<Message>
    ): Message =>
      ({ id, sendTime, messageType: "TEXT", ...opts }) as Message;

    it("merges two lists chronologically without duplicates", async () => {
      const { mergeMessagesChronologically } = await import(
        "@/stores/modules/message-helpers"
      );
      const list1 = [makeMsg("1", "2026-05-18T10:00:00.000Z")];
      const list2 = [
        makeMsg("2", "2026-05-18T10:00:01.000Z"),
        makeMsg("3", "2026-05-18T10:00:02.000Z"),
      ];

      const merged = mergeMessagesChronologically(list1, list2);
      expect(merged).toHaveLength(3);
      expect(merged[0].id).toBe("1");
      expect(merged[1].id).toBe("2");
      expect(merged[2].id).toBe("3");
    });

    it("deduplicates messages with same identity", async () => {
      const { mergeMessagesChronologically } = await import(
        "@/stores/modules/message-helpers"
      );
      const pending = makeMsg("local_1", "2026-05-18T10:00:00.000Z", {
        clientMessageId: "cid-1",
        content: "pending",
        status: "SENDING",
      });
      const server = makeMsg("1", "2026-05-18T10:00:00.000Z", {
        clientMessageId: "cid-1",
        content: "confirmed",
        status: "SENT",
      });

      const merged = mergeMessagesChronologically([pending], [server]);
      expect(merged).toHaveLength(1);
      // Server message should override pending (merged result uses both)
      // The merge keeps both properties: pending.id should be kept as "1"
      // and content/sendTime should come from server
    });

    it("merges three lists", async () => {
      const { mergeMessagesChronologically } = await import(
        "@/stores/modules/message-helpers"
      );
      const a = [makeMsg("1", "2026-05-18T10:00:00.000Z")];
      const b = [makeMsg("2", "2026-05-18T10:00:01.000Z")];
      const c = [makeMsg("3", "2026-05-18T10:00:02.000Z")];

      const merged = mergeMessagesChronologically(a, b, c);
      expect(merged).toHaveLength(3);
    });
  });

  describe("limitMessageWindow", () => {
    const makeMsg = (id: string, sendTime: string): Message =>
      ({ id, sendTime, messageType: "TEXT" }) as Message;

    it("keeps latest N messages when keep is 'latest'", async () => {
      const { limitMessageWindow } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [
        makeMsg("1", "2026-05-18T10:00:00.000Z"),
        makeMsg("2", "2026-05-18T10:00:01.000Z"),
        makeMsg("3", "2026-05-18T10:00:02.000Z"),
      ];

      const limited = limitMessageWindow(messages, "latest", 2);
      expect(limited).toHaveLength(2);
      expect(limited[0].id).toBe("2");
      expect(limited[1].id).toBe("3");
    });

    it("keeps oldest N messages when keep is 'oldest'", async () => {
      const { limitMessageWindow } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [
        makeMsg("1", "2026-05-18T10:00:00.000Z"),
        makeMsg("2", "2026-05-18T10:00:01.000Z"),
        makeMsg("3", "2026-05-18T10:00:02.000Z"),
      ];

      const limited = limitMessageWindow(messages, "oldest", 2);
      expect(limited).toHaveLength(2);
      expect(limited[0].id).toBe("1");
      expect(limited[1].id).toBe("2");
    });

    it("returns full list when within window size", async () => {
      const { limitMessageWindow } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [
        makeMsg("1", "2026-05-18T10:00:00.000Z"),
      ];

      const limited = limitMessageWindow(messages, "latest", 50);
      expect(limited).toHaveLength(1);
    });

    it("sorts messages before windowing", async () => {
      const { limitMessageWindow } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [
        makeMsg("3", "2026-05-18T10:00:02.000Z"),
        makeMsg("1", "2026-05-18T10:00:00.000Z"),
        makeMsg("2", "2026-05-18T10:00:01.000Z"),
      ];

      const limited = limitMessageWindow(messages, "latest", 50);
      expect(limited[0].id).toBe("1");
      expect(limited[1].id).toBe("2");
      expect(limited[2].id).toBe("3");
    });

    it("uses default MESSAGE_WINDOW_SIZE (50) when not specified", async () => {
      const { limitMessageWindow, MESSAGE_WINDOW_SIZE } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = Array.from({ length: 60 }, (_, i) =>
        makeMsg(
          String(i),
          `2026-05-18T10:00:${String(i).padStart(2, "0")}.000Z`
        )
      );

      const limited = limitMessageWindow(messages, "latest");
      expect(limited).toHaveLength(MESSAGE_WINDOW_SIZE);
    });
  });

  describe("getServerMessages", () => {
    const makeMsg = (id: string): Message =>
      ({ id, sendTime: "2026-05-18T10:00:00.000Z", messageType: "TEXT" }) as Message;

    it("filters out local_ messages", async () => {
      const { getServerMessages } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [
        makeMsg("local_1"),
        makeMsg("1"),
        makeMsg("local_2"),
        makeMsg("2"),
      ];

      const server = getServerMessages(messages);
      expect(server).toHaveLength(2);
      expect(server.map((m) => m.id)).toEqual(["1", "2"]);
    });

    it("returns empty array when no server messages", async () => {
      const { getServerMessages } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [makeMsg("local_1"), makeMsg("local_2")];

      const server = getServerMessages(messages);
      expect(server).toHaveLength(0);
    });
  });

  describe("findOldestLoadedServerMessageId", () => {
    const makeMsg = (id: string, sendTime?: string): Message =>
      ({
        id,
        sendTime: sendTime || "2026-05-18T10:00:00.000Z",
        messageType: "TEXT",
      }) as Message;

    it("finds the smallest server message id", async () => {
      const { findOldestLoadedServerMessageId } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [
        makeMsg("100"),
        makeMsg("50"),
        makeMsg("200"),
      ];

      const oldest = findOldestLoadedServerMessageId(messages);
      expect(oldest).toBe("50");
    });

    it("ignores local_ prefixed ids", async () => {
      const { findOldestLoadedServerMessageId } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [
        makeMsg("local_1"),
        makeMsg("100"),
      ];

      const oldest = findOldestLoadedServerMessageId(messages);
      expect(oldest).toBe("100");
    });

    it("returns undefined when no server messages", async () => {
      const { findOldestLoadedServerMessageId } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [makeMsg("local_1")];

      const oldest = findOldestLoadedServerMessageId(messages);
      expect(oldest).toBeUndefined();
    });
  });

  describe("applyIncomingMessageToList", () => {
    const makeMsg = (id: string, sendTime: string): Message =>
      ({ id, sendTime, messageType: "TEXT" }) as Message;

    it("adds message to list and sorts chronologically", async () => {
      const { applyIncomingMessageToList } = await import(
        "@/stores/modules/message-helpers"
      );
      const existing = [
        makeMsg("1", "2026-05-18T10:00:00.000Z"),
        makeMsg("2", "2026-05-18T10:00:01.000Z"),
      ];
      const incoming = makeMsg("3", "2026-05-18T10:00:02.000Z");

      const result = applyIncomingMessageToList(existing, incoming);
      expect(result).toHaveLength(3);
      expect(result[2].id).toBe("3");
    });

    it("deduplicates message with same identity", async () => {
      const { applyIncomingMessageToList } = await import(
        "@/stores/modules/message-helpers"
      );
      const existing = [makeMsg("1", "2026-05-18T10:00:00.000Z")];
      const incoming = makeMsg("1", "2026-05-18T10:00:00.000Z");

      const result = applyIncomingMessageToList(existing, incoming);
      expect(result).toHaveLength(1);
    });

    it("applies window limit by default", async () => {
      const { applyIncomingMessageToList } = await import(
        "@/stores/modules/message-helpers"
      );
      const existing = Array.from({ length: 50 }, (_, i) =>
        makeMsg(
          String(i),
          `2026-05-18T10:00:${String(i).padStart(2, "0")}.000Z`
        )
      );
      const incoming = makeMsg(
        "50",
        "2026-05-18T10:00:50.000Z"
      );

      const result = applyIncomingMessageToList(existing, incoming);
      // Should be windowed to 50 messages
      expect(result).toHaveLength(50);
    });

    it("keeps all when options.keep is 'all'", async () => {
      const { applyIncomingMessageToList } = await import(
        "@/stores/modules/message-helpers"
      );
      const existing = Array.from({ length: 55 }, (_, i) =>
        makeMsg(
          String(i),
          `2026-05-18T10:00:${String(i).padStart(2, "0")}.000Z`
        )
      );
      const incoming = makeMsg(
        "55",
        "2026-05-18T10:00:55.000Z"
      );

      const result = applyIncomingMessageToList(existing, incoming, {
        keep: "all",
      });
      expect(result).toHaveLength(56);
    });
  });

  describe("shouldHideClearedMessage", () => {
    const makeMsg = (id: string, sendTime?: string): Message =>
      ({
        id,
        sendTime: sendTime || "2026-05-18T10:00:00.000Z",
        messageType: "TEXT",
      }) as Message;

    it("returns true for messages before the clear marker", async () => {
      const { shouldHideClearedMessage } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = makeMsg("50", "2026-05-18T09:00:00.000Z");

      const hide = shouldHideClearedMessage(msg, {
        clearedAtMs: new Date("2026-05-18T10:00:00.000Z").getTime(),
        lastServerMessageId: "100",
      });
      expect(hide).toBe(true);
    });

    it("returns false for messages after the clear marker", async () => {
      const { shouldHideClearedMessage } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = makeMsg("150", "2026-05-18T11:00:00.000Z");

      const hide = shouldHideClearedMessage(msg, {
        clearedAtMs: new Date("2026-05-18T10:00:00.000Z").getTime(),
        lastServerMessageId: "100",
      });
      expect(hide).toBe(false);
    });

    it("returns false when no marker", async () => {
      const { shouldHideClearedMessage } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = makeMsg("1");

      const hide = shouldHideClearedMessage(msg, undefined);
      expect(hide).toBe(false);
    });

    it("falls back to time comparison when marker has no server id", async () => {
      const { shouldHideClearedMessage } = await import(
        "@/stores/modules/message-helpers"
      );
      const msg = makeMsg("1", "2026-05-18T09:00:00.000Z");

      const hide = shouldHideClearedMessage(msg, {
        clearedAtMs: new Date("2026-05-18T10:00:00.000Z").getTime(),
      });
      expect(hide).toBe(true);
    });
  });

  describe("createClearMarkerFromMessages", () => {
    const makeMsg = (id: string, sendTime: string): Message =>
      ({ id, sendTime, messageType: "TEXT" }) as Message;

    it("creates marker with lastServerMessageId from max id", async () => {
      const { createClearMarkerFromMessages } = await import(
        "@/stores/modules/message-helpers"
      );
      const messages = [
        makeMsg("100", "2026-05-18T10:00:00.000Z"),
        makeMsg("200", "2026-05-18T10:00:01.000Z"),
      ];

      const marker = createClearMarkerFromMessages(messages);
      expect(marker.lastServerMessageId).toBe("200");
      expect(marker.clearedAtMs).toBe(
        new Date("2026-05-18T10:00:01.000Z").getTime()
      );
    });

    it("uses nowMs when no messages have valid times", async () => {
      const { createClearMarkerFromMessages } = await import(
        "@/stores/modules/message-helpers"
      );
      const marker = createClearMarkerFromMessages([], 1234567890000);
      expect(marker.clearedAtMs).toBe(1234567890000);
      expect(marker.lastServerMessageId).toBeUndefined();
    });
  });
});
