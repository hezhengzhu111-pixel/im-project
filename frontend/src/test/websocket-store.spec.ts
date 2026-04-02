import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Message } from "@/types";

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
const chatMessages = new Map<string, Message[]>();

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
    messages: chatMessages,
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
    chatMessages.clear();
    syncOfflineMessages.mockResolvedValue(undefined);
    addMessage.mockResolvedValue(undefined);
    loadFriendRequests.mockResolvedValue(undefined);
    loadFriends.mockResolvedValue(undefined);
    loadSessions.mockResolvedValue(undefined);
    applyReadReceipt.mockResolvedValue(undefined);
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

  it("skips duplicate server messages that already exist in local state", async () => {
    issueWsTicket.mockResolvedValue({
      code: 200,
      data: {
        ticket: "ticket-dup",
        expiresInMs: 30_000,
      },
    });
    chatMessages.set("21_42", [
      {
        id: "101",
        senderId: "21",
        receiverId: "42",
        isGroupChat: false,
        messageType: "TEXT",
        content: "hello",
        sendTime: new Date().toISOString(),
        status: "SENT",
      },
    ]);

    const { useWebSocketStore } = await import("@/stores/websocket");
    const store = useWebSocketStore();

    await store.connect("42");
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    await Promise.resolve();

    ws.onmessage?.({
      data: JSON.stringify({
        type: "MESSAGE",
        data: {
          id: "101",
          senderId: "21",
          receiverId: "42",
          isGroupChat: false,
          messageType: "TEXT",
          content: "hello",
          sendTime: new Date().toISOString(),
          status: "SENT",
        },
        timestamp: Date.now(),
      }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(addMessage).not.toHaveBeenCalled();
  });

  it("processes system refresh messages outside the ordered message queue", async () => {
    issueWsTicket.mockResolvedValue({
      code: 200,
      data: {
        ticket: "ticket-system",
        expiresInMs: 30_000,
      },
    });
    let resolveAddMessage: (() => void) | undefined;
    addMessage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveAddMessage = resolve;
        }),
    );

    const { useWebSocketStore } = await import("@/stores/websocket");
    const store = useWebSocketStore();

    await store.connect("42");
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    await Promise.resolve();

    ws.onmessage?.({
      data: JSON.stringify({
        type: "MESSAGE",
        data: {
          id: "102",
          senderId: "21",
          receiverId: "42",
          isGroupChat: false,
          messageType: "TEXT",
          content: "queued",
          sendTime: new Date().toISOString(),
          status: "SENT",
        },
        timestamp: Date.now(),
      }),
    });
    await Promise.resolve();

    ws.onmessage?.({
      data: JSON.stringify({
        type: "SYSTEM",
        data: {
          content: "新好友申请::CMD:REFRESH_FRIEND_REQUESTS",
        },
        timestamp: Date.now(),
      }),
    });

    await vi.advanceTimersByTimeAsync(1500);

    expect(loadFriendRequests).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledTimes(1);

    if (resolveAddMessage) {
      resolveAddMessage();
    }
    await Promise.resolve();
  });

  it("debounces repeated friend refresh system commands", async () => {
    issueWsTicket.mockResolvedValue({
      code: 200,
      data: {
        ticket: "ticket-burst",
        expiresInMs: 30_000,
      },
    });

    const { useWebSocketStore } = await import("@/stores/websocket");
    const store = useWebSocketStore();

    await store.connect("42");
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    await Promise.resolve();

    for (let index = 0; index < 10; index += 1) {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "SYSTEM",
          data: {
            content: `批量通知${index}::CMD:REFRESH_FRIEND_LIST`,
          },
          timestamp: Date.now(),
        }),
      });
    }

    await vi.advanceTimersByTimeAsync(1499);
    expect(loadFriends).not.toHaveBeenCalled();
    expect(loadSessions).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(loadFriends).toHaveBeenCalledTimes(1);
    expect(loadSessions).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledTimes(1);
  });
});
