import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vue", async () => {
  const actual = await vi.importActual("vue");
  return {
    ...actual,
    onUnmounted: vi.fn(),
  };
});

describe("useIsMobile", () => {
  const originalMatchMedia = window.matchMedia;
  let mediaQueryListeners: Array<{
    query: string;
    listener: (e: MediaQueryListEvent) => void;
  }> = [];

  beforeEach(() => {
    mediaQueryListeners = [];
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (
        _event: string,
        handler: (e: MediaQueryListEvent) => void
      ) => {
        mediaQueryListeners.push({ query, listener: handler });
      },
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns isMobile as false for desktop viewport", async () => {
    const { useIsMobile } = await import("@/composables/useIsMobile");
    const { isMobile } = useIsMobile();
    expect(isMobile.value).toBe(false);
  });

  it("returns isMobile as true when viewport matches mobile breakpoint", async () => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    const { useIsMobile } = await import("@/composables/useIsMobile");
    const { isMobile } = useIsMobile();

    expect(isMobile.value).toBe(true);
  });

  it("uses custom breakpoint", async () => {
    let capturedQuery = "";
    window.matchMedia = ((query: string) => {
      capturedQuery = query;
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }) as typeof window.matchMedia;

    const { useIsMobile } = await import("@/composables/useIsMobile");
    useIsMobile(1024);

    expect(capturedQuery).toBe("(max-width: 1024px)");
  });

  it("updates isMobile when matchMedia fires change event", async () => {
    const { useIsMobile } = await import("@/composables/useIsMobile");
    const { isMobile } = useIsMobile();

    expect(isMobile.value).toBe(false);

    // Simulate viewport becoming mobile
    expect(mediaQueryListeners.length).toBeGreaterThan(0);
    mediaQueryListeners.forEach(({ listener }) => {
      listener({ matches: true } as MediaQueryListEvent);
    });

    expect(isMobile.value).toBe(true);

    // Simulate viewport becoming desktop again
    mediaQueryListeners.forEach(({ listener }) => {
      listener({ matches: false } as MediaQueryListEvent);
    });

    expect(isMobile.value).toBe(false);
  });

  it("registers change handler on matchMedia", async () => {
    const addEventListenerSpy = vi.fn();
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerSpy,
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    const { useIsMobile } = await import("@/composables/useIsMobile");
    useIsMobile();

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("unregisters change handler on unmount", async () => {
    const removeEventListenerSpy = vi.fn();
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: removeEventListenerSpy,
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    const { onUnmounted } = await import("vue");
    const { useIsMobile } = await import("@/composables/useIsMobile");
    useIsMobile();

    expect(onUnmounted).toHaveBeenCalledWith(expect.any(Function));
    const cleanupFn = (onUnmounted as ReturnType<typeof vi.fn>).mock.calls[0][0];
    cleanupFn();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("handles SSR environment without window", async () => {
    const origWindow = globalThis.window;
    // @ts-expect-error - Testing SSR
    delete globalThis.window;

    try {
      const { useIsMobile } = await import("@/composables/useIsMobile");
      const { isMobile } = useIsMobile();
      expect(isMobile.value).toBe(false);
    } finally {
      globalThis.window = origWindow;
    }
  });
});
