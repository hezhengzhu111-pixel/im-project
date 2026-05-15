import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Message } from "@/types";

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

const friendServiceMock = {
  getList: vi.fn(),
  getRequests: vi.fn(),
  delete: vi.fn(),
  updateRemark: vi.fn(),
  add: vi.fn(),
  handleRequest: vi.fn(),
};

const groupServiceMock = {
  getList: vi.fn(),
  create: vi.fn(),
  quit: vi.fn(),
};

const userServiceMock = {
  search: vi.fn(),
};

const messageRepoMock = {
  listConversation: vi.fn(),
  upsertServerMessages: vi.fn(),
  upsertPendingMessage: vi.fn(),
  removePendingMessage: vi.fn(),
  clearConversation: vi.fn(),
  clearPendingMessages: vi.fn(),
  listPendingMessages: vi.fn(),
  addPendingMessage: vi.fn(),
};

vi.mock("@/services/message", () => ({
  messageService: messageServiceMock,
}));

vi.mock("@/services/group", () => ({
  groupService: groupServiceMock,
}));

vi.mock("@/services", () => ({
  friendService: friendServiceMock,
  userService: userServiceMock,
}));

vi.mock("@/utils/messageRepo", () => ({
  messageRepo: messageRepoMock,
}));

vi.mock("@/services/heartbeat", () => ({
  heartbeatService: {
    refreshFriends: vi.fn(),
  },
}));

vi.mock("@/stores/websocket", () => ({
  useWebSocketStore: () => ({
    refreshOnlineStatus: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("@/features/e2ee/manager/negotiation", () => ({
  getLocalSessionStatus: vi.fn(() => "plaintext"),
  getPendingInitialHandshake: vi.fn(() => null),
  clearPendingInitialHandshake: vi.fn(),
}));

vi.mock("@/features/e2ee/manager/e2ee-manager", () => ({
  e2eeManager: {
    encryptMessage: vi.fn(),
  },
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({
    userId: "1",
    currentUser: {
      id: "1",
      username: "u1",
      nickname: "u1",
      avatar: "",
      status: "offline",
    },
    nickname: "u1",
    avatar: "",
    userInfo: { id: "1", username: "u1", nickname: "u1" },
    isLoggedIn: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/services/platform/app-lifecycle.service", () => ({
  appLifecycleService: {
    onForeground: vi.fn(),
  },
}));

vi.mock("@/services/platform/network-status.service", () => ({
  networkStatusService: {
    onOnline: vi.fn(),
  },
}));

const flushMicrotasks = async (count = 6) => {
  for (let i = 0; i < count; i++) {
    await Promise.resolve();
  }
};

// ── Helpers ──

const makePrivateMessage = (
  id: string,
  opts: { senderId?: string; content?: string; sendTime?: string } = {},
): Message => ({
  id,
  senderId: opts.senderId ?? "2",
  receiverId: "1",
  isGroupChat: false,
  messageType: "TEXT",
  status: "SENT",
  content: opts.content ?? "",
  sendTime: opts.sendTime ?? "2026-02-07T10:00:00.000Z",
});

const makeGroupMessage = (
  id: string,
  opts: { senderId?: string; content?: string; sendTime?: string } = {},
): Message => ({
  id,
  senderId: opts.senderId ?? "2",
  groupId: "9",
  isGroupChat: true,
  messageType: "TEXT",
  status: "SENT",
  content: opts.content ?? "",
  sendTime: opts.sendTime ?? "2026-02-07T10:00:00.000Z",
});

const defaultBeforeEach = () => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.resetModules();
  messageServiceMock.getPrivateHistoryCursor.mockResolvedValue({ code: 200, data: [] });
  messageServiceMock.getGroupHistoryCursor.mockResolvedValue({ code: 200, data: [] });
  messageServiceMock.getConversations.mockResolvedValue({ code: 200, data: [] });
  messageServiceMock.getConfig.mockResolvedValue({ code: 200, data: { textEnforce: true, textMaxLength: 2000 } });
  messageServiceMock.markRead.mockResolvedValue(undefined);
  messageServiceMock.sendPrivate.mockResolvedValue({ code: 200, data: {} });
  friendServiceMock.getList.mockResolvedValue({ code: 200, data: [] });
  groupServiceMock.getList.mockResolvedValue({ code: 200, data: [] });
  messageRepoMock.listConversation.mockResolvedValue([]);
  messageRepoMock.upsertServerMessages.mockResolvedValue(undefined);
  messageRepoMock.upsertPendingMessage.mockResolvedValue(undefined);
  messageRepoMock.removePendingMessage.mockResolvedValue(undefined);
  messageRepoMock.clearConversation.mockResolvedValue(undefined);
  messageRepoMock.clearPendingMessages.mockResolvedValue(undefined);
};

// ── Tests ──

describe("阶段三回归：session 排序 (S8)", () => {
  beforeEach(defaultBeforeEach);

  it("pinned sessions appear before unpinned sessions regardless of time", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const older = store.createOrGetSession("private", "2", "u2", "");
    const newer = store.createOrGetSession("private", "3", "u3", "");

    store.sessions.find((s) => s.id === older!.id)!.lastActiveTime = "2026-01-01T00:00:00.000Z";
    store.sessions.find((s) => s.id === newer!.id)!.lastActiveTime = "2026-12-01T00:00:00.000Z";

    store.toggleSessionPinned(older!.id, true);

    const sorted = store.sortedSessions;
    expect(sorted[0].id).toBe(older!.id);
    expect(sorted[1].id).toBe(newer!.id);
  });

  it("unpinned sessions sort by lastActiveTime descending", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const s1 = store.createOrGetSession("private", "2", "u2", "");
    const s2 = store.createOrGetSession("private", "3", "u3", "");
    const s3 = store.createOrGetSession("private", "4", "u4", "");

    store.sessions.find((s) => s.id === s1!.id)!.lastActiveTime = "2026-01-01T00:00:00.000Z";
    store.sessions.find((s) => s.id === s2!.id)!.lastActiveTime = "2026-06-01T00:00:00.000Z";
    store.sessions.find((s) => s.id === s3!.id)!.lastActiveTime = "2026-03-01T00:00:00.000Z";

    const sorted = store.sortedSessions;
    expect(sorted.map((s) => s.id)).toEqual([s2!.id, s3!.id, s1!.id]);
  });

  it("invalid lastActiveTime is treated as 0 (sorted last among unpinned)", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const valid = store.createOrGetSession("private", "2", "u2", "");
    const invalid = store.createOrGetSession("private", "3", "u3", "");

    store.sessions.find((s) => s.id === valid!.id)!.lastActiveTime = "2026-06-01T00:00:00.000Z";
    store.sessions.find((s) => s.id === invalid!.id)!.lastActiveTime = "not-a-date";

    const sorted = store.sortedSessions;
    expect(sorted[0].id).toBe(valid!.id);
    expect(sorted[1].id).toBe(invalid!.id);
  });
});

describe("阶段三回归：addMessage (S7/S9/S11)", () => {
  beforeEach(defaultBeforeEach);

  it("routes a new private message into the correct session", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    await store.addMessage(
      makePrivateMessage("1001", { content: "hello" }),
    );

    const session = store.sessions.find((s) => s.targetId === "2");
    expect(session).toBeDefined();
    expect(store.messages.get(session!.id)?.[0]?.content).toBe("hello");
  });

  it("replaces a pending local message with its server echo (S11)", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    // Add a pending local message
    await store.addMessage({
      ...makePrivateMessage("local_abc", {
        senderId: "1",
        content: "pending text",
        sendTime: "2026-02-07T10:00:00.000Z",
      }),
      receiverId: "2",
      clientMessageId: "cm_abc",
      status: "SENDING",
    });

    const session = store.sessions.find((s) => s.targetId === "2");
    expect(session).toBeDefined();
    const list1 = store.messages.get(session!.id) || [];
    expect(list1).toHaveLength(1);
    expect(list1[0].id).toBe("local_abc");

    // Server echo arrives with same clientMessageId
    await store.addMessage({
      ...makePrivateMessage("1002", {
        senderId: "1",
        content: "pending text",
        sendTime: "2026-02-07T10:00:00.100Z",
      }),
      receiverId: "2",
      clientMessageId: "cm_abc",
    });

    const list2 = store.messages.get(session!.id) || [];
    expect(list2).toHaveLength(1);
    expect(list2[0].id).toBe("1002");
    expect(list2[0].status).toBe("SENT");
  });

  it("does not duplicate messages with the same server id", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    await store.addMessage(
      makePrivateMessage("2001", { content: "first" }),
    );

    await store.addMessage(
      makePrivateMessage("2001", { content: "first" }),
    );

    const session = store.sessions.find((s) => s.targetId === "2");
    const list = store.messages.get(session!.id) || [];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("2001");
  });

  it("does not duplicate messages matched by clientMessageId", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    await store.addMessage({
      ...makePrivateMessage("3001", { content: "msg" }),
      clientMessageId: "cm_unique_1",
    });

    await store.addMessage({
      ...makePrivateMessage("3002", {
        content: "msg updated",
        sendTime: "2026-02-07T10:00:00.100Z",
      }),
      clientMessageId: "cm_unique_1",
    });

    const session = store.sessions.find((s) => s.targetId === "2");
    const list = store.messages.get(session!.id) || [];
    expect(list).toHaveLength(1);
  });

  it("sets lastMessage and lastActiveTime on the session when a message arrives (S9)", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    store.sessions.find((s) => s.id === session!.id)!.lastActiveTime = "2026-01-01T00:00:00.000Z";

    await store.addMessage(
      makePrivateMessage("4001", {
        content: "new msg",
        sendTime: "2026-06-15T12:00:00.000Z",
      }),
    );

    const updated = store.sessions.find((s) => s.id === session!.id);
    expect(updated?.lastMessage?.content).toBe("new msg");
    expect(updated?.lastActiveTime).toBe("2026-06-15T12:00:00.000Z");
  });
});

describe("阶段三回归：unread 递增与清零 (S9)", () => {
  beforeEach(defaultBeforeEach);

  it("increments unread when a non-self message arrives for a non-current session", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const active = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(active!);

    await store.addMessage(
      makePrivateMessage("5001", {
        senderId: "3",
        content: "unread msg",
      }),
    );

    const session3 = store.sessions.find((s) => s.targetId === "3");
    expect(session3).toBeDefined();
    expect(session3!.unreadCount).toBe(1);
    expect(store.unreadCounts.get(session3!.id)).toBe(1);
    expect(store.totalUnreadCount).toBe(1);
  });

  it("does not increment unread for messages in the current session", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const active = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(active!);

    await store.addMessage(
      makePrivateMessage("6001", {
        senderId: "2",
        content: "hello current",
      }),
    );

    expect(active!.unreadCount).toBe(0);
    expect(store.totalUnreadCount).toBe(0);
  });

  it("does not increment unread for self-sent messages", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    store.createOrGetSession("private", "3", "u3", "");

    await store.addMessage({
      ...makePrivateMessage("6100", {
        senderId: "1",
        content: "self msg",
      }),
      receiverId: "3",
    });

    const session3 = store.sessions.find((s) => s.targetId === "3");
    expect(session3!.unreadCount).toBe(0);
  });

  it("clears unread when switching to a session via setCurrentSession", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const active = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(active!);

    for (let i = 0; i < 3; i++) {
      await store.addMessage(
        makePrivateMessage(String(7000 + i), {
          senderId: "3",
          content: `msg ${i}`,
          sendTime: `2026-02-07T10:00:0${i}.000Z`,
        }),
      );
    }

    const session3 = store.sessions.find((s) => s.targetId === "3");
    expect(session3!.unreadCount).toBe(3);

    await store.setCurrentSession(session3!);
    expect(session3!.unreadCount).toBe(0);
    expect(store.unreadCounts.get(session3!.id)).toBe(0);
  });

  it("clears unread after markAsRead", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const { useMessageStore } = await import("@/stores/message");
    const store = useChatStore();
    const messageStore = useMessageStore();

    const active = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(active!);

    for (let i = 0; i < 2; i++) {
      await store.addMessage(
        makePrivateMessage(String(8000 + i), {
          senderId: "3",
          content: `msg ${i}`,
          sendTime: `2026-02-07T10:00:0${i}.000Z`,
        }),
      );
    }

    const session3 = store.sessions.find((s) => s.targetId === "3");
    expect(session3!.unreadCount).toBe(2);

    await messageStore.markAsRead(session3!.id);
    const updated3 = store.sessions.find((s) => s.targetId === "3");
    expect(updated3!.unreadCount).toBe(0);
    expect(store.unreadCounts.get(session3!.id)).toBe(0);
  });

  it("accumulates unread correctly across multiple messages", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const active = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(active!);

    for (let i = 0; i < 5; i++) {
      await store.addMessage(
        makePrivateMessage(String(9000 + i), {
          senderId: "4",
          content: `msg ${i}`,
          sendTime: `2026-02-07T10:00:0${i}.000Z`,
        }),
      );
    }

    const session4 = store.sessions.find((s) => s.targetId === "4");
    expect(session4!.unreadCount).toBe(5);
    expect(store.totalUnreadCount).toBe(5);
  });
});

describe("阶段三回归：read receipt (S10)", () => {
  beforeEach(defaultBeforeEach);

  it("private received: marks messages sent by current user as READ", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    store.messages.set(session!.id, [
      {
        id: "100",
        senderId: "1",
        receiverId: "2",
        isGroupChat: false,
        messageType: "TEXT",
        content: "hello",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
      {
        id: "200",
        senderId: "1",
        receiverId: "2",
        isGroupChat: false,
        messageType: "TEXT",
        content: "world",
        sendTime: "2026-02-07T10:00:00.200Z",
        status: "SENT",
      },
    ]);

    // readerId != currentUserId → received mode
    await store.applyReadReceipt({
      readerId: "2",
      lastReadMessageId: "150",
      readAt: "2026-02-07T10:00:01.000Z",
    });
    await flushMicrotasks();

    const list = store.messages.get(session!.id) || [];
    expect(list.find((m) => m.id === "100")?.status).toBe("READ");
    expect(list.find((m) => m.id === "200")?.status).toBe("SENT");
  });

  it("private sync: marks messages NOT sent by current user as READ", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    store.messages.set(session!.id, [
      {
        id: "100",
        senderId: "2",
        receiverId: "1",
        isGroupChat: false,
        messageType: "TEXT",
        content: "from other",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
      {
        id: "200",
        senderId: "2",
        receiverId: "1",
        isGroupChat: false,
        messageType: "TEXT",
        content: "from other 2",
        sendTime: "2026-02-07T10:00:00.200Z",
        status: "SENT",
      },
    ]);

    // readerId === currentUserId → sync mode
    await store.applyReadReceipt({
      readerId: "1",
      toUserId: "2",
      lastReadMessageId: "150",
      readAt: "2026-02-07T10:00:01.000Z",
    });
    await flushMicrotasks();

    const list = store.messages.get(session!.id) || [];
    expect(list.find((m) => m.id === "100")?.status).toBe("READ");
    expect(list.find((m) => m.id === "200")?.status).toBe("SENT");
  });

  it("group readBy: adds reader to readBy array without changing status", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const group = { id: "9", groupName: "g", ownerId: "1", memberCount: 3, createTime: "2026-01-01T00:00:00.000Z" };
    await store.openGroupSession(group);

    store.messages.set("group_9", [
      {
        id: "g100",
        senderId: "1",
        groupId: "9",
        isGroupChat: true,
        messageType: "TEXT",
        content: "group msg",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
    ]);

    await store.applyReadReceipt({
      readerId: "3",
      conversationId: "group_9",
      lastReadMessageId: "g100",
      readAt: "2026-02-07T10:00:01.000Z",
    });
    await flushMicrotasks();

    const list = store.messages.get("group_9") || [];
    const msg = list.find((m) => m.id === "g100");
    expect(msg?.readBy).toContain("3");
    expect(msg?.readByCount).toBe(1);
    expect(msg?.status).toBe("SENT");
  });
});

describe("阶段三回归：clearMessages (S13)", () => {
  beforeEach(defaultBeforeEach);

  it("hides old messages after clearMessages", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    store.messages.set(session!.id, [
      {
        id: "100",
        senderId: "1",
        receiverId: "2",
        isGroupChat: false,
        messageType: "TEXT",
        content: "old",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
    ]);

    await store.clearMessages(session!.id);

    expect(store.messages.get(session!.id)).toEqual([]);
  });

  it("old messages stay hidden when reloaded from history", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    store.messages.set(session!.id, [
      {
        id: "100",
        senderId: "1",
        receiverId: "2",
        isGroupChat: false,
        messageType: "TEXT",
        content: "old",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
    ]);

    await store.clearMessages(session!.id);

    messageServiceMock.getPrivateHistoryCursor.mockResolvedValue({
      code: 200,
      data: [
        {
          id: "100",
          senderId: "1",
          receiverId: "2",
          isGroupChat: false,
          messageType: "TEXT",
          content: "old",
          sendTime: "2026-02-07T10:00:00.100Z",
          status: "SENT",
        },
        {
          id: "101",
          senderId: "2",
          receiverId: "1",
          isGroupChat: false,
          messageType: "TEXT",
          content: "new",
          sendTime: "2026-02-07T10:00:01.100Z",
          status: "SENT",
        },
      ],
    });

    await store.loadMessages(session!.id, 0, 20);

    const list = store.messages.get(session!.id) || [];
    expect(list.map((m) => m.id)).toEqual(["101"]);
    expect(list[0].content).toBe("new");
  });

  it("new messages after clear are still displayed", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    store.messages.set(session!.id, [
      {
        id: "100",
        senderId: "1",
        receiverId: "2",
        isGroupChat: false,
        messageType: "TEXT",
        content: "old",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
    ]);

    await store.clearMessages(session!.id);

    await store.addMessage(
      makePrivateMessage("200", {
        content: "brand new",
        sendTime: "2026-02-08T10:00:00.000Z",
      }),
    );

    const list = store.messages.get(session!.id) || [];
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe("brand new");
  });

  it("clear resets session lastMessage and unreadCount", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    store.messages.set(session!.id, [
      {
        id: "100",
        senderId: "2",
        receiverId: "1",
        isGroupChat: false,
        messageType: "TEXT",
        content: "old",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
    ]);

    const s = store.sessions.find((s) => s.id === session!.id)!;
    s.unreadCount = 5;

    await store.clearMessages(session!.id);

    const updated = store.sessions.find((s) => s.id === session!.id)!;
    expect(updated.lastMessage).toBeUndefined();
    expect(updated.lastMessageTime).toBeUndefined();
    expect(updated.unreadCount).toBe(0);
  });
});

describe("阶段三回归：retry (S12)", () => {
  beforeEach(() => {
    defaultBeforeEach();
    messageRepoMock.addPendingMessage.mockResolvedValue(undefined);
    messageRepoMock.listPendingMessages.mockResolvedValue([]);
  });

  it("network error leaves pending message in queue for retry", async () => {
    const { retryPendingMessages } = await import("@/stores/modules/message-retry");

    const sendPrivate = vi.fn().mockRejectedValue(new Error("Network Error"));
    const sendGroup = vi.fn();
    const sendPrivateEncrypted = vi.fn();
    const listPendingMessages = vi.fn().mockResolvedValue([
      {
        localId: "local_retry_1",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          data: { receiverId: "2", content: "retry me" },
        }),
      },
    ]);
    const removePendingMessage = vi.fn();

    await retryPendingMessages(
      { sendPrivate, sendGroup, sendPrivateEncrypted } as never,
      { listPendingMessages, removePendingMessage } as never,
    );

    expect(sendPrivate).toHaveBeenCalled();
    expect(removePendingMessage).not.toHaveBeenCalled();
  });

  it("successful retry removes pending message from queue", async () => {
    const { retryPendingMessages } = await import("@/stores/modules/message-retry");

    const sendPrivate = vi.fn().mockResolvedValue({ data: { id: "srv_1" } });
    const sendGroup = vi.fn();
    const sendPrivateEncrypted = vi.fn();
    const listPendingMessages = vi.fn().mockResolvedValue([
      {
        localId: "local_retry_2",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          data: { receiverId: "2", content: "will succeed" },
        }),
      },
    ]);
    const removePendingMessage = vi.fn().mockResolvedValue(undefined);

    await retryPendingMessages(
      { sendPrivate, sendGroup, sendPrivateEncrypted } as never,
      { listPendingMessages, removePendingMessage } as never,
    );

    expect(sendPrivate).toHaveBeenCalled();
    expect(removePendingMessage).toHaveBeenCalledWith("local_retry_2");
  });

  it("multiple pending messages: partial failure preserves failed ones", async () => {
    const { retryPendingMessages } = await import("@/stores/modules/message-retry");

    const sendPrivate = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "srv_ok" } })
      .mockRejectedValueOnce(new Error("timeout"));
    const sendGroup = vi.fn();
    const sendPrivateEncrypted = vi.fn();
    const listPendingMessages = vi.fn().mockResolvedValue([
      {
        localId: "local_ok",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          data: { receiverId: "2", content: "ok" },
        }),
      },
      {
        localId: "local_fail",
        conversationId: "sess_1",
        payload: JSON.stringify({
          sendType: "private",
          data: { receiverId: "3", content: "fail" },
        }),
      },
    ]);
    const removePendingMessage = vi.fn().mockResolvedValue(undefined);

    await retryPendingMessages(
      { sendPrivate, sendGroup, sendPrivateEncrypted } as never,
      { listPendingMessages, removePendingMessage } as never,
    );

    expect(removePendingMessage).toHaveBeenCalledTimes(1);
    expect(removePendingMessage).toHaveBeenCalledWith("local_ok");
  });

  it("empty pending queue does nothing", async () => {
    const { retryPendingMessages } = await import("@/stores/modules/message-retry");

    const sendPrivate = vi.fn();
    const sendGroup = vi.fn();
    const sendPrivateEncrypted = vi.fn();
    const listPendingMessages = vi.fn().mockResolvedValue([]);
    const removePendingMessage = vi.fn();

    await retryPendingMessages(
      { sendPrivate, sendGroup, sendPrivateEncrypted } as never,
      { listPendingMessages, removePendingMessage } as never,
    );

    expect(sendPrivate).not.toHaveBeenCalled();
    expect(sendGroup).not.toHaveBeenCalled();
    expect(removePendingMessage).not.toHaveBeenCalled();
  });
});
