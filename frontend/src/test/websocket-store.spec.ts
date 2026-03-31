import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const issueWsTicket = vi.fn();
const checkOnlineStatus = vi.fn();
const syncOfflineMessages = vi.fn();
const addMessage = vi.fn();
const loadFriendRequests = vi.fn();
const loadFriends = vi.fn();
const loadSessions = vi.fn();
const applyReadReceipt = vi.fn();
const messageError = vi.fn();
const messageInfo = vi.fn();
const notification = vi.fn();

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code = 1000, reason = "") {
    this.onclose?.({ code, reason });
  }
}

vi.mock("element-plus", () => ({
  ElMessage: {
    error: messageError,
    info: messageInfo,
  },
  ElNotification: notification,
}));

vi.mock("@/services", () => ({
  authService: {
    issueWsTicket,
  },
  userService: {
    checkOnlineStatus,
  },
}));

vi.mock("@/stores/chat", () => ({
  useChatStore: () => ({
    syncOfflineMessages,
    addMessage,
    loadFriendRequests,
    loadFriends,
    loadSessions,
    applyReadReceipt,
  }),
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({
    userId: "42",
  }),
}));

describe("websocket store", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setActivePinia(createPinia());
    FakeWebSocket.instances = [];
    issueWsTicket.mockReset();
    checkOnlineStatus.mockReset();
    syncOfflineMessages.mockReset();
    addMessage.mockReset();
    loadFriendRequests.mockReset();
    loadFriends.mockReset();
    loadSessions.mockReset();
    applyReadReceipt.mockReset();
    messageError.mockReset();
    messageInfo.mockReset();
    notification.mockReset();
    syncOfflineMessages.mockResolvedValue(undefined);
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    localStorage.clear();
  });

  it("requests a websocket ticket before connecting", async () => {
    issueWsTicket.mockResolvedValue({
      code: 200,
      data: {
        ticket: "ticket-123",
        expiresInMs: 30_000,
      },
    });

    const { useWebSocketStore } = await import("@/stores/websocket");
    const store = useWebSocketStore();

    await store.connect("42");

    expect(issueWsTicket).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain("/websocket/42");
    expect(FakeWebSocket.instances[0].url).toContain("ticket=ticket-123");
    expect(FakeWebSocket.instances[0].url).not.toContain("token=");

    FakeWebSocket.instances[0].onopen?.();
    await Promise.resolve();

    expect(syncOfflineMessages).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("im_ws_cache")).toContain("\"userId\":\"42\"");
  });

  it("retries with a new ticket when issuing the first ticket fails", async () => {
    issueWsTicket
      .mockRejectedValueOnce(new Error("ticket failed"))
      .mockResolvedValueOnce({
        code: 200,
        data: {
          ticket: "ticket-456",
          expiresInMs: 30_000,
        },
      });

    const { useWebSocketStore } = await import("@/stores/websocket");
    const store = useWebSocketStore();

    await store.connect("42");
    expect(store.reconnectAttempts).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(0);

    await vi.runOnlyPendingTimersAsync();

    expect(issueWsTicket).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain("ticket=ticket-456");
    expect(messageError).toHaveBeenCalled();
  });
});
