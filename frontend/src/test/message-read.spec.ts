import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
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

  return { ctx, markRead, markSessionReadLocally, readSessionDirty };
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
