import { onMounted, onUnmounted, ref } from "vue";

export function useKeyboardInset() {
  const keyboardHeight = ref(0);
  const isKeyboardOpen = ref(false);

  if (typeof window === "undefined" || !window.visualViewport) {
    return { keyboardHeight, isKeyboardOpen };
  }

  let maxHeight = 0;
  const viewport = window.visualViewport;
  const KEYBOARD_THRESHOLD = 150;

  const update = () => {
    const vh = viewport.height;
    if (vh > maxHeight) maxHeight = vh;

    const diff = maxHeight - vh;
    if (diff > KEYBOARD_THRESHOLD) {
      keyboardHeight.value = Math.round(diff);
      isKeyboardOpen.value = true;
    } else {
      keyboardHeight.value = 0;
      isKeyboardOpen.value = false;
    }
  };

  const handleResize = () => update();
  const handleScroll = () => update();

  onMounted(() => {
    maxHeight = viewport.height;
    // Allow layout to stabilize before recording baseline
    setTimeout(() => {
      if (viewport.height > maxHeight) maxHeight = viewport.height;
    }, 300);
    viewport.addEventListener("resize", handleResize);
    viewport.addEventListener("scroll", handleScroll);
  });

  onUnmounted(() => {
    viewport.removeEventListener("resize", handleResize);
    viewport.removeEventListener("scroll", handleScroll);
  });

  return { keyboardHeight, isKeyboardOpen };
}
