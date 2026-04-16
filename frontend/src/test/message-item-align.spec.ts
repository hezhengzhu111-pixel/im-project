import {beforeEach, describe, expect, it, vi} from "vitest";
import {shallowMount} from "@vue/test-utils";
import {createPinia, setActivePinia} from "pinia";
import MessageItem from "@/features/chat/ChatMessageItem.vue";

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
  Document: { template: "<span />" },
  Loading: { template: "<span />" },
  Microphone: { template: "<span />" },
  Warning: { template: "<span />" },
  VideoPause: { template: "<span />" },
}));

describe("MessageItem alignment", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("aligns my message to the right by senderId", () => {
    const wrapper = shallowMount(MessageItem as any, {
      props: {
        messageId: "1",
        renderDigest: "1",
        isMine: true,
        isSystemMessage: false,
        isRecalled: false,
        isDeleted: false,
        messageType: "TEXT",
        content: "test",
        senderName: "test1",
        timeLabel: "10:00",
        currentUserName: "test1",
      },
    });
    expect(wrapper.classes()).toContain("is-mine");
  });

  it("aligns my message to the right when the item view marks it as mine", () => {
    const wrapper = shallowMount(MessageItem as any, {
      props: {
        messageId: "2",
        renderDigest: "2",
        isMine: true,
        isSystemMessage: false,
        isRecalled: false,
        isDeleted: false,
        messageType: "TEXT",
        content: "test",
        senderName: "test1",
        timeLabel: "10:00",
        currentUserName: "test1",
      },
    });
    expect(wrapper.classes()).toContain("is-mine");
  });

  it("aligns other user's message to the left", () => {
    const wrapper = shallowMount(MessageItem as any, {
      props: {
        messageId: "3",
        renderDigest: "3",
        isMine: false,
        isSystemMessage: false,
        isRecalled: false,
        isDeleted: false,
        messageType: "TEXT",
        content: "test",
        senderName: "test2",
        timeLabel: "10:00",
      },
    });
    expect(wrapper.classes()).not.toContain("is-mine");
  });
});
