import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";

const push = vi.fn();
const back = vi.fn();
const messageSuccess = vi.fn();
const messageError = vi.fn();
const messageWarning = vi.fn();
const messageInfo = vi.fn();
const confirm = vi.fn();

const chatStore = {
  friends: [] as any[],
  friendRequests: [] as any[],
  loadFriends: vi.fn(async () => undefined),
  loadFriendRequests: vi.fn(async () => undefined),
  searchUsers: vi.fn(async () => []),
  sendFriendRequest: vi.fn(async () => undefined),
  acceptFriendRequest: vi.fn(async () => undefined),
  rejectFriendRequest: vi.fn(async () => undefined),
  deleteFriend: vi.fn(async () => undefined),
  updateFriendRemark: vi.fn(async () => undefined),
  setCurrentSession: vi.fn(),
};

const userStore = {
  userId: "1",
};

const wsStore = {
  onlineUsers: new Set<string>(),
};

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push,
    back,
  }),
}));

vi.mock("element-plus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("element-plus")>();
  return {
    ...actual,
    ElMessage: {
      success: messageSuccess,
      error: messageError,
      warning: messageWarning,
      info: messageInfo,
    },
    ElMessageBox: {
      confirm,
    },
  };
});

vi.mock("@/stores/chat", () => ({
  useChatStore: () => chatStore,
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => userStore,
}));

vi.mock("@/stores/websocket", () => ({
  useWebSocketStore: () => wsStore,
}));

describe("Friends page", () => {
  beforeEach(() => {
    vi.resetModules();
    push.mockReset();
    back.mockReset();
    messageSuccess.mockReset();
    messageError.mockReset();
    messageWarning.mockReset();
    messageInfo.mockReset();
    confirm.mockReset();
    chatStore.loadFriends.mockClear();
    chatStore.loadFriendRequests.mockClear();
    chatStore.setCurrentSession.mockClear();
    chatStore.friends = [];
    chatStore.friendRequests = [
      {
        id: "request-self",
        applicantId: "1",
        applicantUsername: "me",
        applicantNickname: "Me",
        applicantAvatar: "self-avatar.png",
        targetUserId: "2",
        targetUsername: "target-user",
        targetNickname: "Target User",
        targetAvatar: "target-avatar.png",
        reason: "please add me",
        status: "PENDING",
        createTime: "2026-03-23T00:00:00.000Z",
      },
      {
        id: "request-other",
        applicantId: "3",
        applicantUsername: "applicant-user",
        applicantNickname: "Applicant User",
        applicantAvatar: "applicant-avatar.png",
        targetUserId: "1",
        targetUsername: "me",
        targetNickname: "Me",
        targetAvatar: "me-avatar.png",
        reason: "hi",
        status: "PENDING",
        createTime: "2026-03-23T00:01:00.000Z",
      },
    ];
  });

  it("renders the correct avatar and name for sent and received requests", async () => {
    const FriendsPage = (await import("@/pages/Friends.vue")).default;
    const wrapper = shallowMount(FriendsPage, {
      global: {
        mocks: {
          $router: {
            back,
          },
        },
        stubs: {
          "el-button": { template: "<button><slot /></button>" },
          "el-input": { template: "<input />" },
          "el-card": {
            template: "<section><slot name='header' /><slot /></section>",
          },
          "el-badge": { template: "<span><slot /></span>" },
          "el-avatar": {
            props: ["src"],
            template: "<div class='avatar' :data-src='src'><slot /></div>",
          },
          "el-tag": { template: "<span><slot /></span>" },
          "el-dropdown": { template: "<div><slot /><slot name='dropdown' /></div>" },
          "el-dropdown-menu": { template: "<div><slot /></div>" },
          "el-dropdown-item": { template: "<div><slot /></div>" },
          "el-icon": { template: "<i><slot /></i>" },
          "el-empty": { template: "<div><slot /></div>" },
          "el-skeleton": { template: "<div />" },
          "el-dialog": {
            template: "<div><slot /><slot name='footer' /></div>",
          },
          "el-form": { template: "<form><slot /></form>" },
          "el-form-item": { template: "<div><slot /></div>" },
          "el-radio-group": { template: "<div><slot /></div>" },
          "el-radio": { template: "<label><slot /></label>" },
          "arrow-down": true,
        },
      },
    });

    await flushPromises();

    const html = wrapper.html();
    expect(html).toContain("target-avatar.png");
    expect(html).toContain("Target User");
    expect(html).toContain("applicant-avatar.png");
    expect(html).toContain("Applicant User");
    expect(chatStore.loadFriends).toHaveBeenCalledTimes(1);
    expect(chatStore.loadFriendRequests).toHaveBeenCalledTimes(1);
  }, 15000);
});
