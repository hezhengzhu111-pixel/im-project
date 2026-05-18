import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ref } from "vue";
import { ref } from "vue";
import type { Message, MessageSearchResult } from "@im/shared-types";

const makeMsg = (
  id: string,
  content: string,
  sendTime?: string
): Message =>
  ({
    id,
    content,
    sendTime: sendTime || "2026-05-18T10:00:00.000Z",
    messageType: "TEXT",
    status: "SENT",
  }) as Message;

interface MessageSearchContext {
  messages: Ref<Map<string, Message[]>>;
  searchResults: Ref<MessageSearchResult[]>;
}

const createMockContext = (
  overrides?: Partial<MessageSearchContext>
): MessageSearchContext => ({
  messages: ref(new Map<string, Message[]>()),
  searchResults: ref<MessageSearchResult[]>([]),
  ...overrides,
});

describe("createMessageSearchModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchMessages", () => {
    it("finds messages containing the keyword", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [
        makeMsg("1", "Hello world"),
        makeMsg("2", "Goodbye world"),
        makeMsg("3", "No match here"),
      ]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("world");

      expect(ctx.searchResults.value).toHaveLength(2);
      expect(ctx.searchResults.value[0].message.id).toBe("1");
      expect(ctx.searchResults.value[1].message.id).toBe("2");
    });

    it("performs case-insensitive search", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [
        makeMsg("1", "Hello World"),
        makeMsg("2", "hello world"),
      ]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("hello");

      expect(ctx.searchResults.value).toHaveLength(2);
    });

    it("returns empty results for empty keyword", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [makeMsg("1", "Hello world")]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("");

      expect(ctx.searchResults.value).toHaveLength(0);
    });

    it("returns empty results for whitespace-only keyword", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [makeMsg("1", "Hello world")]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("   ");

      expect(ctx.searchResults.value).toHaveLength(0);
    });

    it("searches in specific session when sessionId is provided", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [makeMsg("1", "Hello world")]);
      ctx.messages.value.set("1_3", [makeMsg("2", "Nothing")]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("world", "1_2");

      expect(ctx.searchResults.value).toHaveLength(1);
      expect(ctx.searchResults.value[0].message.id).toBe("1");
    });

    it("searches across all sessions when sessionId is not provided", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [makeMsg("1", "Hello")]);
      ctx.messages.value.set("1_3", [makeMsg("2", "Hello too")]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("Hello");

      expect(ctx.searchResults.value).toHaveLength(2);
    });

    it("includes context messages around each match", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [
        makeMsg("1", "First"),
        makeMsg("2", "target word here"),
        makeMsg("3", "Third"),
      ]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("target");

      expect(ctx.searchResults.value).toHaveLength(1);
      const result = ctx.searchResults.value[0];
      expect(result.highlight).toBe("target");
      expect(result.context).toHaveLength(3);
      expect(result.context[0].id).toBe("1");
      expect(result.context[1].id).toBe("2");
      expect(result.context[2].id).toBe("3");
    });

    it("handles context at boundaries (first message)", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [
        makeMsg("1", "keyword first"),
        makeMsg("2", "Other"),
      ]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("keyword");

      const result = ctx.searchResults.value[0];
      expect(result.context).toHaveLength(2);
      expect(result.context[0].id).toBe("1");
      expect(result.context[1].id).toBe("2");
    });

    it("handles context at boundaries (last message)", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [
        makeMsg("1", "First"),
        makeMsg("2", "keyword last"),
      ]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("keyword");

      const result = ctx.searchResults.value[0];
      expect(result.context).toHaveLength(2);
      expect(result.context[0].id).toBe("1");
      expect(result.context[1].id).toBe("2");
    });

    it("returns empty results when no messages in the session", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", []);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("hello", "1_2");

      expect(ctx.searchResults.value).toHaveLength(0);
    });

    it("returns empty results when keyword does not match any message", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [makeMsg("1", "Hello")]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("nonexistent");

      expect(ctx.searchResults.value).toHaveLength(0);
    });

    it("searches content field only", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      // Only content field is searchable, not id or senderId
      ctx.messages.value.set("1_2", [
        makeMsg("keyword-in-id-not-content", "hello"),
      ]);

      const mod = createMessageSearchModule(ctx);
      await mod.searchMessages("keyword-in-id-not-content");

      // The search looks at content only, so id matches should not be found
      expect(ctx.searchResults.value).toHaveLength(0);
    });

    it("caches search results using WeakMap (same list + keyword)", async () => {
      const { createMessageSearchModule } = await import(
        "@/stores/modules/message-search"
      );
      const ctx = createMockContext();
      ctx.messages.value.set("1_2", [
        makeMsg("1", "Hello world"),
        makeMsg("2", "Another world"),
      ]);

      const mod = createMessageSearchModule(ctx);

      // First search builds the index and result cache
      await mod.searchMessages("world");
      expect(ctx.searchResults.value).toHaveLength(2);

      // Add a new matching message to the SAME list array
      const msgs = ctx.messages.value.get("1_2")!;
      msgs.push(makeMsg("3", "Yet another world"));

      // Second search for same keyword — if cached, still returns 2 (not 3)
      await mod.searchMessages("world");
      // WeakMap cache keyed by same array object + same keyword → cached results
      expect(ctx.searchResults.value).toHaveLength(2);
    });
  });
});
