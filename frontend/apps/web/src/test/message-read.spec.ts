import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { ChatSession, Message } from "@/types";
import {
  createMessageReadModule,
  type MessageReadModuleContext,
} from "@/stores/modules/message-read";

vi.mock("@/normalizers/chat", () => ({
  buildSessionId: (_type: string, a: string, b: string) => `${a}_${b}`,
  toBigIntId: (v: unknown) => (v != null ? BigInt(String(v)) : null),
}));

vi.mock("@/utils/messageNormalize", () => ({
  normalizeReadReceipt: (raw: unknown) => raw,
}));

const makeContext = () => {
  const messages = ref(new Map());
  const readSessionLocks = ref(new Set<string>());
  const readSessionLastAt = ref(new Map<string, number>());
  const readSessionDirty = ref(new Set<string>());
  const markRead = vi.fn().mockResolvedValue(undefined);
  const markSessionReadLocally = vi.fn();

  const ctx = {
    messages,
    readSessionLocks,
    readSessionLastAt,
    readSessionDirty,
    messageService: { markRead },
    sessionStore: {
      sessions: [
        {
          id: "sess_1",
          type: "private",
          targetId: "user_2",
          conversationId: "conv_1",
        },
      ],
      markSessionReadLocally,
    },
    getCurrentUserId: () => "user_1",
    scheduleServerMessagePersist: vi.fn(),
  } as unknown as MessageReadModuleContext;

  return { ctx, markRead, markSessionReadLocally, readSessionDirty, scheduleServerMessagePersist: ctx.scheduleServerMessagePersist };
};

describe("message-read: markAsRead dirty flush", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  it("flushes dirty session after lock release (two calls: first sends, second locked then flushed)", async () => {
    const { ctx, markRead, readSessionDirty } = makeContext();
    const mod = createMessageReadModule(ctx);

    // First call — should send to server
    const p1 = mod.markAsRead("sess_1");
    await vi.runAllTimersAsync();
    await p1;
    expect(markRead).toHaveBeenCalledTimes(1);
    expect(readSessionDirty.value.has("sess_1")).toBe(false);

    // Second call immediately — lock was just released, but <400ms throttle
    markRead.mockClear();
    const p2 = mod.markAsRead("sess_1");
    await vi.runAllTimersAsync();
    await p2;
    // Throttled, marked dirty, no server call
    expect(markRead).toHaveBeenCalledTimes(0);
    expect(readSessionDirty.value.has("sess_1")).toBe(true);

    // Advance past 400ms throttle window
    vi.advanceTimersByTime(401);
    markRead.mockClear();

    // Third call — throttle expired, dirty is set, should flush
    const p3 = mod.markAsRead("sess_1");
    await vi.runAllTimersAsync();
    await p3;
    // markRead called once by third call, flush also fires (dirty was set)
    expect(markRead).toHaveBeenCalledTimes(2);
    expect(readSessionDirty.value.has("sess_1")).toBe(false);
  });

  it("within 400ms multiple calls result in at least one server sync", async () => {
    const { ctx, markRead, readSessionDirty } = makeContext();
    const mod = createMessageReadModule(ctx);

    // Fire 5 rapid calls within 400ms
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(mod.markAsRead("sess_1"));
    }
    await vi.runAllTimersAsync();
    await Promise.all(promises);

    // First call sends, flush also fires (dirty from throttled calls)
    expect(markRead).toHaveBeenCalledTimes(2);

    // Advance past throttle and make another call
    vi.advanceTimersByTime(401);
    markRead.mockClear();
    const flushCall = mod.markAsRead("sess_1");
    await vi.runAllTimersAsync();
    await flushCall;
    expect(markRead).toHaveBeenCalledTimes(1);
    expect(readSessionDirty.value.has("sess_1")).toBe(false);
  });

  it("server failure does not clear dirty", async () => {
    const { ctx, markRead, readSessionDirty } = makeContext();
    const mod = createMessageReadModule(ctx);

    // First call succeeds
    const p1 = mod.markAsRead("sess_1");
    await vi.runAllTimersAsync();
    await p1;
    expect(markRead).toHaveBeenCalledTimes(1);

    // Throttled call — marks dirty
    const p2 = mod.markAsRead("sess_1");
    await vi.runAllTimersAsync();
    await p2;
    expect(readSessionDirty.value.has("sess_1")).toBe(true);

    // Advance past throttle
    vi.advanceTimersByTime(401);
    markRead.mockClear();

    // Next call fails — dirty must NOT be cleared, no flush on failure
    markRead.mockRejectedValueOnce(new Error("network"));
    const p3 = mod.markAsRead("sess_1").catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await p3;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("network");
    // Dirty stays set because markRead failed — next call will retry
    expect(readSessionDirty.value.has("sess_1")).toBe(true);
    // Only one markRead call (the failed one), no flush
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("locked call marks dirty, lock release triggers flush", async () => {
    const { ctx, markRead, readSessionDirty } = makeContext();
    const mod = createMessageReadModule(ctx);

    // Start first call (acquires lock, slow response)
    let resolveFirst!: () => void;
    markRead.mockImplementationOnce(
      () => new Promise<void>((r) => (resolveFirst = r)),
    );
    const p1 = mod.markAsRead("sess_1");
    await vi.advanceTimersByTimeAsync(10);

    // Lock is held, second call should mark dirty
    const p2 = mod.markAsRead("sess_1");
    await vi.advanceTimersByTimeAsync(10);
    expect(readSessionDirty.value.has("sess_1")).toBe(true);
    expect(markRead).toHaveBeenCalledTimes(1);

    // Advance past 400ms so the flush won't be throttled
    vi.advanceTimersByTime(401);

    // Release first call — lock freed, dirty flushed via finally
    markRead.mockResolvedValue(undefined);
    resolveFirst();
    await vi.runAllTimersAsync();
    await p1;
    await p2;

    // Flush should have fired — markRead called again
    expect(markRead).toHaveBeenCalledTimes(2);
    expect(readSessionDirty.value.has("sess_1")).toBe(false);
  });
});

describe("message-read: conversation id resolution & read receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves private session conversation id to targetId", async () => {
    const { ctx, markRead } = makeContext();
    const mod = createMessageReadModule(ctx);

    await mod.markAsRead("sess_1");
    expect(markRead).toHaveBeenCalledWith("conv_1");
  });

  it("resolves group session with group_ prefix", async () => {
    const { ctx, markRead } = makeContext();
    // Override the context with a group session
    ctx.sessionStore.sessions = [
      {
        id: "group_9",
        type: "group",
        targetId: "9",
        conversationId: undefined,
      } as ChatSession,
    ];
    const mod = createMessageReadModule(ctx);

    await mod.markAsRead("group_9");
    expect(markRead).toHaveBeenCalledWith("group_9");
  });

  it("falls back to sessionId when session not found", async () => {
    const { ctx, markRead } = makeContext();
    const mod = createMessageReadModule(ctx);

    await mod.markAsRead("unknown_1");
    expect(markRead).toHaveBeenCalledWith("unknown_1");
  });

  it("marks session read locally after successful markRead", async () => {
    const { ctx, markRead, markSessionReadLocally } = makeContext();
    const mod = createMessageReadModule(ctx);

    await mod.markAsRead("sess_1");
    expect(markRead).toHaveBeenCalled();
    expect(markSessionReadLocally).toHaveBeenCalledWith("sess_1");
  });

  it("applyReadReceipt marks own messages as READ in private session", async () => {
    const { ctx, markRead } = makeContext();
    const mod = createMessageReadModule(ctx);

    const message: Message = {
      id: "100",
      senderId: "user_1",
      content: "hello",
      sendTime: "2026-05-18T10:00:00.000Z",
      messageType: "TEXT",
      status: "SENT",
      isGroupChat: false,
    };
    // resolveReadReceiptSessionId returns buildSessionId("private", "user_1", "user_2") = "user_1_user_2"
    ctx.messages.value.set("user_1_user_2", [message]);

    await mod.applyReadReceipt({
      readerId: "user_2",
      lastReadMessageId: "100",
      readAt: "2026-05-18T10:00:02.000Z",
    });

    const updatedMessages = ctx.messages.value.get("user_1_user_2") || [];
    expect(updatedMessages[0].status).toBe("READ");
  });

  it("applyReadReceipt does not mark messages past lastReadMessageId", async () => {
    const { ctx, markRead } = makeContext();
    const mod = createMessageReadModule(ctx);

    ctx.messages.value.set("user_1_user_2", [
      {
        id: "100", senderId: "user_1", content: "a",
        sendTime: "2026-05-18T10:00:00.000Z", messageType: "TEXT", status: "SENT",
      } as Message,
      {
        id: "101", senderId: "user_1", content: "b",
        sendTime: "2026-05-18T10:00:01.000Z", messageType: "TEXT", status: "SENT",
      } as Message,
    ]);

    await mod.applyReadReceipt({
      readerId: "user_2",
      lastReadMessageId: "100",
      readAt: "2026-05-18T10:00:02.000Z",
    });

    const updatedMessages = ctx.messages.value.get("user_1_user_2") || [];
    expect(updatedMessages.find((m) => m.id === "100")?.status).toBe("READ");
    expect(updatedMessages.find((m) => m.id === "101")?.status).toBe("SENT");
  });

  it("applyReadReceipt handles group sessions with readBy", async () => {
    const { ctx, markRead } = makeContext();
    ctx.sessionStore.sessions = [
      { id: "group_9", type: "group", targetId: "9" } as ChatSession,
    ];
    const mod = createMessageReadModule(ctx);

    ctx.messages.value.set("group_9", [
      {
        id: "g100", senderId: "user_1", content: "hello",
        sendTime: "2026-05-18T10:00:00.000Z", messageType: "TEXT", status: "SENT",
      } as Message,
    ]);

    await mod.applyReadReceipt({
      readerId: "user_2",
      conversationId: "group_9",
      lastReadMessageId: "g100",
      readAt: "2026-05-18T10:00:02.000Z",
    });

    const updatedMessages = ctx.messages.value.get("group_9") || [];
    expect(updatedMessages[0].readBy).toContain("user_2");
    expect(updatedMessages[0].readByCount).toBe(1);
    expect(updatedMessages[0].readStatus).toBe(1);
  });

  it("applyReadReceipt calls applyReadSync when reader is current user", async () => {
    const { ctx, markSessionReadLocally } = makeContext();
    const mod = createMessageReadModule(ctx);

    ctx.messages.value.set("sess_1", [
      {
        id: "100", senderId: "user_2", content: "hi",
        sendTime: "2026-05-18T10:00:00.000Z", messageType: "TEXT", status: "SENT",
      } as Message,
    ]);

    // readerId === getCurrentUserId() → applyReadSync path
    // toUserId = "user_2" → buildSessionId("private", "user_1", "user_2") = "user_1_user_2"
    // This doesn't match "sess_1", so markSessionReadLocally is still called
    // but the actual message list update uses the resolved session
    await mod.applyReadReceipt({
      readerId: "user_1",
      toUserId: "user_2",
      lastReadMessageId: "100",
      readAt: "2026-05-18T10:00:02.000Z",
    });

    // resolveReadSyncSessionId: toUserId !== currentUserId ("user_2" !== "user_1")
    // → targetId = "user_2"
    // → buildSessionId("private", "user_1", "user_2") = "user_1_user_2"
    // → this does not match "sess_1", so messages won't be updated
    // But markSessionReadLocally is always called
    expect(markSessionReadLocally).toHaveBeenCalledWith("user_1_user_2");
  });

  it("returns early when receipt is null/empty", async () => {
    const { ctx, markRead } = makeContext();
    const mod = createMessageReadModule(ctx);

    await expect(mod.applyReadReceipt(null)).resolves.toBeUndefined();
    await expect(mod.applyReadReceipt(undefined)).resolves.toBeUndefined();
    await expect(mod.applyReadReceipt({})).resolves.toBeUndefined();
  });

  it("returns early when no current user", async () => {
    const { ctx, markRead } = makeContext();
    ctx.getCurrentUserId = () => "";
    const mod = createMessageReadModule(ctx);

    await mod.applyReadReceipt({
      readerId: "user_2",
      lastReadMessageId: "100",
    });

    expect(markRead).not.toHaveBeenCalled();
  });

  it("does nothing when no messages in the session list for receipt", async () => {
    const { ctx, markRead, scheduleServerMessagePersist } = makeContext();
    const mod = createMessageReadModule(ctx);

    await mod.applyReadReceipt({
      readerId: "user_2",
      lastReadMessageId: "100",
      readAt: "2026-05-18T10:00:02.000Z",
    });

    expect(scheduleServerMessagePersist).not.toHaveBeenCalled();
  });

  it("does nothing when lastReadMessageId is missing", async () => {
    const { ctx, scheduleServerMessagePersist } = makeContext();
    ctx.messages.value.set("user_1_user_2", [
      {
        id: "100", senderId: "user_1", content: "hi",
        sendTime: "2026-05-18T10:00:00.000Z", messageType: "TEXT", status: "SENT",
      } as Message,
    ]);
    const mod = createMessageReadModule(ctx);

    await mod.applyReadReceipt({
      readerId: "user_2",
      lastReadMessageId: "",
    });

    expect(scheduleServerMessagePersist).not.toHaveBeenCalled();
  });

  it("persists changed messages after receipt application", async () => {
    const { ctx, scheduleServerMessagePersist } = makeContext();
    const mod = createMessageReadModule(ctx);

    ctx.messages.value.set("user_1_user_2", [
      {
        id: "100", senderId: "user_1", content: "hello",
        sendTime: "2026-05-18T10:00:00.000Z", messageType: "TEXT", status: "SENT",
      } as Message,
    ]);

    await mod.applyReadReceipt({
      readerId: "user_2",
      lastReadMessageId: "100",
      readAt: "2026-05-18T10:00:02.000Z",
    });

    expect(scheduleServerMessagePersist).toHaveBeenCalledWith(
      "user_1_user_2",
      expect.arrayContaining([expect.objectContaining({ id: "100", status: "READ" })])
    );
  });

  it("marks session read locally in applyReadSync path", async () => {
    const { ctx, markSessionReadLocally } = makeContext();
    const mod = createMessageReadModule(ctx);

    // applyReadReceipt with readerId === "user_1" → applyReadSync
    await mod.applyReadReceipt({
      readerId: "user_1",
      toUserId: "user_2",
      lastReadMessageId: "100",
    });

    expect(markSessionReadLocally).toHaveBeenCalled();
  });
});
