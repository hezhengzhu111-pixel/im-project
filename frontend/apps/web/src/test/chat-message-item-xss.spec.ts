import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatMessageItem from "@/features/chat/ChatMessageItem.vue";

vi.mock("element-plus", () => ({
  ElAvatar: { template: "<span />" },
  ElImage: { template: "<span />" },
  ElIcon: { template: "<span />" },
  ElButton: { template: "<span />" },
  ElTooltip: { template: "<span />" },
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
  Lock: { template: "<span />" },
  Microphone: { template: "<span />" },
  Warning: { template: "<span />" },
  VideoPause: { template: "<span />" },
}));

vi.mock("@/stores/i18n", () => ({
  useI18nStore: () => ({ t: (k: string) => k }),
}));

vi.mock("@/utils/common", () => ({
  getAvatarText: () => "U",
}));

const baseProps = {
  messageId: "1",
  renderDigest: "1",
  isMine: false,
  isSystemMessage: false,
  isRecalled: false,
  isDeleted: false,
  timeLabel: "10:00",
};

describe("ChatMessageItem XSS safety", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("TEXT: renders HTML tags as plain text, not as DOM elements", () => {
    const wrapper = mount(ChatMessageItem as any, {
      props: {
        ...baseProps,
        messageType: "TEXT",
        content: '<img src=x onerror=alert(1)>',
      },
    });
    const html = wrapper.find(".text-content").html();
    // Should NOT contain a rendered <img> tag
    expect(html).not.toContain("<img");
    // Should contain the literal text (Vue escapes it)
    expect(wrapper.find(".text-content").text()).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it("AI_REPLY: renders HTML tags as plain text, not as DOM elements", () => {
    const wrapper = mount(ChatMessageItem as any, {
      props: {
        ...baseProps,
        messageType: "AI_REPLY",
        content: '<script>alert("xss")</script>',
        isAiGenerated: true,
      },
    });
    const html = wrapper.find(".text-content").html();
    expect(html).not.toContain("<script>");
    expect(wrapper.find(".text-content").text()).toContain(
      '<script>alert("xss")</script>',
    );
  });

  it("TEXT: highlights @mention with .mention-highlight", () => {
    const wrapper = mount(ChatMessageItem as any, {
      props: {
        ...baseProps,
        messageType: "TEXT",
        content: "@张三 hello",
      },
    });
    const mention = wrapper.find(".mention-highlight");
    expect(mention.exists()).toBe(true);
    expect(mention.text()).toBe("@张三");
  });

  it("AI_REPLY: highlights @mention with .mention-highlight", () => {
    const wrapper = mount(ChatMessageItem as any, {
      props: {
        ...baseProps,
        messageType: "AI_REPLY",
        content: "@李四 thanks",
        isAiGenerated: true,
      },
    });
    const mention = wrapper.find(".mention-highlight");
    expect(mention.exists()).toBe(true);
    expect(mention.text()).toBe("@李四");
  });

  it("preserves multiline text with pre-wrap", () => {
    const wrapper = mount(ChatMessageItem as any, {
      props: {
        ...baseProps,
        messageType: "TEXT",
        content: "line1\nline2\nline3",
      },
    });
    const textContent = wrapper.find(".text-content");
    expect(textContent.text()).toBe("line1\nline2\nline3");
    // .text-content has white-space: pre-wrap in CSS
  });

  it("renders empty content without errors", () => {
    const wrapper = mount(ChatMessageItem as any, {
      props: {
        ...baseProps,
        messageType: "TEXT",
        content: "",
      },
    });
    expect(wrapper.find(".text-content").text()).toBe("");
  });
});
