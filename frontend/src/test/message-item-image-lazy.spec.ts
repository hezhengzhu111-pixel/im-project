import {mount} from "@vue/test-utils";
import {describe, expect, it, vi} from "vitest";
import MessageItem from "@/features/chat/ChatMessageItem.vue";

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

const baseProps = {
  messageId: "10",
  renderDigest: "10",
  isMine: false,
  isSystemMessage: false,
  isRecalled: false,
  isDeleted: false,
  messageType: "IMAGE" as const,
  content: "https://example.com/fallback.png",
  mediaUrl: "https://example.com/image.png",
  senderName: "sender",
  timeLabel: "10:00",
};

describe("MessageItem image lazy loading", () => {
  it("uses Element Plus lazy image with the chat scroll container", async () => {
    const scrollContainer = document.createElement("div");
    const wrapper = mount(MessageItem, {
      props: {
        ...baseProps,
        imageScrollContainer: scrollContainer,
      },
    });

    const image = wrapper.findComponent({ name: "ElImage" });

    expect(image.props("lazy")).toBe(true);
    expect(image.props("scrollContainer")).toBe(scrollContainer);
    expect(image.props("src")).toBe(baseProps.mediaUrl);

    image.vm.$emit("load");
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("media-loaded")?.[0]).toEqual([baseProps.messageId]);
  });

  it("renders system messages as a centered pill", () => {
    const wrapper = mount(MessageItem, {
      props: {
        ...baseProps,
        messageId: "system-1",
        renderDigest: "system-1",
        isSystemMessage: true,
        messageType: "SYSTEM",
          content: "You joined the conversation",
      },
    });

    expect(wrapper.find(".system-pill").text()).toContain("You joined the conversation");
  });

  it("renders file and voice messages with unified attachment cards", () => {
    const wrapper = mount(MessageItem, {
      props: {
        ...baseProps,
        messageId: "file-1",
        renderDigest: "file-1",
        messageType: "FILE",
        fileName: "brief.pdf",
        fileSizeLabel: "4 KB",
      },
    });

    expect(wrapper.find(".attachment-card").exists()).toBe(true);

    const voiceWrapper = mount(MessageItem, {
      props: {
        ...baseProps,
        messageId: "voice-1",
        renderDigest: "voice-1",
        messageType: "VOICE",
        durationLabel: "0:08",
      },
    });

    expect(voiceWrapper.find(".attachment-card-voice").exists()).toBe(true);
  });
});
