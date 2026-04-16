import {mount} from "@vue/test-utils";
import {describe, expect, it, vi} from "vitest";
import MessageItem from "@/features/chat/ChatMessageItem.vue";
import type {Message} from "@/types";

vi.mock("element-plus", () => ({
  ElAvatar: { name: "ElAvatar", template: "<div><slot /></div>" },
  ElIcon: { name: "ElIcon", template: "<i><slot /></i>" },
  ElButton: { name: "ElButton", template: "<button><slot /></button>" },
  ElImage: {
    name: "ElImage",
    props: {
      src: String,
      previewSrcList: Array,
      scrollContainer: [String, Object],
      fit: String,
      lazy: Boolean,
    },
    emits: ["load", "error"],
    template: `
      <div class="el-image-stub">
        <slot name="placeholder" />
        <slot name="error" />
      </div>
    `,
  },
  ElMessage: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@element-plus/icons-vue", () => ({
  Document: { template: "<span />" },
  Loading: { template: "<span />" },
  Microphone: { template: "<span />" },
  Warning: { template: "<span />" },
  VideoPause: { template: "<span />" },
}));

const imageMessage: Message = {
  id: "10",
  senderId: "2",
  senderName: "sender",
  receiverId: "1",
  isGroupChat: false,
  messageType: "IMAGE",
  content: "https://example.com/fallback.png",
  mediaUrl: "https://example.com/image.png",
  sendTime: "2026-04-14T10:00:00.000Z",
  status: "SENT",
};

describe("MessageItem image lazy loading", () => {
  it("uses Element Plus lazy image with the chat scroll container", async () => {
    const scrollContainer = document.createElement("div");
    const wrapper = mount(MessageItem, {
      props: {
        message: imageMessage,
        currentUserId: "1",
        imageScrollContainer: scrollContainer,
      },
    });

    const image = wrapper.findComponent({ name: "ElImage" });

    expect(image.props("lazy")).toBe(true);
    expect(image.props("scrollContainer")).toBe(scrollContainer);
    expect(image.props("src")).toBe(imageMessage.mediaUrl);

    image.vm.$emit("load");
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("media-loaded")?.[0]).toEqual([imageMessage]);
  });

  it("renders system messages as a centered pill", () => {
    const wrapper = mount(MessageItem, {
      props: {
        message: {
          ...imageMessage,
          id: "system-1",
          messageType: "SYSTEM",
          content: "You joined the conversation",
        },
        currentUserId: "1",
      },
    });

    expect(wrapper.find(".system-pill").text()).toContain("You joined the conversation");
  });

  it("renders file and voice messages with unified attachment cards", () => {
    const wrapper = mount(MessageItem, {
      props: {
        message: {
          ...imageMessage,
          id: "file-1",
          messageType: "FILE",
          mediaName: "brief.pdf",
          mediaSize: 4096,
        },
        currentUserId: "1",
      },
    });

    expect(wrapper.find(".attachment-card").exists()).toBe(true);

    const voiceWrapper = mount(MessageItem, {
      props: {
        message: {
          ...imageMessage,
          id: "voice-1",
          messageType: "VOICE",
          duration: 8,
        },
        currentUserId: "1",
      },
    });

    expect(voiceWrapper.find(".attachment-card-voice").exists()).toBe(true);
  });
});
