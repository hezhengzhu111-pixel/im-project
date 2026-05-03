import { onMounted, onUnmounted, ref } from "vue";

export function useKeyboardInset() {
  const keyboardHeight = ref(0);
  const isKeyboardOpen = ref(false);

  if (typeof window === "undefined" || !window.visualViewport) {
    return { keyboardHeight, isKeyboardOpen };
  }

  let initialHeight = 0;
  const viewport = window.visualViewport;

  const update = () => {
    const currentHeight = viewport.height;
    const diff = initialHeight - currentHeight;

    if (diff > 100) {
      keyboardHeight.value = Math.round(diff);
      isKeyboardOpen.value = true;
    } else {
      keyboardHeight.value = 0;
      isKeyboardOpen.value = false;
    }
  };

  const handleResize = () => {
    update();
  };

  const handleScroll = () => {
    update();
  };

  onMounted(() => {
    initialHeight = viewport.height;
    viewport.addEventListener("resize", handleResize);
    viewport.addEventListener("scroll", handleScroll);
  });

  onUnmounted(() => {
    viewport.removeEventListener("resize", handleResize);
    viewport.removeEventListener("scroll", handleScroll);
  });

  return { keyboardHeight, isKeyboardOpen };
}
