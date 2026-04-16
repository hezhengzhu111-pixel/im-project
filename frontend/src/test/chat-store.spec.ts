import {beforeEach, describe, expect, it, vi} from "vitest";
import {createPinia, setActivePinia} from "pinia";

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
};

const refreshOnlineStatusMock = vi.fn();

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
    refreshOnlineStatus: refreshOnlineStatusMock,
  }),
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
    userInfo: {
      id: "1",
      username: "u1",
      nickname: "u1",
    },
    isLoggedIn: true,
    logout: vi.fn(),
  }),
}));

const flushMicrotasks = async (count = 6) => {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
};

describe("chat store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.resetModules();

    messageServiceMock.getPrivateHistoryCursor.mockReset();
    messageServiceMock.getGroupHistoryCursor.mockReset();
    messageServiceMock.getPrivateHistory.mockReset();
    messageServiceMock.getGroupHistory.mockReset();
    messageServiceMock.markRead.mockReset();
    messageServiceMock.sendPrivate.mockReset();
    messageServiceMock.sendGroup.mockReset();
    messageServiceMock.getConversations.mockReset();
    messageServiceMock.getConfig.mockReset();
    friendServiceMock.getList.mockReset();
    friendServiceMock.getRequests.mockReset();
    friendServiceMock.delete.mockReset();
    friendServiceMock.updateRemark.mockReset();
    friendServiceMock.add.mockReset();
    friendServiceMock.handleRequest.mockReset();
    groupServiceMock.getList.mockReset();
    groupServiceMock.create.mockReset();
    groupServiceMock.quit.mockReset();
    userServiceMock.search.mockReset();
    messageRepoMock.listConversation.mockReset();
    messageRepoMock.upsertServerMessages.mockReset();
    messageRepoMock.upsertPendingMessage.mockReset();
    messageRepoMock.removePendingMessage.mockReset();
    messageRepoMock.clearConversation.mockReset();
    refreshOnlineStatusMock.mockReset();

    messageServiceMock.getPrivateHistoryCursor.mockResolvedValue({ code: 200, data: [] });
    messageServiceMock.getGroupHistoryCursor.mockResolvedValue({ code: 200, data: [] });
    messageServiceMock.getPrivateHistory.mockResolvedValue({ code: 200, data: [] });
    messageServiceMock.getGroupHistory.mockResolvedValue({ code: 200, data: [] });
    messageServiceMock.getConversations.mockResolvedValue({ code: 200, data: [] });
    messageServiceMock.getConfig.mockResolvedValue({
      code: 200,
      data: { textEnforce: true, textMaxLength: 2000 },
    });
    friendServiceMock.getList.mockResolvedValue({ code: 200, data: [] });
    friendServiceMock.getRequests.mockResolvedValue({ code: 200, data: [] });
    groupServiceMock.getList.mockResolvedValue({ code: 200, data: [] });
    messageRepoMock.listConversation.mockResolvedValue([]);
    messageRepoMock.upsertServerMessages.mockResolvedValue(undefined);
    messageRepoMock.upsertPendingMessage.mockResolvedValue(undefined);
    messageRepoMock.removePendingMessage.mockResolvedValue(undefined);
    messageRepoMock.clearConversation.mockResolvedValue(undefined);
    refreshOnlineStatusMock.mockResolvedValue({});
  });

  it("sorts private history by send time ascending", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    messageServiceMock.getPrivateHistoryCursor.mockResolvedValue({
      code: 200,
      data: [
        {
          id: "2",
          senderId: "2",
          content: "b",
          status: "SENT",
          sendTime: "2026-02-07T10:00:00.999Z",
          isGroupChat: false,
          messageType: "TEXT",
        },
        {
          id: "1",
          senderId: "1",
          content: "a",
          status: "SENT",
          sendTime: "2026-02-07T10:00:00.100Z",
          isGroupChat: false,
          messageType: "TEXT",
        },
      ],
    });

    await store.loadMessages(session!.id, 0, 20);
    const list = store.messages.get(session!.id) || [];

    expect(list.map((item) => item.content)).toEqual(["a", "b"]);
    expect(list[0].sendTime.includes("2026-02-07T10:00:00.100")).toBe(true);
  });

  it("refreshes friend and private session online statuses after bootstrap", async () => {
    friendServiceMock.getList.mockResolvedValue({
      code: 200,
      data: [
        {
          friendId: "2",
          username: "u2",
          nickname: "u2",
        },
      ],
    });
    messageServiceMock.getConversations.mockResolvedValue({
      code: 200,
      data: [
        {
          conversationId: "1_3",
          conversationType: 1,
          targetId: "3",
          conversationName: "u3",
          unreadCount: 0,
        },
      ],
    });

    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    await store.initChatBootstrap();
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushMicrotasks();

    expect(refreshOnlineStatusMock).toHaveBeenCalledWith(
      expect.arrayContaining(["2", "3"]),
    );
  });

  it("keeps bootstrap resilient when the initial conversation load fails", async () => {
    messageServiceMock.getConversations
      .mockRejectedValueOnce(new Error("conversation bootstrap failed"))
      .mockResolvedValue({
        code: 200,
        data: [],
      });
    friendServiceMock.getList.mockResolvedValue({
      code: 200,
      data: [
        {
          friendId: "2",
          username: "u2",
          nickname: "u2",
        },
      ],
    });
    groupServiceMock.getList.mockResolvedValue({
      code: 200,
      data: [
        {
          id: "9",
          groupName: "project",
          ownerId: "1",
          memberCount: 3,
          createTime: "2026-02-07T10:00:00.000Z",
        },
      ],
    });

    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    await expect(store.initChatBootstrap()).resolves.toBeUndefined();
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushMicrotasks();

    expect(friendServiceMock.getList).toHaveBeenCalled();
    expect(groupServiceMock.getList).toHaveBeenCalled();
    expect(store.friends).toHaveLength(1);
    expect(store.groups).toHaveLength(1);
  });

  it("loads older history with the oldest loaded server message id as cursor", async () => {
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
        content: "latest",
        sendTime: "2026-02-07T10:00:01.000Z",
        status: "SENT",
      },
      {
        id: "101",
        senderId: "2",
        receiverId: "1",
        isGroupChat: false,
        messageType: "TEXT",
        content: "latest-2",
        sendTime: "2026-02-07T10:00:02.000Z",
        status: "SENT",
      },
    ]);
    messageServiceMock.getPrivateHistoryCursor.mockResolvedValueOnce({
      code: 200,
      data: [
        {
          id: "98",
          senderId: "2",
          receiverId: "1",
          isGroupChat: false,
          messageType: "TEXT",
          content: "older-1",
          sendTime: "2026-02-07T09:59:58.000Z",
          status: "SENT",
        },
        {
          id: "99",
          senderId: "1",
          receiverId: "2",
          isGroupChat: false,
          messageType: "TEXT",
          content: "older-2",
          sendTime: "2026-02-07T09:59:59.000Z",
          status: "SENT",
        },
      ],
    });

    await store.loadMoreHistory(session!.id, 2);

    expect(messageServiceMock.getPrivateHistoryCursor).toHaveBeenCalledWith(
      "2",
      expect.objectContaining({
        limit: 2,
        last_message_id: "100",
      }),
    );
    expect(store.messages.get(session!.id)?.map((item) => item.id)).toEqual([
      "98",
      "99",
      "100",
      "101",
    ]);
    expect(store.oldestLoadedServerMessageIdBySession.get(session!.id)).toBe("98");
  });

  it("falls back to page history loading when cursor history fails", async () => {
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
        content: "latest",
        sendTime: "2026-02-07T10:00:01.000Z",
        status: "SENT",
      },
    ]);
    messageServiceMock.getPrivateHistoryCursor.mockRejectedValueOnce(
      new Error("cursor unavailable"),
    );
    messageServiceMock.getPrivateHistory.mockResolvedValueOnce({
      code: 200,
      data: [
        {
          id: "99",
          senderId: "2",
          receiverId: "1",
          isGroupChat: false,
          messageType: "TEXT",
          content: "fallback older",
          sendTime: "2026-02-07T09:59:59.000Z",
          status: "SENT",
        },
      ],
    });

    await store.loadMoreHistory(session!.id, 20);

    expect(messageServiceMock.getPrivateHistory).toHaveBeenCalledWith("2", {
      page: 1,
      size: 20,
    });
    expect(store.messages.get(session!.id)?.map((item) => item.id)).toEqual([
      "99",
      "100",
    ]);
  });

  it("applies read receipt to outgoing messages", async () => {
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

    await store.applyReadReceipt({
      readerId: "2",
      lastReadMessageId: "150",
      readAt: "2026-02-07T10:00:01.000Z",
    });
    await flushMicrotasks();

    const list = store.messages.get(session!.id) || [];
    expect(list.find((item) => item.id === "100")?.status).toBe("READ");
    expect(list.find((item) => item.id === "200")?.status).toBe("SENT");
    expect(messageRepoMock.upsertServerMessages).toHaveBeenCalledWith(
      session!.id,
      [
        expect.objectContaining({
          id: "100",
          status: "READ",
        }),
      ],
    );
  });

  it("reuses in-flight session refreshes instead of refetching conversations", async () => {
    let resolveConversations: ((value: unknown) => void) | undefined;
    messageServiceMock.getConversations.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConversations = resolve;
        }),
    );

    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const first = store.refreshSessionSkeletons({force: true, refreshPresence: false});
    const second = store.refreshSessionSkeletons({force: true, refreshPresence: false});
    await flushMicrotasks(1);

    expect(messageServiceMock.getConversations).toHaveBeenCalledTimes(1);

    resolveConversations?.({
      code: 200,
      data: [],
    });

    await Promise.all([first, second]);
  });

  it("routes group messages into the canonical group session id", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    await store.addMessage({
      id: "g1",
      senderId: "2",
      senderName: "u2",
      groupId: "9",
      groupName: "项目群",
      isGroupChat: true,
      messageType: "TEXT",
      content: "群消息",
      sendTime: "2026-02-07T10:00:00.100Z",
      status: "SENT",
    });

    expect(store.sessions.some((session) => session.id === "group_9")).toBe(true);
    expect(store.messages.get("group_9")?.[0]?.content).toBe("群消息");
  });

  it("opens group chats through the canonical helper and avoids duplicates", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();
    const group = {
      id: "9",
      groupName: "项目群",
      avatar: "group.png",
      ownerId: "1",
      memberCount: 8,
      createTime: "2026-02-07T10:00:00.000Z",
    };

    const first = await store.openGroupSession(group);
    const second = await store.openGroupSession(group);

    expect(first?.id).toBe("group_9");
    expect(second?.id).toBe("group_9");
    expect(store.sessions.filter((session) => session.id === "group_9")).toHaveLength(1);
    expect(store.currentSession?.id).toBe("group_9");
    expect(store.currentSession?.memberCount).toBe(8);
  });

  it("exposes currentSessionId through the chat facade", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(session!);

    expect(store.currentSessionId).toBe(session!.id);
  });

  it("sorts pinned sessions before newer unpinned sessions", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const first = store.createOrGetSession("private", "2", "u2", "");
    const second = store.createOrGetSession("private", "3", "u3", "");

    store.sessions.find((item) => item.id === first!.id)!.lastActiveTime =
      "2026-02-07T10:00:00.000Z";
    store.sessions.find((item) => item.id === second!.id)!.lastActiveTime =
      "2026-02-07T11:00:00.000Z";

    store.toggleSessionPinned(first!.id, true);

    expect(store.sortedSessions.map((item) => item.id)).toEqual([
      first!.id,
      second!.id,
    ]);
    expect(store.sessions.find((item) => item.id === first!.id)?.isPinned).toBe(true);
  });

  it("toggles session mute locally and removes sessions without dropping cached messages", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(session!);
    store.messages.set(session!.id, [
      {
        id: "100",
        senderId: "1",
        receiverId: "2",
        isGroupChat: false,
        messageType: "TEXT",
        content: "cached",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
    ]);
    store.hasMoreHistoryBySession.set(session!.id, true);

    store.toggleSessionMuted(session!.id);
    expect(store.sessions.find((item) => item.id === session!.id)?.isMuted).toBe(true);
    expect(store.currentSession?.muted).toBe(true);

    store.deleteSession(session!.id);

    expect(store.sessions.some((item) => item.id === session!.id)).toBe(false);
    expect(store.currentSession).toBeNull();
    expect(store.messages.get(session!.id)?.map((item) => item.id)).toEqual(["100"]);
    expect(store.hasMoreHistoryBySession.has(session!.id)).toBe(false);
  });

  it("marks private sessions as read with the backend target user id", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    await store.markAsRead(session!.id);

    expect(messageServiceMock.markRead).toHaveBeenCalledWith("2");
  });

  it("marks group sessions as read with the backend group conversation id", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("group", "9", "项目群", "");
    await store.markAsRead(session!.id);

    expect(messageServiceMock.markRead).toHaveBeenCalledWith("group_9");
  });

  it("clears group session state when leaving a group", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    groupServiceMock.quit.mockResolvedValue({ code: 200 });
    const group = {
      id: "9",
      groupName: "项目群",
      ownerId: "1",
      memberCount: 3,
      createTime: "2026-02-07T10:00:00.000Z",
    };

    await store.openGroupSession(group);
    store.messages.set("group_9", [
      {
        id: "g1",
        senderId: "2",
        groupId: "9",
        isGroupChat: true,
        messageType: "TEXT",
        content: "群消息",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
      },
    ]);

    await store.leaveGroup("9");

    expect(store.sessions.some((item) => item.id === "group_9")).toBe(false);
    expect(store.messages.get("group_9")).toEqual([]);
    expect(messageRepoMock.clearConversation).toHaveBeenCalledWith("group_9");
  });

  it("keeps cleared conversation empty across reloads until new messages arrive", async () => {
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

    expect(store.messages.get(session!.id)?.map((item) => item.id)).toEqual(["101"]);
  });

  it("passes avatar through createGroup and opens the refreshed group session", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    groupServiceMock.create.mockResolvedValue({
      code: 200,
      data: {
        id: "9",
        groupName: "项目群",
        avatar: "create.png",
        ownerId: "1",
        memberCount: 1,
        createTime: "2026-02-07T10:00:00.000Z",
      },
    });
    groupServiceMock.getList.mockResolvedValue({
      code: 200,
      data: [
        {
          id: "9",
          groupName: "项目群",
          avatar: "fresh.png",
          ownerId: "1",
          memberCount: 3,
          createTime: "2026-02-07T10:00:00.000Z",
        },
      ],
    });
    messageServiceMock.getConversations.mockResolvedValue({
      code: 200,
      data: [
        {
          conversationId: "9",
          conversationType: 2,
          conversationName: "项目群",
          conversationAvatar: "fresh.png",
          unreadCount: 0,
          lastMessageTime: "2026-02-07T10:00:00.100000000",
        },
      ],
    });

    const group = await store.createGroup({
      name: "项目群",
      description: "desc",
      avatar: "upload.png",
      memberIds: ["2", "3"],
    });

    expect(groupServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar: "upload.png",
      }),
    );
    expect(groupServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        memberIds: ["2", "3"],
      }),
    );
    expect(group?.id).toBe("9");
    expect(store.currentSession?.id).toBe("group_9");
    expect(store.currentSession?.targetAvatar).toBe("fresh.png");
  });

  it("splits long text into multiple messages when config enforces max length", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(session!);
    const longText = "你".repeat(4500);

    messageServiceMock.sendPrivate
      .mockResolvedValueOnce({
        code: 200,
        data: {
          id: "s1",
          senderId: "1",
          receiverId: "2",
          messageType: "TEXT",
          content: "x",
          sendTime: "2026-02-07T10:00:00.100Z",
          status: "SENT",
          isGroupChat: false,
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: {
          id: "s2",
          senderId: "1",
          receiverId: "2",
          messageType: "TEXT",
          content: "y",
          sendTime: "2026-02-07T10:00:00.200Z",
          status: "SENT",
          isGroupChat: false,
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: {
          id: "s3",
          senderId: "1",
          receiverId: "2",
          messageType: "TEXT",
          content: "z",
          sendTime: "2026-02-07T10:00:00.300Z",
          status: "SENT",
          isGroupChat: false,
        },
      });

    const ok = await store.sendMessage(longText, "TEXT");

    expect(ok).toBe(true);
    expect(messageServiceMock.getConfig).toHaveBeenCalledTimes(1);
    expect(messageServiceMock.sendPrivate).toHaveBeenCalledTimes(3);
    expect(messageServiceMock.sendPrivate.mock.calls[0][0].content.length).toBe(2000);
    expect(messageServiceMock.sendPrivate.mock.calls[1][0].content.length).toBe(2000);
    expect(messageServiceMock.sendPrivate.mock.calls[2][0].content.length).toBe(500);
  });

  it("does not split long text when text enforcement is disabled", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    messageServiceMock.getConfig.mockResolvedValue({
      code: 200,
      data: { textEnforce: false, textMaxLength: 2000 },
    });
    messageServiceMock.sendPrivate.mockResolvedValueOnce({
      code: 200,
      data: {
        id: "s1",
        senderId: "1",
        receiverId: "2",
        messageType: "TEXT",
        content: "z",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
        isGroupChat: false,
      },
    });

    const session = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(session!);
    const longText = "你".repeat(4500);
    const ok = await store.sendMessage(longText, "TEXT");

    expect(ok).toBe(true);
    expect(messageServiceMock.sendPrivate).toHaveBeenCalledTimes(1);
    expect(messageServiceMock.sendPrivate.mock.calls[0][0].content.length).toBe(4500);
  });

  it("serializes sends within the same session through a promise queue", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const session = store.createOrGetSession("private", "2", "u2", "");
    await store.setCurrentSession(session!);

    let resolveFirst: ((value: unknown) => void) | undefined;
    messageServiceMock.sendPrivate
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        code: 200,
        data: {
          id: "102",
          senderId: "1",
          receiverId: "2",
          messageType: "TEXT",
          content: "second",
          sendTime: "2026-02-07T10:00:00.200Z",
          status: "SENT",
          isGroupChat: false,
        },
      });

    const firstSend = store.sendMessage("first", "TEXT");
    const secondSend = store.sendMessage("second", "TEXT");
    await flushMicrotasks();

    expect(messageServiceMock.sendPrivate).toHaveBeenCalledTimes(1);
    expect(messageServiceMock.sendPrivate.mock.calls[0][0].content).toBe("first");

    resolveFirst?.({
      code: 200,
      data: {
        id: "101",
        senderId: "1",
        receiverId: "2",
        messageType: "TEXT",
        content: "first",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
        isGroupChat: false,
      },
    });

    await firstSend;
    await secondSend;

    expect(messageServiceMock.sendPrivate).toHaveBeenCalledTimes(2);
    expect(messageServiceMock.sendPrivate.mock.calls[1][0].content).toBe("second");
  });

  it("keeps sends across different sessions parallel", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const { useMessageStore } = await import("@/stores/message");
    const store = useChatStore();
    const messageStore = useMessageStore();

    const firstSession = store.createOrGetSession("private", "2", "u2", "");
    const secondSession = store.createOrGetSession("private", "3", "u3", "");

    let resolveFirst: ((value: unknown) => void) | undefined;
    let resolveSecond: ((value: unknown) => void) | undefined;
    messageServiceMock.sendPrivate
      .mockImplementationOnce(
        ({ receiverId }) =>
          new Promise((resolve) => {
            resolveFirst = resolve;
            expect(receiverId).toBe("2");
          }),
      )
      .mockImplementationOnce(
        ({ receiverId }) =>
          new Promise((resolve) => {
            resolveSecond = resolve;
            expect(receiverId).toBe("3");
          }),
      );

    const sendFirst = messageStore.sendMessage(firstSession!, "first", "TEXT");
    const sendSecond = messageStore.sendMessage(secondSession!, "second", "TEXT");
    await flushMicrotasks();

    expect(messageServiceMock.sendPrivate).toHaveBeenCalledTimes(2);

    resolveFirst?.({
      code: 200,
      data: {
        id: "201",
        senderId: "1",
        receiverId: "2",
        messageType: "TEXT",
        content: "first",
        sendTime: "2026-02-07T10:00:00.100Z",
        status: "SENT",
        isGroupChat: false,
      },
    });
    resolveSecond?.({
      code: 200,
      data: {
        id: "202",
        senderId: "1",
        receiverId: "3",
        messageType: "TEXT",
        content: "second",
        sendTime: "2026-02-07T10:00:00.200Z",
        status: "SENT",
        isGroupChat: false,
      },
    });

    await Promise.all([sendFirst, sendSecond]);
  });

  it("syncs the current session first and then unread sessions in batches", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    const currentSession = store.createOrGetSession("private", "2", "u2", "");
    const unreadOne = store.createOrGetSession("private", "3", "u3", "");
    const unreadTwo = store.createOrGetSession("private", "4", "u4", "");
    const unreadThree = store.createOrGetSession("private", "5", "u5", "");

    await store.setCurrentSession(currentSession!);
    store.sessions.find((item) => item.id === unreadOne!.id)!.unreadCount = 1;
    store.sessions.find((item) => item.id === unreadTwo!.id)!.unreadCount = 2;
    store.sessions.find((item) => item.id === unreadThree!.id)!.unreadCount = 3;

    const started: string[] = [];
    messageServiceMock.getPrivateHistoryCursor.mockImplementation(async (targetId: string) => {
      started.push(targetId);
      return {
        code: 200,
        data: [],
      };
    });

    await store.syncOfflineMessages({
      refreshSessions: false,
      batchSize: 2,
      batchDelayMs: 0,
      loadSize: 20,
    });

    expect(started).toEqual(["2", "3", "4", "5"]);
  });
});
