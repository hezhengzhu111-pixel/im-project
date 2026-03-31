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
  getProfile: vi.fn(),
  search: vi.fn(),
};

const messageRepoMock = {
  listConversation: vi.fn(),
  upsertServerMessages: vi.fn(),
  upsertPendingMessage: vi.fn(),
  removePendingMessage: vi.fn(),
  clearConversation: vi.fn(),
};

vi.mock("@/services", () => ({
  messageService: messageServiceMock,
  friendService: friendServiceMock,
  groupService: groupServiceMock,
  userService: userServiceMock,
  fileService: { upload: vi.fn() },
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
    sendMessage: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({
    userId: "1",
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

describe("chat store message ordering & receipts", () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
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
    userServiceMock.getProfile.mockReset();
    userServiceMock.search.mockReset();
    messageRepoMock.listConversation.mockReset();
    messageRepoMock.upsertServerMessages.mockReset();
    messageRepoMock.upsertPendingMessage.mockReset();
    messageRepoMock.removePendingMessage.mockReset();
    messageRepoMock.clearConversation.mockReset();
    messageServiceMock.getPrivateHistoryCursor.mockResolvedValue({
      code: 200,
      data: [],
    });
    messageServiceMock.getGroupHistoryCursor.mockResolvedValue({
      code: 200,
      data: [],
    });
    messageServiceMock.getPrivateHistory.mockResolvedValue({
      code: 200,
      data: [],
    });
    messageServiceMock.getGroupHistory.mockResolvedValue({
      code: 200,
      data: [],
    });
    messageRepoMock.listConversation.mockResolvedValue([]);
    messageRepoMock.upsertServerMessages.mockResolvedValue(undefined);
    messageRepoMock.upsertPendingMessage.mockResolvedValue(undefined);
    messageRepoMock.removePendingMessage.mockResolvedValue(undefined);
    messageRepoMock.clearConversation.mockResolvedValue(undefined);
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

  it("normalizes group message flags from fallback fields", async () => {
    const { normalizeMessageBase } = await import("@/utils/messageNormalize");

    const normalized = normalizeMessageBase({
      id: "g1",
      senderId: "2",
      groupId: "9",
      isGroupMessage: true,
      messageType: "TEXT",
      content: "hello",
      createdTime: "2026-02-07T10:00:00.100000000",
    });

    expect(normalized.groupId).toBe("9");
    expect(normalized.isGroupChat).toBe(true);
    expect(normalized.isGroupMessage).toBe(true);
    expect(normalized.isGroup).toBe(true);
  });

  it("routes group messages into the canonical group session id", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    store.groups = [
      {
        id: "9",
        groupName: "项目群",
        ownerId: "1",
        memberCount: 3,
        createTime: "2026-02-07T10:00:00.000",
      } as any,
    ];

    store.addMessage({
      id: "g1",
      senderId: "2",
      senderName: "u2",
      groupId: "9",
      isGroupMessage: true,
      messageType: "TEXT",
      type: "TEXT",
      content: "群消息",
      sendTime: "2026-02-07T10:00:00.100",
      status: "SENT",
    } as any);

    expect(store.sessions.some((session) => session.id === "group_9")).toBe(true);
    expect(store.messages.get("group_9")?.[0]?.content).toBe("群消息");
  });

  it("opens group chats through the canonical session helper", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();
    const group = {
      id: "9",
      groupName: "项目群",
      avatar: "group.png",
      ownerId: "1",
      memberCount: 8,
      createTime: "2026-02-07T10:00:00.000",
    } as any;

    const first = store.openGroupSession(group);
    const second = store.openGroupSession(group);

    expect(first?.id).toBe("group_9");
    expect(second?.id).toBe("group_9");
    expect(store.sessions.filter((session) => session.id === "group_9")).toHaveLength(1);
    expect(store.currentSession?.id).toBe("group_9");
    expect((store.currentSession as any)?.memberCount).toBe(8);
  });

  it("derives group unread and session details from sessions", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    store.sessions = [
      {
        id: "group_9",
        type: "group",
        targetId: "9",
        targetName: "",
        targetAvatar: "",
        unreadCount: 4,
        lastActiveTime: "2026-02-07T10:00:00.100",
        isPinned: false,
        isMuted: false,
      } as any,
    ];
    groupServiceMock.getList.mockResolvedValue({
      code: 200,
      data: [
        {
          id: "9",
          groupName: "项目群",
          avatar: "group.png",
          ownerId: "1",
          memberCount: 12,
          createTime: "2026-02-07T09:00:00.000",
        },
      ],
    });

    await store.loadGroups();

    expect(store.groups[0]?.unreadCount).toBe(4);
    expect(store.groups[0]?.lastMessageTime).toBe("2026-02-07T10:00:00.100");
    expect(store.sessions[0]?.targetName).toBe("项目群");
    expect(store.sessions[0]?.targetAvatar).toBe("group.png");
    expect(store.sessions[0]?.memberCount).toBe(12);
  });

  it("clears group session state when leaving a group", async () => {
    const { useChatStore } = await import("@/stores/chat");
    const store = useChatStore();

    groupServiceMock.quit.mockResolvedValue({ code: 200 });
    store.groups = [
      {
        id: "9",
        groupName: "项目群",
        ownerId: "1",
        memberCount: 3,
        createTime: "2026-02-07T10:00:00.000",
      } as any,
    ];
    const session = store.openGroupSession(store.groups[0] as any);
    store.messages.set("group_9", [
      {
        id: "g1",
        senderId: "2",
        groupId: "9",
        messageType: "TEXT",
        type: "TEXT",
        content: "群消息",
        sendTime: "2026-02-07T10:00:00.100",
        status: "SENT",
        isGroupChat: true,
      } as any,
    ]);
    store.unreadCounts.set("group_9", 2);
    if (session) {
      session.unreadCount = 2;
    }

    await store.leaveGroup("9");

    expect(store.groups).toHaveLength(0);
    expect(store.sessions.some((item) => item.id === "group_9")).toBe(false);
    expect(store.messages.has("group_9")).toBe(false);
    expect(store.unreadCounts.has("group_9")).toBe(false);
    expect(store.currentSession).toBeNull();
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
        createTime: "2026-02-07T10:00:00.000",
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
          createTime: "2026-02-07T10:00:00.000",
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
    expect(groupServiceMock.addMembers).toHaveBeenCalledWith(
      "9",
      ["2", "3"],
      "1",
    );
    expect(group?.id).toBe("9");
    expect(store.currentSession?.id).toBe("group_9");
    expect(store.currentSession?.targetAvatar).toBe("fresh.png");
    expect((store.currentSession as any)?.memberCount).toBe(3);
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
