import { ref, onUnmounted } from "vue";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  const isMobile = ref(false);

  if (typeof window === "undefined") {
    return { isMobile };
  }

  const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
  isMobile.value = mql.matches;

  const handler = (e: MediaQueryListEvent) => {
    isMobile.value = e.matches;
  };

  mql.addEventListener("change", handler);

  onUnmounted(() => {
    mql.removeEventListener("change", handler);
  });

  return { isMobile };
}
