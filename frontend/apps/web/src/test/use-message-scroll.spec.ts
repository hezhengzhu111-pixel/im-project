import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

describe("useMessageScroll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const createContainer = () => {
    const messageList = document.createElement("div");
    messageList.className = "message-list";
    Object.defineProperty(messageList, "scrollHeight", {
      value: 500,
      configurable: true,
    });
    messageList.scrollTo = vi.fn();

    const container = document.createElement("div");
    container.appendChild(messageList);

    return { container, messageList };
  };

  it("scrollToBottom scrolls the message-list element to bottom", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    const { scrollToBottom } = useMessageScroll(containerRef, keyboardHeight);

    const { container, messageList } = createContainer();
    containerRef.value = container;

    scrollToBottom(false);

    expect(messageList.scrollTo).toHaveBeenCalledWith({
      top: 500,
      behavior: "instant",
    });
  });

  it("scrollToBottom uses smooth scrolling when smooth is true", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    const { scrollToBottom } = useMessageScroll(containerRef, keyboardHeight);

    const { container, messageList } = createContainer();
    containerRef.value = container;

    scrollToBottom(true);

    expect(messageList.scrollTo).toHaveBeenCalledWith({
      top: 500,
      behavior: "smooth",
    });
  });

  it("scrollToBottom does nothing when container is null", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    const { scrollToBottom } = useMessageScroll(containerRef, keyboardHeight);

    // Should not throw when container is null
    expect(() => scrollToBottom(false)).not.toThrow();
  });

  it("scrollToBottom does nothing when .message-list is not found", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    const { scrollToBottom } = useMessageScroll(containerRef, keyboardHeight);

    containerRef.value = document.createElement("div"); // no .message-list child

    // Should not throw when .message-list is absent
    expect(() => scrollToBottom(false)).not.toThrow();
  });

  it("scrollToBottomDelayed scrolls after 300ms delay", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    const { scrollToBottomDelayed } = useMessageScroll(
      containerRef,
      keyboardHeight
    );

    const { container, messageList } = createContainer();
    containerRef.value = container;

    scrollToBottomDelayed();

    // Should not have scrolled yet
    expect(messageList.scrollTo).not.toHaveBeenCalled();

    // Advance timer by 300ms
    vi.advanceTimersByTime(300);

    expect(messageList.scrollTo).toHaveBeenCalledWith({
      top: 500,
      behavior: "smooth",
    });
  });

  it("scrollToBottomDelayed does nothing when container is null", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    const { scrollToBottomDelayed } = useMessageScroll(
      containerRef,
      keyboardHeight
    );

    expect(() => scrollToBottomDelayed()).not.toThrow();
    vi.advanceTimersByTime(300);
  });

  it("triggers scroll to bottom when keyboard height increases above 100", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    const { scrollToBottom, scrollToBottomDelayed } = useMessageScroll(
      containerRef,
      keyboardHeight
    );

    const { container, messageList } = createContainer();
    containerRef.value = container;

    // Simulate keyboard opening: keyboardHeight goes from 0 to 200 (> 100 threshold)
    keyboardHeight.value = 200;
    await vi.advanceTimersByTimeAsync(300);

    expect(messageList.scrollTo).toHaveBeenCalledWith({
      top: 500,
      behavior: "smooth",
    });
  });

  it("does NOT trigger scroll when keyboard height increase is small (<= 100)", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    useMessageScroll(containerRef, keyboardHeight);

    const { container, messageList } = createContainer();
    containerRef.value = container;

    // Small increase: from 0 to 80, which is not > 100
    keyboardHeight.value = 80;
    await vi.advanceTimersByTimeAsync(300);

    expect(messageList.scrollTo).not.toHaveBeenCalled();
  });

  it("does NOT trigger scroll when keyboard height decreases", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(200);

    useMessageScroll(containerRef, keyboardHeight);

    const { container, messageList } = createContainer();
    containerRef.value = container;

    // Decrease should not trigger scroll
    keyboardHeight.value = 0;
    await vi.advanceTimersByTimeAsync(300);

    expect(messageList.scrollTo).not.toHaveBeenCalled();
  });

  it("findScrollContainer queries within the container element", async () => {
    const { useMessageScroll } = await import(
      "@/composables/useMessageScroll"
    );
    const containerRef = ref<HTMLElement | null>(null);
    const keyboardHeight = ref(0);

    const { scrollToBottom } = useMessageScroll(containerRef, keyboardHeight);

    const { container, messageList } = createContainer();
    // Add a nested structure
    const wrapper = document.createElement("div");
    wrapper.appendChild(container);
    containerRef.value = wrapper;

    // The .message-list is inside container, not a direct child of wrapper
    // findScrollContainer uses container.querySelector, so this should work
    scrollToBottom(false);

    expect(messageList.scrollTo).toHaveBeenCalledWith({
      top: 500,
      behavior: "instant",
    });
  });
});
