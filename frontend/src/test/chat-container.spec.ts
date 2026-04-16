import {nextTick} from "vue";
import {shallowMount} from "@vue/test-utils";
import {beforeEach, describe, expect, it, vi} from "vitest";
import ChatContainer from "@/features/chat/ChatContainer.vue";

const {
  confirmMock,
  getMembersMock,
  chatStoreState,
} = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  getMembersMock: vi.fn(),
  chatStoreState: {
    currentSession: {
      id: "1_2",
      type: "private" as const,
      targetId: "2",
      targetName: "u2",
      targetAvatar: "",
      unreadCount: 0,
      lastActiveTime: "",
      isPinned: false,
      pinned: false,
      isMuted: false,
      muted: false,
    },
    sortedSessions: [] as unknown[],
    totalUnreadCount: 0,
    friendRequests: [] as Array<{ status: string }>,
    friends: [
      {
        friendId: "2",
        username: "u2",
        nickname: "u2",
        remark: "Teammate",
        avatar: "",
      },
    ],
    groups: [
      {
        id: "9",
        groupName: "Project",
        avatar: "",
        ownerId: "1",
        memberCount: 3,
        createTime: "2026-04-16T10:00:00.000Z",
      },
    ],
    currentMessages: [],
    searchResults: [],
    loadingHistoryBySession: new Map<string, boolean>(),
    hasMoreHistoryBySession: new Map<string, boolean>(),
    toggleSessionPinned: vi.fn(),
    toggleSessionMuted: vi.fn(),
    deleteSession: vi.fn(),
    clearMessages: vi.fn(),
    searchMessages: vi.fn().mockResolvedValue(undefined),
    loadMoreHistory: vi.fn().mockResolvedValue(undefined),
    clearCurrentSession: vi.fn(),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    setCurrentSession: vi.fn().mockResolvedValue(undefined),
    openPrivateSession: vi.fn().mockResolvedValue(null),
    openGroupSession: vi.fn().mockResolvedValue(null),
    sendMessage: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("element-plus", () => ({
  ElMessageBox: {
    confirm: confirmMock,
  },
  ElIcon: {
    name: "ElIcon",
    template: "<i class='el-icon-stub'><slot /></i>",
  },
  ElButton: {
    name: "ElButton",
    template: "<button class='el-button-stub'><slot /></button>",
  },
  ElDropdown: {
    name: "ElDropdown",
    template: "<div class='el-dropdown-stub'><slot /><slot name='dropdown' /></div>",
  },
  ElDropdownMenu: {
    name: "ElDropdownMenu",
    template: "<div class='el-dropdown-menu-stub'><slot /></div>",
  },
  ElDropdownItem: {
    name: "ElDropdownItem",
    props: ["command"],
    template: "<button class='dropdown-item' :data-command='command'><slot /></button>",
  },
}));

vi.mock("@/stores/chat", () => ({
  useChatStore: () => chatStoreState,
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({
    userId: "1",
    userInfo: {
      username: "me",
      nickname: "me",
    },
    nickname: "me",
    avatar: "",
  }),
}));

vi.mock("@/stores/websocket", () => ({
  useWebSocketStore: () => ({
    connectionStatus: "connected",
    isUserOnline: vi.fn().mockReturnValue(true),
  }),
}));

vi.mock("@/services/group", () => ({
  groupService: {
    getMembers: getMembersMock,
  },
}));

const flush = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

const mountContainer = () =>
  shallowMount(ChatContainer, {
    global: {
      mocks: {
        $router: {
          push: vi.fn(),
        },
      },
      stubs: {
        ChatSidebarPanel: {
          name: "ChatSidebarPanel",
          template: "<div class='chat-sidebar-panel-stub' />",
        },
        ChatMessageList: {
          name: "ChatMessageList",
          template: "<div class='chat-message-list-stub' />",
        },
        ChatComposer: {
          name: "ChatComposer",
          template: "<div class='chat-composer-stub' />",
        },
        ChatDialogs: {
          name: "ChatDialogs",
          props: [
            "visibleAddFriend",
            "visibleCreateGroup",
            "visibleGroupReadDialog",
            "visibleSearchDialog",
            "visibleSessionInfoDrawer",
            "currentSession",
            "groupReadUsers",
            "searchResults",
            "sessionInfoFriend",
            "sessionInfoGroup",
            "sessionInfoMembers",
            "sessionInfoLoading",
            "sessionInfoError",
            "privateSessionOnline",
          ],
          template: "<div class='chat-dialogs-stub' />",
        },
        ElDropdown: {
          name: "ElDropdown",
          emits: ["command"],
          template: "<div class='el-dropdown-stub'><slot /><slot name='dropdown' /></div>",
        },
        ElDropdownMenu: {
          name: "ElDropdownMenu",
          template: "<div class='el-dropdown-menu-stub'><slot /></div>",
        },
        ElDropdownItem: {
          name: "ElDropdownItem",
          props: ["command"],
          template:
            "<button class='dropdown-item' :data-command='command'><slot /></button>",
        },
        ElButton: {
          name: "ElButton",
          template: "<button class='el-button-stub'><slot /></button>",
        },
        ElIcon: {
          name: "ElIcon",
          template: "<i class='el-icon-stub'><slot /></i>",
        },
      },
    },
  });

describe("ChatContainer", () => {
  beforeEach(() => {
    confirmMock.mockReset().mockResolvedValue(undefined);
    getMembersMock.mockReset().mockResolvedValue({
      code: 200,
      data: [],
    });
    chatStoreState.currentSession = {
      id: "1_2",
      type: "private",
      targetId: "2",
      targetName: "u2",
      targetAvatar: "",
      unreadCount: 0,
      lastActiveTime: "",
      isPinned: false,
      pinned: false,
      isMuted: false,
      muted: false,
    };
    chatStoreState.toggleSessionPinned.mockReset();
    chatStoreState.toggleSessionMuted.mockReset();
    chatStoreState.deleteSession.mockReset();
    chatStoreState.clearMessages.mockReset().mockResolvedValue(undefined);
    chatStoreState.searchMessages.mockClear();
  });

  it("renders the full session action menu and opens the search dialog", async () => {
    const wrapper = mountContainer();

    const commands = wrapper
      .findAll(".dropdown-item")
      .map((item) => item.attributes("data-command"));

    expect(commands).toEqual([
      "search-messages",
      "toggle-pin",
      "toggle-mute",
      "open-session-info",
      "clear-history",
      "delete-session",
    ]);

    wrapper.findComponent({ name: "ElDropdown" }).vm.$emit("command", "search-messages");
    await flush();

    const dialogs = wrapper.findComponent({ name: "ChatDialogs" });
    expect(dialogs.props("visibleSearchDialog")).toBe(true);
    expect(chatStoreState.searchMessages).toHaveBeenCalledWith("", "1_2");
  });

  it("opens the session info drawer and loads group members for group sessions", async () => {
    chatStoreState.currentSession = {
      id: "group_9",
      type: "group",
      targetId: "9",
      targetName: "Project",
      targetAvatar: "",
      unreadCount: 0,
      lastActiveTime: "",
      memberCount: 3,
      isPinned: false,
      pinned: false,
      isMuted: false,
      muted: false,
    };

    const wrapper = mountContainer();
    wrapper.findComponent({ name: "ElDropdown" }).vm.$emit("command", "open-session-info");
    await flush();

    const dialogs = wrapper.findComponent({ name: "ChatDialogs" });
    expect(dialogs.props("visibleSessionInfoDrawer")).toBe(true);
    expect(getMembersMock).toHaveBeenCalledWith("9");
  });

  it("routes pin, mute, and delete actions to the chat store", async () => {
    const wrapper = mountContainer();
    const dropdown = wrapper.findComponent({ name: "ElDropdown" });

    dropdown.vm.$emit("command", "toggle-pin");
    dropdown.vm.$emit("command", "toggle-mute");
    await flush();

    expect(chatStoreState.toggleSessionPinned).toHaveBeenCalledWith("1_2");
    expect(chatStoreState.toggleSessionMuted).toHaveBeenCalledWith("1_2");

    dropdown.vm.$emit("command", "delete-session");
    await flush();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(chatStoreState.deleteSession).toHaveBeenCalledWith("1_2");
  });
});
