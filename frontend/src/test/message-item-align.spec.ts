import { describe, it, expect, beforeEach, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import MessageItem from "@/components/MessageItem.vue";

vi.mock("element-plus", () => ({
  ElAvatar: {},
  ElImage: {},
  ElIcon: {},
  ElButton: {},
  ElMessage: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@element-plus/icons-vue", () => ({
  Document: {},
  Loading: {},
  Warning: {},
  VideoPlay: {},
  VideoPause: {},
}));

vi.mock("@/stores/chat", () => ({
  useChatStore: () => ({
    addMessage: vi.fn(),
    deleteMessage: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMessage", () => ({
  useMessage: () => ({
    getMessageSenderAvatar: () => "T",
    getMessageSenderName: (m: any) => m.senderName || "",
    formatMessageTime: () => "",
    canRecallMessage: () => true,
    recallMessage: vi.fn(),
  }),
}));

describe("MessageItem alignment", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("aligns my message to the right by senderId", () => {
    const wrapper = shallowMount(MessageItem as any, {
      props: {
        message: {
          id: "1",
          senderId: "201",
          senderName: "test1",
          messageType: "TEXT",
          type: "TEXT",
          content: "test",
          sendTime: "2026-02-07T10:00:00.000Z",
        },
        currentUserId: "201",
        currentUserName: "test1",
      },
    });
    expect(wrapper.classes()).toContain("is-mine");
  });

  it("aligns my message to the right by senderName fallback when id is unsafe", () => {
    const wrapper = shallowMount(MessageItem as any, {
      props: {
        message: {
          id: "1",
          senderId: 2019997952600182786,
          senderName: "test1",
          messageType: "TEXT",
          type: "TEXT",
          content: "test",
          sendTime: "2026-02-07T10:00:00.000Z",
        },
        currentUserId: "2019997952600182786",
        currentUserName: "test1",
      },
    });
    expect(wrapper.classes()).toContain("is-mine");
  });

  it("aligns other user's message to the left", () => {
    const wrapper = shallowMount(MessageItem as any, {
      props: {
        message: {
          id: "1",
          senderId: "202",
          senderName: "test2",
          messageType: "TEXT",
          type: "TEXT",
          content: "test",
          sendTime: "2026-02-07T10:00:00.000Z",
        },
        currentUserId: "201",
        currentUserName: "test1",
      },
    });
    expect(wrapper.classes()).not.toContain("is-mine");
  });
});
