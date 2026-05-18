import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// Mock all external dependencies
const mockRouter = { push: vi.fn() };
vi.mock("vue-router", () => ({
  useRoute: vi.fn(() => ({ path: "/chat" })),
  useRouter: vi.fn(() => mockRouter),
}));

vi.mock("element-plus", () => ({
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue(undefined),
  },
  ElMessage: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/services/ai", () => ({
  aiService: {
    getSettings: vi.fn().mockResolvedValue({
      code: 200,
      data: { autoReplyEnabled: false },
    }),
    updateSettings: vi.fn().mockResolvedValue({ code: 200 }),
  },
}));

vi.mock("@/services/group", () => ({
  groupService: {
    getMembers: vi.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          userId: "3",
          username: "u3",
          nickname: "u3",
          avatar: "",
          role: 1,
        },
      ],
    }),
  },
}));

vi.mock("@/services/message", () => ({
  messageService: {
    getPrivateHistoryCursor: vi.fn().mockResolvedValue({
      code: 200,
      data: [],
    }),
    getGroupHistoryCursor: vi.fn().mockResolvedValue({
      code: 200,
      data: [],
    }),
    markRead: vi.fn().mockResolvedValue({ code: 200 }),
    getConfig: vi.fn().mockResolvedValue({
      code: 200,
      data: { textEnforce: true, textMaxLength: 2000 },
    }),
  },
}));

vi.mock("@/utils/messageRepo", () => ({
  messageRepo: {
    listConversation: vi.fn().mockResolvedValue([]),
    upsertServerMessages: vi.fn(),
    upsertPendingMessage: vi.fn(),
    removePendingMessage: vi.fn(),
    clearConversation: vi.fn(),
  },
}));

const chatStoreMock = {
  currentSession: null as Record<string, unknown> | null,
  sessions: [] as unknown[],
  friends: [] as Array<Record<string, unknown>>,
  groups: [] as unknown[],
  messages: new Map<string, unknown[]>(),
  currentMessages: [] as unknown[],
  friendRequests: [] as Array<Record<string, unknown>>,
  loadingHistoryBySession: new Map<string, boolean>(),
  hasMoreHistoryBySession: new Map<string, boolean>(),
  unreadCounts: new Map<string, number>(),
  totalUnreadCount: 0,
  currentSessionId: null as string | null,
  sortedSessions: [] as unknown[],
  initChatBootstrap: vi.fn().mockResolvedValue(undefined),
  setCurrentSession: vi.fn().mockResolvedValue(undefined),
  markAsRead: vi.fn().mockResolvedValue(undefined),
  loadMessages: vi.fn().mockResolvedValue(undefined),
  loadMoreHistory: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(true),
  openPrivateSession: vi.fn().mockResolvedValue(undefined),
  openGroupSession: vi.fn().mockResolvedValue(undefined),
  searchMessages: vi.fn().mockResolvedValue(undefined),
  toggleSessionPinned: vi.fn(),
  toggleSessionMuted: vi.fn(),
  clearMessages: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn(),
  createOrGetSession: vi.fn().mockReturnValue({
    id: "1_2",
    type: "private",
    targetId: "2",
    targetName: "u2",
    unreadCount: 0,
  }),
};

vi.mock("@/stores/chat", () => ({
  useChatStore: () => chatStoreMock,
}));

const webSocketStoreMock = {
  isUserOnline: vi.fn().mockReturnValue(false),
  refreshOnlineStatus: vi.fn().mockResolvedValue({}),
  connectionStatus: "connected",
};

vi.mock("@/stores/websocket", () => ({
  useWebSocketStore: () => webSocketStoreMock,
}));

vi.mock("@/stores/moments", () => ({
  useMomentsStore: () => ({
    unreadCount: 0,
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

vi.mock("@/stores/i18n", () => ({
  useI18nStore: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useErrorHandler", () => ({
  useErrorHandler: () => ({
    capture: vi.fn(),
    notifyInfo: vi.fn(),
    notifySuccess: vi.fn(),
  }),
}));

vi.mock("@/utils/common", () => ({
  getAvatarText: (name?: string) => (name ? name.charAt(0).toUpperCase() : "?"),
}));

// Mock the e2ee modules
vi.mock("@/features/e2ee/manager/negotiation", () => ({
  getLocalSessionStatus: vi.fn(() => "plaintext"),
  getPendingInitialHandshake: vi.fn(() => null),
  clearPendingInitialHandshake: vi.fn(),
}));

vi.mock("@/features/e2ee/manager/e2ee-manager", () => ({
  e2eeManager: {
    encryptMessage: vi.fn(),
    getSessionStatus: vi.fn(() => "plaintext"),
  },
}));

// Mock vue lifecycle hooks for composable testing
vi.mock("vue", async () => {
  const actual = await vi.importActual("vue");
  return {
    ...actual,
    onMounted: vi.fn(),
    onUnmounted: vi.fn(),
  };
});

describe("useChatPage", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.classList.remove("theme-dark");
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("returns initial UI state with default values", async () => {
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.activeTab.value).toBe("chat");
    expect(page.showAddFriend.value).toBe(false);
    expect(page.showCreateGroup.value).toBe(false);
    expect(page.showGroupReadDialog.value).toBe(false);
    expect(page.showSearchDialog.value).toBe(false);
    expect(page.showSessionInfoDrawer.value).toBe(false);
    expect(page.showDetailPanel.value).toBe(false);
    expect(page.showSecurityPanel.value).toBe(false);
    expect(page.isDarkTheme.value).toBe(false);
    expect(page.autoReplyEnabled.value).toBe(false);
    expect(page.composerMembers.value).toEqual([]);
    expect(page.groupReadUsers.value).toEqual([]);
    expect(page.sessionInfoLoading.value).toBe(false);
    expect(page.sessionInfoError.value).toBe("");
  });

  it("formatDetailTime returns formatted date string", async () => {
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    const result = page.formatDetailTime("2026-05-18T14:30:00.000Z");
    expect(result).toMatch(/\d{2}\/\d{2}\s\d{2}:\d{2}/);
  });

  it("formatDetailTime returns empty string for invalid input", async () => {
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.formatDetailTime("")).toBe("");
    expect(page.formatDetailTime("invalid-date")).toBe("");
    expect(page.formatDetailTime(undefined)).toBe("");
  });

  it("handleTabChange sets active tab for chat/contacts/groups", async () => {
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.activeTab.value).toBe("chat");

    page.handleTabChange("contacts");
    expect(page.activeTab.value).toBe("contacts");

    page.handleTabChange("groups");
    expect(page.activeTab.value).toBe("groups");

    page.handleTabChange("chat");
    expect(page.activeTab.value).toBe("chat");
  });

  it("handleTabChange with 'moments' navigates via router", async () => {
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    page.handleTabChange("moments");
    expect(mockRouter.push).toHaveBeenCalledWith("/moments");
    // activeTab should not change for moments
    expect(page.activeTab.value).toBe("chat");
  });

  it("toggleTheme toggles dark mode and persists to localStorage", async () => {
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.isDarkTheme.value).toBe(false);
    expect(document.body.classList.contains("theme-dark")).toBe(false);

    page.toggleTheme();

    expect(page.isDarkTheme.value).toBe(true);
    expect(document.body.classList.contains("theme-dark")).toBe(true);
    expect(localStorage.getItem("im_theme")).toBe("dark");

    page.toggleTheme();

    expect(page.isDarkTheme.value).toBe(false);
    expect(document.body.classList.contains("theme-dark")).toBe(false);
    expect(localStorage.getItem("im_theme")).toBe("light");
  });

  it("currentSessionOnline returns false for group sessions", async () => {
    // Set current session as group
    const testSession = {
      id: "group_9",
      type: "group" as const,
      targetId: "9",
      targetName: "项目群",
    };
    chatStoreMock.currentSession = testSession;

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.currentSessionOnline.value).toBe(false);
  });

  it("selectSession marks session as read", async () => {
    const session = {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
      unreadCount: 3,
    };
    chatStoreMock.currentSession = session;

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.selectSession(session);

    expect(chatStoreMock.markAsRead).toHaveBeenCalledWith("1_2");
  });

  it("selectSession re-reads same session when it is already current", async () => {
    const session = {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
      unreadCount: 3,
    };
    chatStoreMock.currentSession = session;

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.selectSession(session);

    // Should call markAsRead
    expect(chatStoreMock.markAsRead).toHaveBeenCalled();
  });

  it("selectSession changes session and marks as read", async () => {
    const newSession = {
      id: "1_3",
      type: "private" as const,
      targetId: "3",
      targetName: "u3",
      unreadCount: 5,
    };
    const oldSession = {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
      unreadCount: 0,
    };
    chatStoreMock.currentSession = oldSession;

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.selectSession(newSession);

    // Should set current session and mark as read
    expect(chatStoreMock.setCurrentSession).toHaveBeenCalledWith(newSession);
    expect(chatStoreMock.markAsRead).toHaveBeenCalledWith("1_3");
  });

  it("sendTextMessage delegates to chatStore", async () => {
    chatStoreMock.currentSession = {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
    };

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.sendTextMessage("Hello, world!");

    expect(chatStoreMock.sendMessage).toHaveBeenCalledWith(
      "Hello, world!",
      "TEXT",
      undefined,
      undefined
    );
  });

  it("sendTextMessage passes mentionedUserIds when provided", async () => {
    chatStoreMock.currentSession = {
      id: "group_9",
      type: "group" as const,
      targetId: "9",
      targetName: "项目群",
    };

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.sendTextMessage("Hello @u3", ["3"]);

    expect(chatStoreMock.sendMessage).toHaveBeenCalledWith(
      "Hello @u3",
      "TEXT",
      undefined,
      ["3"]
    );
  });

  it("sendMediaMessage delegates to chatStore with type and extra", async () => {
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.sendMediaMessage({
      type: "IMAGE",
      url: "https://example.com/image.jpg",
      extra: { width: 800, height: 600 },
    });

    expect(chatStoreMock.sendMessage).toHaveBeenCalledWith(
      "https://example.com/image.jpg",
      "IMAGE",
      { width: 800, height: 600 }
    );
  });

  it("fetchAutoReplyStatus is called on mount", async () => {
    const { onMounted } = await import("vue");
    const { aiService } = await import("@/services/ai");
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    useChatPage(); // Must call useChatPage() to trigger onMounted

    expect(onMounted).toHaveBeenCalledWith(expect.any(Function));
    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    expect(aiService.getSettings).toHaveBeenCalled();
  });

  it("toggleAutoReply toggles state and updates settings", async () => {
    const { aiService } = await import("@/services/ai");

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.autoReplyEnabled.value).toBe(false);

    await page.toggleAutoReply();

    expect(aiService.updateSettings).toHaveBeenCalledWith({
      autoReplyEnabled: true,
    });
    expect(page.autoReplyEnabled.value).toBe(true);

    await page.toggleAutoReply();
    expect(aiService.updateSettings).toHaveBeenCalledWith({
      autoReplyEnabled: false,
    });
    expect(page.autoReplyEnabled.value).toBe(false);
  });

  it("pends selected session unread count snapshot when selecting", async () => {
    const session = {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
      unreadCount: 5,
    };
    chatStoreMock.currentSession = null;

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.selectSession(session);

    expect(page.unreadSnapshotBySession.value.get("1_2")).toBe(5);
  });

  it("loadMoreHistory skips when already loading", async () => {
    chatStoreMock.currentSession = {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
    };
    chatStoreMock.loadingHistoryBySession.set("1_2", true);

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.loadMoreHistory();

    expect(chatStoreMock.loadMoreHistory).not.toHaveBeenCalled();
  });

  it("loadMoreHistory delegates to chatStore when conditions are met", async () => {
    chatStoreMock.currentSession = {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
    };
    chatStoreMock.loadingHistoryBySession.set("1_2", false);
    chatStoreMock.hasMoreHistoryBySession.set("1_2", true);

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    await page.loadMoreHistory();

    expect(chatStoreMock.loadMoreHistory).toHaveBeenCalledWith("1_2");
  });

  it("registers focus event listener on mount", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const { onMounted } = await import("vue");
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    useChatPage(); // Must call useChatPage() to trigger onMounted

    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "focus",
      expect.any(Function)
    );
  });

  it("removes focus event listener on unmount", async () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { onUnmounted } = await import("vue");
    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    useChatPage(); // Must call useChatPage() to trigger onUnmounted registration

    expect(onUnmounted).toHaveBeenCalledWith(expect.any(Function));
    const cleanupFn = (onUnmounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    cleanupFn();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "focus",
      expect.any(Function)
    );
  });

  it("pendingRequestsCount counts PENDING friend requests", async () => {
    chatStoreMock.friendRequests = [
      { status: "PENDING", id: "1" },
      { status: "ACCEPTED", id: "2" },
      { status: "PENDING", id: "3" },
    ];

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.pendingRequestsCount.value).toBe(2);
  });

  it("sessionInfoFriend finds matching friend for private session", async () => {
    chatStoreMock.currentSession = {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
    };
    chatStoreMock.friends = [
      {
        friendId: "2",
        username: "u2",
        nickname: "User 2",
        remark: "",
        avatar: "avatar.png",
      },
      {
        friendId: "3",
        username: "u3",
        nickname: "User 3",
        remark: "",
        avatar: "",
      },
    ];

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.sessionInfoFriend.value).toEqual(
      expect.objectContaining({ friendId: "2" })
    );
  });

  it("sessionInfoFriend returns null for non-private session", async () => {
    chatStoreMock.currentSession = {
      id: "group_9",
      type: "group" as const,
      targetId: "9",
      targetName: "项目群",
    };

    const { useChatPage } = await import(
      "@/features/chat/composables/useChatPage"
    );
    const page = useChatPage();

    expect(page.sessionInfoFriend.value).toBeNull();
  });
});
