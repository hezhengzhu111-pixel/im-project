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
  addMembers: vi.fn(),
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
    groupServiceMock.addMembers.mockReset();
    groupServiceMock.quit.mockReset();
    userServiceMock.search.mockReset();
    messageRepoMock.listConversation.mockReset();
    messageRepoMock.upsertServerMessages.mockReset();
    messageRepoMock.upsertPendingMessage.mockReset();
    messageRepoMock.removePendingMessage.mockReset();
    messageRepoMock.clearConversation.mockReset();

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

    const list = store.messages.get(session!.id) || [];
    expect(list.find((item) => item.id === "100")?.status).toBe("READ");
    expect(list.find((item) => item.id === "200")?.status).toBe("SENT");
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
    groupServiceMock.addMembers.mockResolvedValue({ code: 200 });
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
    expect(groupServiceMock.addMembers).toHaveBeenCalledWith("9", ["2", "3"], "1");
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
});
