import {nextTick} from "vue";
import {mount} from "@vue/test-utils";
import {beforeEach, describe, expect, it, vi} from "vitest";
import ChatSidebarPanel from "@/features/chat/ChatSidebarPanel.vue";

const pinyinMock = vi.fn((value: string) => {
  if (value === "张") {
    return "Z";
  }
  if (value === "李") {
    return "L";
  }
  return "#";
});

vi.mock("pinyin-pro", () => ({
  pinyin: pinyinMock,
}));

vi.mock("@/stores/websocket", () => ({
  useWebSocketStore: () => ({
    isUserOnline: vi.fn().mockReturnValue(false),
  }),
}));

vi.mock("@/components/layout/SideNavBar.vue", () => ({
  default: {
    name: "SideNavBar",
    template: "<div class='side-nav-stub' />",
  },
}));

const ElInputStub = {
  name: "ElInput",
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: `
    <input
      class="el-input-stub"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
};

const mountSidebar = (props: Record<string, unknown>) =>
  mount(ChatSidebarPanel, {
    props: {
      activeTab: "chat",
      sessions: [],
      friends: [],
      groups: [],
      pendingRequestsCount: 0,
      totalUnreadCount: 0,
      isChatActiveOnMobile: false,
      ...props,
    },
    global: {
      stubs: {
        ElInput: ElInputStub,
        ElButton: {
          name: "ElButton",
          template: "<button><slot /></button>",
        },
        ElAvatar: {
          name: "ElAvatar",
          template: "<div class='el-avatar-stub'><slot /></div>",
        },
        ElAlert: {
          name: "ElAlert",
          template: "<div class='el-alert-stub'><slot /></div>",
        },
        ElEmpty: {
          name: "ElEmpty",
          template: "<div class='el-empty-stub'></div>",
        },
        ElIcon: {
          name: "ElIcon",
          template: "<i><slot /></i>",
        },
      },
    },
  });

const flushDebounce = async () => {
  await vi.advanceTimersByTimeAsync(150);
  await Promise.resolve();
  await nextTick();
};

describe("ChatSidebarPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pinyinMock.mockClear();
  });

  it("debounces session filtering before updating the rendered list", async () => {
    const wrapper = mountSidebar({
      activeTab: "chat",
      sessions: [
        {
          id: "1_2",
          type: "private",
          targetId: "2",
          targetName: "Alpha",
          unreadCount: 0,
          lastActiveTime: "2026-04-16T10:00:00.000Z",
          isPinned: false,
          isMuted: false,
        },
        {
          id: "1_3",
          type: "private",
          targetId: "3",
          targetName: "Beta",
          unreadCount: 0,
          lastActiveTime: "2026-04-16T10:01:00.000Z",
          isPinned: false,
          isMuted: false,
        },
      ],
    });

    await flushDebounce();
    expect(wrapper.findAll(".session-item")).toHaveLength(2);

    await wrapper.find(".el-input-stub").setValue("beta");
    await nextTick();

    expect(wrapper.findAll(".session-item")).toHaveLength(2);

    await flushDebounce();

    expect(wrapper.findAll(".session-item")).toHaveLength(1);
    expect(wrapper.find(".session-name").text()).toContain("Beta");
  });

  it("caches contact initials so repeated filters do not rerun pinyin conversion", async () => {
    const wrapper = mountSidebar({
      activeTab: "contacts",
      friends: [
        {
          friendId: "2",
          username: "zhangsan",
          nickname: "张三",
        },
        {
          friendId: "3",
          username: "lisi",
          nickname: "李四",
        },
      ],
    });

    await Promise.resolve();
    await nextTick();
    await flushDebounce();

    expect(pinyinMock).toHaveBeenCalledTimes(2);

    await wrapper.find(".el-input-stub").setValue("张");
    await flushDebounce();
    await wrapper.setProps({pendingRequestsCount: 1});
    await nextTick();

    expect(pinyinMock).toHaveBeenCalledTimes(2);
  });
});
