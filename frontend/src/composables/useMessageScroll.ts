import { type Ref, watch } from "vue";

const SCROLL_DELAY_MS = 300;

export function useMessageScroll(
  containerRef: Ref<HTMLElement | null>,
  keyboardHeight: Ref<number>,
) {
  const findScrollContainer = (): HTMLElement | null => {
    const container = containerRef.value;
    if (!container) return null;
    return container.querySelector(".message-list") as HTMLElement | null;
  };

  const scrollToBottom = (smooth = false) => {
    const el = findScrollContainer();
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    });
  };

  const scrollToBottomDelayed = () => {
    setTimeout(() => scrollToBottom(true), SCROLL_DELAY_MS);
  };

  watch(keyboardHeight, (newVal, oldVal) => {
    if (newVal > oldVal && newVal > 100) {
      scrollToBottomDelayed();
    }
  });

  return { scrollToBottom, scrollToBottomDelayed };
}
