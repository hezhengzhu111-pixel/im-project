import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatMessageList from "@/features/chat/ChatMessageList.vue";
import type { Message } from "@/types";

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

// Stub DynamicScroller as a simple scrollable container that renders items via its default slot
vi.mock("vue-virtual-scroller", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DynamicScroller: (defineComponent as any)({
    props: ["items", "minItemSize", "keyField"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup(props: any, { slots }: any) {
      const elRef = ref<HTMLElement | null>(null);
      return () => {
        const items = props.items || [];
        const children = items.map(
          (item: Record<string, unknown>, index: number) =>
            slots.default
              ? slots.default({ item, index, active: true })
              : null,
        );
        return h(
          "div",
          {
            class: "message-scroller",
            ref: elRef,
          },
          children,
        );
      };
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DynamicScrollerItem: (defineComponent as any)({
    props: ["item", "active", "dataIndex"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup(_props: any, { slots }: any) {
      return () => slots.default?.();
    },
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

const mountList = (
  messages: Message[],
  extraProps: Record<string, unknown> = {},
) =>
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
          props: ["messageId"],
          emits: ["media-loaded"],
          template: `
            <div class="message-item-stub" @click="$emit('media-loaded', messageId)">
              {{ messageId }}
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
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it("restores scroll position after prepending history messages", async () => {
    const wrapper = mountList([message("3"), message("4")], {
      openedUnreadCount: 1,
    });
    await flushListEffects();

    const scroller = wrapper.find(".message-scroller");
    const container = scroller.element as HTMLElement;
    const metrics = { scrollHeight: 1000, clientHeight: 400, scrollTop: 40 };
    setScrollMetrics(container, metrics);

    await scroller.trigger("scroll");

    expect(wrapper.emitted("request-history")).toHaveLength(1);

    metrics.scrollHeight = 1300;
    await wrapper.setProps({
      messages: [message("1"), message("2"), message("3"), message("4")],
    });
    await flushListEffects();

    expect(container.scrollTop).toBe(340);
  });

  it("keeps the latest appended messages visible", async () => {
    const wrapper = mountList([message("1")]);
    await flushListEffects();

    const scroller = wrapper.find(".message-scroller");
    const container = scroller.element as HTMLElement;
    const metrics = { scrollHeight: 1000, clientHeight: 400, scrollTop: 430 };
    setScrollMetrics(container, metrics);

    await scroller.trigger("scroll");

    metrics.scrollHeight = 1200;
    await wrapper.setProps({ messages: [message("1"), message("2")] });
    await flushListEffects();

    expect(container.scrollTop).toBe(1200);

    metrics.scrollTop = 100;
    container.scrollTop = 100;
    await scroller.trigger("scroll");
    metrics.scrollHeight = 1400;
    await wrapper.setProps({
      messages: [message("1"), message("2"), message("3")],
    });
    await flushListEffects();

    expect(container.scrollTop).toBe(1400);

    metrics.scrollHeight = 1600;
    await wrapper.setProps({
      messages: [message("1"), message("2"), message("3"), message("4", "1")],
    });
    await flushListEffects();

    expect(container.scrollTop).toBe(1600);
  });

  it("keeps the plain message list stable when media reports loaded", async () => {
    const wrapper = mountList([message("1")], { e2eeStatus: "encrypted" });
    await flushListEffects();

    await wrapper.find(".message-item-stub").trigger("click");
    await flushListEffects();

    // 1 encryption notice + 1 message = 2 stubs
    expect(wrapper.findAll(".message-item-stub")).toHaveLength(2);
  });

  it("renders unread separators without breaking the message stream", async () => {
    const wrapper = mountList([message("1"), message("2"), message("3")], {
      openedUnreadCount: 2,
      e2eeStatus: "encrypted",
    });

    await flushListEffects();

    expect(wrapper.find(".unread-pill").text()).not.toHaveLength(0);
    // 1 encryption notice + 3 messages = 4 stubs (unread separator is not a MessageItem)
    expect(wrapper.findAll(".message-item-stub")).toHaveLength(4);
  });
});
