import {mount} from "@vue/test-utils";
import {nextTick} from "vue";
import {beforeEach, describe, expect, it, vi} from "vitest";
import ChatMessageList from "@/features/chat/ChatMessageList.vue";
import type {Message} from "@/types";

const scrollToItemMock = vi.hoisted(() => vi.fn());
const forceUpdateMock = vi.hoisted(() => vi.fn());
const updateVisibleItemsMock = vi.hoisted(() => vi.fn());

vi.mock("vue-virtual-scroller", () => ({
  DynamicScroller: {
    name: "DynamicScroller",
    props: ["items"],
    methods: {
      scrollToItem: scrollToItemMock,
      forceUpdate: forceUpdateMock,
      updateVisibleItems: updateVisibleItemsMock,
    },
    template: `
      <div class="dynamic-scroller-stub">
        <slot
          v-for="(item, index) in items"
          :key="item.id"
          :item="item"
          :index="index"
          :active="true"
        />
      </div>
    `,
  },
  DynamicScrollerItem: {
    name: "DynamicScrollerItem",
    props: ["item", "active", "dataIndex"],
    template: `<div class="dynamic-scroller-item-stub"><slot /></div>`,
  },
}));

vi.mock("@/features/chat/composables/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
    playingMessageId: { value: "" },
    toggle: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock("@/features/chat/composables/useMessageActions", () => ({
  useMessageActions: () => ({
    copy: vi.fn(),
    recall: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock("@/features/chat/composables/useMessageContextMenu", () => ({
  useMessageContextMenu: () => ({
    visible: false,
    x: 0,
    y: 0,
    targetMessage: { value: null },
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

const message = (id: string, senderId = "2"): Message => ({
  id,
  senderId,
  senderName: `user-${senderId}`,
  receiverId: senderId === "1" ? "2" : "1",
  isGroupChat: false,
  messageType: "TEXT",
  content: `message-${id}`,
  sendTime: `2026-04-14T10:00:0${Number(id) % 10}.000Z`,
  status: "SENT",
});

const setScrollMetrics = (
  element: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
) => {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  element.scrollTop = metrics.scrollTop;
};

const mountList = (messages: Message[], extraProps: Record<string, unknown> = {}) =>
  mount(ChatMessageList, {
    props: {
      messages,
      currentUserId: "1",
      currentUserName: "me",
      ...extraProps,
    },
    global: {
      stubs: {
        MessageItem: {
          name: "MessageItem",
          props: ["message"],
          emits: ["media-loaded"],
          template: `
            <div class="message-item-stub" @click="$emit('media-loaded', message)">
              {{ message.id }}
            </div>
          `,
        },
      },
    },
  });

const flushListEffects = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

describe("ChatMessageList scroll behavior", () => {
  beforeEach(() => {
    scrollToItemMock.mockClear();
    forceUpdateMock.mockClear();
    updateVisibleItemsMock.mockClear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it("restores scroll position after prepending history messages", async () => {
    const wrapper = mountList([message("3"), message("4")], { openedUnreadCount: 1 });
    const container = wrapper.find(".message-list").element as HTMLElement;
    const metrics = { scrollHeight: 1000, clientHeight: 400, scrollTop: 40 };
    setScrollMetrics(container, metrics);

    await wrapper.find(".message-list").trigger("scroll");

    expect(wrapper.emitted("request-history")).toHaveLength(1);

    metrics.scrollHeight = 1300;
    await wrapper.setProps({
      messages: [message("1"), message("2"), message("3"), message("4")],
    });
    await flushListEffects();

    expect(container.scrollTop).toBe(340);
  });

  it("follows new messages only when already near the bottom or sent by me", async () => {
    const wrapper = mountList([message("1")]);
    const container = wrapper.find(".message-list").element as HTMLElement;
    const metrics = { scrollHeight: 1000, clientHeight: 400, scrollTop: 430 };
    setScrollMetrics(container, metrics);

    await wrapper.find(".message-list").trigger("scroll");

    metrics.scrollHeight = 1200;
    await wrapper.setProps({ messages: [message("1"), message("2")] });
    await flushListEffects();

    expect(container.scrollTop).toBe(1200);

    metrics.scrollTop = 100;
    container.scrollTop = 100;
    await wrapper.find(".message-list").trigger("scroll");
    metrics.scrollHeight = 1400;
    await wrapper.setProps({
      messages: [message("1"), message("2"), message("3")],
    });
    await flushListEffects();

    expect(container.scrollTop).toBe(100);

    metrics.scrollHeight = 1600;
    await wrapper.setProps({
      messages: [message("1"), message("2"), message("3"), message("4", "1")],
    });
    await flushListEffects();

    expect(container.scrollTop).toBe(1600);
  });

  it("refreshes virtual sizes when a message reports media loaded", async () => {
    const wrapper = mountList([message("1")]);

    await wrapper.find(".message-item-stub").trigger("click");
    await flushListEffects();

    expect(forceUpdateMock).toHaveBeenCalled();
    expect(updateVisibleItemsMock).toHaveBeenCalledWith(true);
  });

  it("renders unread separators without breaking the virtual item stream", async () => {
    const wrapper = mountList([message("1"), message("2"), message("3")], {
      openedUnreadCount: 2,
    });

    await flushListEffects();

    expect(wrapper.find(".unread-pill").text()).toContain("Unread messages");
    expect(wrapper.findAll(".message-item-stub")).toHaveLength(3);
  });
});
