import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MessageItem from "@/components/MessageItem.vue";
import type { Message } from "@/types";

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
  Document: {},
  Loading: {},
  Warning: {},
  VideoPlay: {},
  VideoPause: {},
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
});
