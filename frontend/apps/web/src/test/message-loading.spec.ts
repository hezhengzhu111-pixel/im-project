import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ref } from "vue";
import { ref } from "vue";
import type { ChatSession, Message } from "@im/shared-types";

const makeSession = (
  id: string,
  type: "private" | "group" = "private",
  targetId?: string,
  targetName?: string
): ChatSession =>
  ({
    id,
    type,
    targetId: targetId || id.split("_").pop() || id,
    targetName: targetName || `User ${targetId}`,
    lastActiveTime: "2026-05-18T10:00:00.000Z",
    unreadCount: 0,
  }) as ChatSession;

const makeMsg = (
  id: string,
  sendTime?: string,
  opts?: Partial<Message>
): Message =>
  ({
    id,
    sendTime: sendTime || "2026-05-18T10:00:00.000Z",
    messageType: "TEXT",
    status: "SENT",
    ...opts,
  }) as Message;

// Create the mock context types
interface MessageLoadingContext {
  messages: Ref<Map<string, Message[]>>;
  loading: Ref<boolean>;
  loadingHistoryBySession: Ref<Map<string, boolean>>;
  hasMoreHistoryBySession: Ref<Map<string, boolean>>;
  oldestLoadedServerMessageIdBySession: Ref<Map<string, string>>;
  fallbackHistoryPageBySession: Ref<Map<string, number>>;
  messageService: {
    getPrivateHistoryCursor: ReturnType<typeof vi.fn>;
    getGroupHistoryCursor: ReturnType<typeof vi.fn>;
    getPrivateHistory: ReturnType<typeof vi.fn>;
    getGroupHistory: ReturnType<typeof vi.fn>;
  };
  messageRepo: {
    listConversation: ReturnType<typeof vi.fn>;
    upsertServerMessages: ReturnType<typeof vi.fn>;
  };
  sessionStore: {
    sessions: ChatSession[];
  };
  filterClearedMessages: (sessionId: string, list: Message[]) => Message[];
  scheduleServerMessagePersist: ReturnType<typeof vi.fn>;
  notifyWarning: ReturnType<typeof vi.fn>;
  getCurrentUser?: () => { id: string } | null;
}

const createMockContext = (
  overrides?: Partial<MessageLoadingContext>
): MessageLoadingContext => ({
  messages: ref(new Map<string, Message[]>()),
  loading: ref(false),
  loadingHistoryBySession: ref(new Map<string, boolean>()),
  hasMoreHistoryBySession: ref(new Map<string, boolean>()),
  oldestLoadedServerMessageIdBySession: ref(new Map<string, string>()),
  fallbackHistoryPageBySession: ref(new Map<string, number>()),
  messageService: {
    getPrivateHistoryCursor: vi
      .fn()
      .mockResolvedValue({ code: 200, data: [] }),
    getGroupHistoryCursor: vi
      .fn()
      .mockResolvedValue({ code: 200, data: [] }),
    getPrivateHistory: vi.fn().mockResolvedValue({ code: 200, data: [] }),
    getGroupHistory: vi.fn().mockResolvedValue({ code: 200, data: [] }),
  },
  messageRepo: {
    listConversation: vi.fn().mockResolvedValue([]),
    upsertServerMessages: vi.fn().mockResolvedValue(undefined),
  },
  sessionStore: {
    sessions: [],
  },
  filterClearedMessages: vi.fn((_sessionId, list) => list),
  scheduleServerMessagePersist: vi.fn().mockResolvedValue(undefined),
  notifyWarning: vi.fn(),
  getCurrentUser: () => ({ id: "1" }),
  ...overrides,
});

describe("createMessageLoadingModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveSession", () => {
    it("finds a session by id in the session store", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const ctx = createMockContext({
        sessionStore: {
          sessions: [
            makeSession("1_2", "private", "2", "u2"),
            makeSession("group_9", "group", "9", "项目群"),
          ],
        },
      });

      const mod = createMessageLoadingModule(ctx);
      const session = mod.resolveSession("1_2");

      expect(session).toBeDefined();
      expect(session!.targetId).toBe("2");
    });

    it("returns undefined for unknown session id", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const ctx = createMockContext();

      const mod = createMessageLoadingModule(ctx);
      const session = mod.resolveSession("unknown");

      expect(session).toBeUndefined();
    });
  });

  describe("syncHistoryState", () => {
    it("sets oldestLoadedServerMessageId from list", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const ctx = createMockContext();
      const mod = createMessageLoadingModule(ctx);

      const list = [
        makeMsg("100", "2026-05-18T10:00:00.000Z"),
        makeMsg("50", "2026-05-18T09:00:00.000Z"),
      ];

      mod.syncHistoryState("session-1", list);

      expect(
        ctx.oldestLoadedServerMessageIdBySession.value.get("session-1")
      ).toBe("50");
      expect(ctx.hasMoreHistoryBySession.value.get("session-1")).toBe(true);
    });

    it("deletes oldest id when no server messages", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const ctx = createMockContext();
      ctx.oldestLoadedServerMessageIdBySession.value.set("session-1", "50");

      const mod = createMessageLoadingModule(ctx);
      mod.syncHistoryState("session-1", []);

      expect(
        ctx.oldestLoadedServerMessageIdBySession.value.has("session-1")
      ).toBe(false);
    });

    it("uses provided hasMoreHistory option", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const ctx = createMockContext();
      const mod = createMessageLoadingModule(ctx);

      mod.syncHistoryState("session-1", [], { hasMoreHistory: false });

      expect(ctx.hasMoreHistoryBySession.value.get("session-1")).toBe(false);
    });

    it("preserves existing hasMore when preserveHasMore is set", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const ctx = createMockContext();
      ctx.hasMoreHistoryBySession.value.set("session-1", true);

      const mod = createMessageLoadingModule(ctx);
      mod.syncHistoryState("session-1", [], { preserveHasMore: true });

      // Should NOT overwrite since preserveHasMore is true
      expect(ctx.hasMoreHistoryBySession.value.get("session-1")).toBe(true);
    });
  });

  describe("resetHistoryState", () => {
    it("clears all history state for a session", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const ctx = createMockContext();
      ctx.loadingHistoryBySession.value.set("session-1", true);
      ctx.hasMoreHistoryBySession.value.set("session-1", true);
      ctx.oldestLoadedServerMessageIdBySession.value.set("session-1", "50");
      ctx.fallbackHistoryPageBySession.value.set("session-1", 2);

      const mod = createMessageLoadingModule(ctx);
      mod.resetHistoryState("session-1");

      expect(ctx.loadingHistoryBySession.value.has("session-1")).toBe(false);
      expect(ctx.hasMoreHistoryBySession.value.has("session-1")).toBe(false);
      expect(
        ctx.oldestLoadedServerMessageIdBySession.value.has("session-1")
      ).toBe(false);
      expect(
        ctx.fallbackHistoryPageBySession.value.has("session-1")
      ).toBe(false);
    });
  });

  describe("loadMessages", () => {
    it("loads messages for a session and stores them", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messageService.getPrivateHistoryCursor.mockResolvedValue({
        code: 200,
        data: [
          makeMsg("100", "2026-05-18T10:00:00.000Z", { content: "hello" }),
        ],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      const messages = ctx.messages.value.get("1_2") || [];
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].content).toBe("hello");
      expect(ctx.loading.value).toBe(false);
    });

    it("revives cached messages from IndexedDB", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messageRepo.listConversation.mockResolvedValue([
        makeMsg("cached_1", "2026-05-18T09:00:00.000Z", {
          content: "cached",
        }),
      ]);
      ctx.messageService.getPrivateHistoryCursor.mockResolvedValue({
        code: 200,
        data: [],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      const messages = ctx.messages.value.get("1_2") || [];
      expect(messages.some((m) => m.content === "cached")).toBe(true);
      expect(ctx.messageRepo.listConversation).toHaveBeenCalledWith("1_2");
    });

    it("marks local_ SENDING messages as FAILED after revive", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messageRepo.listConversation.mockResolvedValue([
        makeMsg("local_1", "2026-05-18T09:00:00.000Z", {
          content: "failed-msg",
          status: "SENDING",
        }),
      ]);
      ctx.messageService.getPrivateHistoryCursor.mockResolvedValue({
        code: 200,
        data: [],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      const messages = ctx.messages.value.get("1_2") || [];
      const failedMsg = messages.find((m) => m.id === "local_1");
      expect(failedMsg).toBeDefined();
      expect(failedMsg!.status).toBe("FAILED");
      expect(ctx.notifyWarning).toHaveBeenCalled();
    });

    it("does NOT revive if messages already in store", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messages.value.set("1_2", [
        makeMsg("existing_1", "2026-05-18T09:00:00.000Z", {
          content: "already loaded",
        }),
      ]);

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      // Should not have revived from repo since messages already exist
      expect(ctx.messageRepo.listConversation).not.toHaveBeenCalled();
    });

    it("deduplicates local_ messages against server responses", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      // No cached messages, so it won't revive
      ctx.messages.value.set("1_2", [
        makeMsg("local_abc", "2026-05-18T10:00:00.000Z", {
          content: "pending",
          status: "SENDING",
          clientMessageId: "cid-123",
        }),
      ]);
      ctx.messageService.getPrivateHistoryCursor.mockResolvedValue({
        code: 200,
        data: [
          makeMsg("100", "2026-05-18T10:00:00.000Z", {
            content: "from-server",
            clientMessageId: "cid-123",
          }),
        ],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      const messages = ctx.messages.value.get("1_2") || [];
      // local_abc should be removed since cid-123 matched the server message
      expect(messages.find((m) => String(m.id).startsWith("local_"))).toBeUndefined();
    });

    it("falls back to page history when cursor history fails", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messageService.getPrivateHistoryCursor.mockRejectedValue(
        new Error("cursor fail")
      );
      ctx.messageService.getPrivateHistory.mockResolvedValue({
        code: 200,
        data: [
          makeMsg("100", "2026-05-18T10:00:00.000Z", {
            content: "page-result",
          }),
        ],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      const messages = ctx.messages.value.get("1_2") || [];
      expect(messages.some((m) => m.content === "page-result")).toBe(true);
    });

    it("applies filterClearedMessages callback", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
        filterClearedMessages: vi.fn((_id, list) =>
          list.filter((m) => m.id !== "99")
        ),
      });
      ctx.messageService.getPrivateHistoryCursor.mockResolvedValue({
        code: 200,
        data: [
          makeMsg("98", "2026-05-18T09:00:00.000Z", { content: "keep" }),
          makeMsg("99", "2026-05-18T09:00:01.000Z", { content: "remove" }),
          makeMsg("100", "2026-05-18T10:00:00.000Z", { content: "keep2" }),
        ],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      const messages = ctx.messages.value.get("1_2") || [];
      expect(messages.find((m) => m.id === "99")).toBeUndefined();
      expect(messages.find((m) => m.id === "98")).toBeDefined();
      expect(messages.find((m) => m.id === "100")).toBeDefined();
    });

    it("sets loading to true during operation and false after", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });

      const mod = createMessageLoadingModule(ctx);
      const loadPromise = mod.loadMessages("1_2", 20);

      expect(ctx.loading.value).toBe(true);
      await loadPromise;
      expect(ctx.loading.value).toBe(false);
    });

    it("handles private session", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messageService.getPrivateHistoryCursor.mockResolvedValue({
        code: 200,
        data: [makeMsg("1", "2026-05-18T10:00:00.000Z")],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      expect(ctx.messageService.getPrivateHistoryCursor).toHaveBeenCalledWith(
        "2",
        expect.objectContaining({ limit: 20 })
      );
    });

    it("handles group session", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("group_9", "group", "9", "项目群");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messageService.getGroupHistoryCursor.mockResolvedValue({
        code: 200,
        data: [makeMsg("1", "2026-05-18T10:00:00.000Z")],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("group_9", 20);

      expect(ctx.messageService.getGroupHistoryCursor).toHaveBeenCalledWith(
        "9",
        expect.objectContaining({ limit: 20 })
      );
    });
  });

  describe("loadMoreHistory", () => {
    it("fetches older messages using cursor", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messages.value.set("1_2", [
        makeMsg("100", "2026-05-18T10:00:00.000Z", { content: "latest" }),
      ]);
      ctx.oldestLoadedServerMessageIdBySession.value.set("1_2", "100");

      ctx.messageService.getPrivateHistoryCursor.mockResolvedValue({
        code: 200,
        data: [
          makeMsg("50", "2026-05-18T09:00:00.000Z", { content: "older" }),
          makeMsg("75", "2026-05-18T09:30:00.000Z", { content: "middle" }),
        ],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMoreHistory("1_2", 20);

      expect(ctx.messageService.getPrivateHistoryCursor).toHaveBeenCalledWith(
        "2",
        expect.objectContaining({ last_message_id: "100" })
      );
      const messages = ctx.messages.value.get("1_2") || [];
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe("older");
      expect(messages[2].content).toBe("latest");
    });

    it("does nothing when already loading history", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.loadingHistoryBySession.value.set("1_2", true);

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMoreHistory("1_2", 20);

      expect(ctx.messageService.getPrivateHistoryCursor).not.toHaveBeenCalled();
    });

    it("loads messages first if session has no messages yet", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messageService.getPrivateHistoryCursor.mockResolvedValue({
        code: 200,
        data: [
          makeMsg("100", "2026-05-18T10:00:00.000Z", { content: "initial" }),
        ],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMoreHistory("1_2", 50);

      // Should have called loadMessages first (which calls getPrivateHistoryCursor)
      // and then attempted loadMoreHistory
      expect(ctx.messageService.getPrivateHistoryCursor).toHaveBeenCalled();
      const messages = ctx.messages.value.get("1_2") || [];
      expect(messages.length).toBeGreaterThan(0);
    });

    it("sets hasMoreHistory to false when no oldest message id", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messages.value.set("1_2", [makeMsg("local_1", "2026-05-18T10:00:00.000Z")]);

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMoreHistory("1_2", 20);

      expect(ctx.hasMoreHistoryBySession.value.get("1_2")).toBe(false);
    });

    it("falls back to page history when cursor fails in loadMoreHistory", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messages.value.set("1_2", [
        makeMsg("100", "2026-05-18T10:00:00.000Z", { content: "latest" }),
      ]);
      ctx.oldestLoadedServerMessageIdBySession.value.set("1_2", "100");

      ctx.messageService.getPrivateHistoryCursor.mockRejectedValue(
        new Error("cursor unavailable")
      );
      ctx.messageService.getPrivateHistory.mockResolvedValue({
        code: 200,
        data: [
          makeMsg("50", "2026-05-18T09:00:00.000Z", { content: "page-fallback" }),
        ],
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMoreHistory("1_2", 20);

      expect(ctx.messageService.getPrivateHistory).toHaveBeenCalledWith(
        "2",
        expect.objectContaining({ page: 1, size: 20 })
      );
      const messages = ctx.messages.value.get("1_2") || [];
      expect(messages.some((m) => m.content === "page-fallback")).toBe(true);
    });

    it("increments fallback page counter on each fail", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });
      ctx.messages.value.set("1_2", [
        makeMsg("100", "2026-05-18T10:00:00.000Z", { content: "latest" }),
      ]);
      ctx.oldestLoadedServerMessageIdBySession.value.set("1_2", "100");

      ctx.messageService.getPrivateHistoryCursor.mockRejectedValue(
        new Error("cursor unavailable")
      );

      const mod = createMessageLoadingModule(ctx);

      // First fallback
      ctx.messageService.getPrivateHistory.mockResolvedValueOnce({
        code: 200,
        data: [makeMsg("50", "2026-05-18T09:00:00.000Z")],
      });
      await mod.loadMoreHistory("1_2", 20);
      expect(ctx.fallbackHistoryPageBySession.value.get("1_2")).toBe(2);

      // Second fallback
      ctx.messageService.getPrivateHistory.mockResolvedValueOnce({
        code: 200,
        data: [makeMsg("25", "2026-05-18T08:00:00.000Z")],
      });
      await mod.loadMoreHistory("1_2", 20);
      expect(ctx.fallbackHistoryPageBySession.value.get("1_2")).toBe(3);
    });

    it("removes loading flag in finally block", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMoreHistory("1_2", 20);

      expect(ctx.loadingHistoryBySession.value.has("1_2")).toBe(false);
    });

    it("persists server messages after successful load", async () => {
      const { createMessageLoadingModule } = await import(
        "@/stores/modules/message-loading"
      );
      const session = makeSession("1_2", "private", "2", "u2");
      const ctx = createMockContext({
        sessionStore: { sessions: [session] },
      });

      const mod = createMessageLoadingModule(ctx);
      await mod.loadMessages("1_2", 20);

      expect(ctx.scheduleServerMessagePersist).toHaveBeenCalledWith(
        "1_2",
        expect.any(Array)
      );
    });
  });
});
