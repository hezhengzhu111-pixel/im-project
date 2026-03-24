import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("element-plus", () => ({
  ElMessage: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const messageServiceMock = {
  getPrivateHistoryCursor: vi.fn(),
  getGroupHistoryCursor: vi.fn(),
  getPrivateHistory: vi.fn(),
  getGroupHistory: vi.fn(),
  markRead: vi.fn(),
  sendPrivate: vi.fn(),
  sendGroup: vi.fn(),
  getConversations: vi.fn(),
  getConfig: vi.fn(),
};

vi.mock("@/services", () => ({
  messageService: messageServiceMock,
  friendService: { getList: vi.fn() },
  groupService: { getList: vi.fn() },
  userService: { getProfile: vi.fn() },
  fileService: { upload: vi.fn() },
}));

vi.mock("@/services/heartbeat", () => ({
  heartbeatService: {
    refreshFriends: vi.fn(),
  },
}));

vi.mock("@/stores/websocket", () => ({
  useWebSocketStore: () => ({
    sendMessage: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({
    userId: "1",
    nickname: "u1",
    avatar: "",
    isLoggedIn: true,
    logout: vi.fn(),
  }),
}));

describe("chat store message ordering & receipts", () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    messageServiceMock.getPrivateHistoryCursor.mockReset();
    messageServiceMock.getPrivateHistory.mockReset();
    messageServiceMock.markRead.mockReset();
    vi.resetModules();
  });

  it("sorts messages by server created time ascending", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    expect(session).toBeTruthy();

    messageServiceMock.getPrivateHistoryCursor.mockResolvedValue({
      code: 200,
      data: [
        {
          id: "2",
          senderId: "2",
          createdTime: "2026-02-07T10:00:00.999000000",
          content: "b",
          status: "SENT",
        },
        {
          id: "1",
          senderId: "1",
          createdTime: "2026-02-07T10:00:00.100000000",
          content: "a",
          status: "SENT",
        },
      ],
    });

    await store.loadMessages(session!.id, 0, 20);
    const list = store.messages.get(session!.id) || [];
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].content).toBe("a");
    expect(list[1].content).toBe("b");
    expect(list[0].sendTime.includes("2026-02-07T10:00:00.100")).toBe(true);
  });

  it("applies read receipt to outgoing messages", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    store.messages.set(session!.id, [
      {
        id: "100",
        senderId: "1",
        senderName: "u1",
        senderAvatar: "",
        receiverId: "2",
        messageType: "TEXT",
        type: "TEXT",
        content: "x",
        sendTime: "2026-02-07T10:00:00.100",
        status: "SENT",
        isGroupChat: false,
      } as any,
      {
        id: "200",
        senderId: "1",
        senderName: "u1",
        senderAvatar: "",
        receiverId: "2",
        messageType: "TEXT",
        type: "TEXT",
        content: "y",
        sendTime: "2026-02-07T10:00:00.200",
        status: "SENT",
        isGroupChat: false,
      } as any,
    ]);

    store.applyReadReceipt({
      readerId: 2,
      to_user_id: 1,
      read_at: "2026-02-07T10:00:01.000",
      last_read_message_id: 150,
    });

    const list = store.messages.get(session!.id) || [];
    const m100 = list.find((m: any) => m.id === "100");
    const m200 = list.find((m: any) => m.id === "200");
    expect(m100).toBeTruthy();
    expect(m200).toBeTruthy();
    expect((m100 as any).status).toBe("READ");
    expect((m200 as any).status).toBe("SENT");
  });

  it("splits long text into multiple messages (2000 chars each) and sends sequentially", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    messageServiceMock.getPrivateHistoryCursor.mockResolvedValue({
      code: 200,
      data: [],
    });
    messageServiceMock.getConfig.mockResolvedValue({
      code: 200,
      data: { textEnforce: true, textMaxLength: 2000 },
    });
    const session = store.createOrGetSession("private", "2", "u2", "");
    store.setCurrentSession(session as any);

    const longText = "你".repeat(4500);

    messageServiceMock.sendPrivate
      .mockResolvedValueOnce({
        code: 200,
        data: { id: "s1", createdTime: "2026-02-07T10:00:00.100000000" },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: { id: "s2", createdTime: "2026-02-07T10:00:00.200000000" },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: { id: "s3", createdTime: "2026-02-07T10:00:00.300000000" },
      });

    const ok = await store.sendMessage(longText, "TEXT");
    expect(ok).toBe(true);
    expect(messageServiceMock.getConfig).toHaveBeenCalledTimes(1);
    expect(messageServiceMock.sendPrivate).toHaveBeenCalledTimes(3);
    expect(messageServiceMock.sendPrivate.mock.calls[0][0].content.length).toBe(
      2000,
    );
    expect(messageServiceMock.sendPrivate.mock.calls[1][0].content.length).toBe(
      2000,
    );
    expect(messageServiceMock.sendPrivate.mock.calls[2][0].content.length).toBe(
      500,
    );

    const list = store.messages.get((session as any).id) || [];
    const sent = list.filter(
      (m: any) => m.status === "SENT" && typeof m.content === "string",
    );
    expect(sent.length).toBeGreaterThanOrEqual(3);
    const chunks = sent.slice(-3).map((m: any) => m.content);
    expect(chunks[0].length).toBe(2000);
    expect(chunks[1].length).toBe(2000);
    expect(chunks[2].length).toBe(500);
  });

  it("does not split when text enforce disabled by config", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    messageServiceMock.getPrivateHistoryCursor.mockResolvedValue({
      code: 200,
      data: [],
    });
    messageServiceMock.getConfig.mockResolvedValue({
      code: 200,
      data: { textEnforce: false, textMaxLength: 2000 },
    });
    const session = store.createOrGetSession("private", "2", "u2", "");
    store.setCurrentSession(session as any);

    const longText = "你".repeat(4500);

    messageServiceMock.sendPrivate.mockResolvedValueOnce({
      code: 200,
      data: { id: "s1", createdTime: "2026-02-07T10:00:00.100000000" },
    });

    const ok = await store.sendMessage(longText, "TEXT");
    expect(ok).toBe(true);
    expect(messageServiceMock.sendPrivate).toHaveBeenCalledTimes(1);
    expect(messageServiceMock.sendPrivate.mock.calls[0][0].content.length).toBe(
      4500,
    );
  });
});
