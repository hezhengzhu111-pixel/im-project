import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vue", async () => {
  const actual = await vi.importActual("vue");
  return {
    ...actual,
    onMounted: vi.fn(),
    onUnmounted: vi.fn(),
  };
});

describe("useKeyboardInset", () => {
  const originalVisualViewport = window.visualViewport;
  let resizeHandlers: Array<() => void> = [];
  let scrollHandlers: Array<() => void> = [];
  let viewport: {
    height: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  } | null = null;

  const mockViewport = (height: number) => {
    if (!viewport) {
      resizeHandlers = [];
      scrollHandlers = [];
      viewport = {
        height,
        addEventListener: vi.fn(
          (event: string, handler: () => void) => {
            if (event === "resize") resizeHandlers.push(handler);
            if (event === "scroll") scrollHandlers.push(handler);
          }
        ),
        removeEventListener: vi.fn(),
      };
      Object.defineProperty(window, "visualViewport", {
        value: viewport,
        writable: true,
        configurable: true,
      });
    } else {
      viewport.height = height;
    }
    return viewport;
  };

  afterEach(() => {
    viewport = null;
    resizeHandlers = [];
    scrollHandlers = [];
    Object.defineProperty(window, "visualViewport", {
      value: originalVisualViewport,
      writable: true,
      configurable: true,
    });
  });

  it("returns default state when visualViewport is unavailable", async () => {
    // @ts-expect-error - Simulating environment without visualViewport
    delete window.visualViewport;

    const { useKeyboardInset } = await import("@/composables/useKeyboardInset");
    const result = useKeyboardInset();

    expect(result.keyboardHeight.value).toBe(0);
    expect(result.isKeyboardOpen.value).toBe(false);
  });

  it("returns default state in SSR when window is unavailable", async () => {
    const origWindow = globalThis.window;
    // @ts-expect-error - Testing SSR
    delete globalThis.window;

    try {
      const { useKeyboardInset } = await import(
        "@/composables/useKeyboardInset"
      );
      const result = useKeyboardInset();

      expect(result.keyboardHeight.value).toBe(0);
      expect(result.isKeyboardOpen.value).toBe(false);
    } finally {
      globalThis.window = origWindow;
    }
  });

  it("records maxHeight and detects keyboard open", async () => {
    mockViewport(800);
    const { onMounted } = await import("vue");

    const { useKeyboardInset } = await import("@/composables/useKeyboardInset");
    const result = useKeyboardInset();

    // Verify onMounted was called with a callback
    expect(onMounted).toHaveBeenCalledWith(expect.any(Function));
    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    // Initially should be closed
    expect(result.keyboardHeight.value).toBe(0);
    expect(result.isKeyboardOpen.value).toBe(false);

    // Simulate keyboard opening: viewport height shrinks significantly
    // The viewport object is reused, so listeners from mountFn are preserved
    viewport!.height = 500; // diff = 800 - 500 = 300 > 150 (threshold)
    resizeHandlers.forEach((handler) => handler());

    expect(result.keyboardHeight.value).toBe(300);
    expect(result.isKeyboardOpen.value).toBe(true);
  });

  it("detects keyboard closing", async () => {
    mockViewport(800);
    const { onMounted } = await import("vue");

    const { useKeyboardInset } = await import("@/composables/useKeyboardInset");
    const result = useKeyboardInset();

    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    // Keyboard opens
    viewport!.height = 500;
    resizeHandlers.forEach((handler) => handler());
    expect(result.isKeyboardOpen.value).toBe(true);
    expect(result.keyboardHeight.value).toBe(300);

    // Keyboard closes
    viewport!.height = 800;
    resizeHandlers.forEach((handler) => handler());

    expect(result.keyboardHeight.value).toBe(0);
    expect(result.isKeyboardOpen.value).toBe(false);
  });

  it("ignores small viewport changes below threshold", async () => {
    mockViewport(800);
    const { onMounted } = await import("vue");

    const { useKeyboardInset } = await import("@/composables/useKeyboardInset");
    const result = useKeyboardInset();

    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    // Small change: diff = 100, below threshold of 150
    viewport!.height = 700;
    resizeHandlers.forEach((handler) => handler());

    expect(result.keyboardHeight.value).toBe(0);
    expect(result.isKeyboardOpen.value).toBe(false);
  });

  it("handles scroll events same as resize", async () => {
    mockViewport(800);
    const { onMounted } = await import("vue");

    const { useKeyboardInset } = await import("@/composables/useKeyboardInset");
    const result = useKeyboardInset();

    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    // Keyboard opens (scroll event instead of resize)
    viewport!.height = 500;
    scrollHandlers.forEach((handler) => handler());

    expect(result.keyboardHeight.value).toBe(300);
    expect(result.isKeyboardOpen.value).toBe(true);
  });

  it("binds resize and scroll events on mount", async () => {
    mockViewport(800);
    const { onMounted } = await import("vue");

    const { useKeyboardInset } = await import("@/composables/useKeyboardInset");
    useKeyboardInset();

    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    expect(viewport!.addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    );
    expect(viewport!.addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function)
    );
  });

  it("cleans up event listeners on unmount", async () => {
    mockViewport(800);
    const { onMounted, onUnmounted } = await import("vue");

    const { useKeyboardInset } = await import("@/composables/useKeyboardInset");
    useKeyboardInset();

    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    expect(onUnmounted).toHaveBeenCalledWith(expect.any(Function));
    const cleanupFn = (onUnmounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    cleanupFn();

    expect(viewport!.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    );
    expect(viewport!.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function)
    );
  });

  it("sets delayed maxHeight via setTimeout on mount", async () => {
    vi.useFakeTimers();
    mockViewport(800);
    const { onMounted } = await import("vue");

    const { useKeyboardInset } = await import("@/composables/useKeyboardInset");
    const result = useKeyboardInset();
    const vp = window.visualViewport!;

    // Simulate the delayed setTimeout update
    // After 300ms, if viewport.height > initial maxHeight, update maxHeight
    const mountFn = (onMounted as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;
    mountFn();

    // Change viewport height and advance timer (simulates delayed baseline update)
    Object.defineProperty(vp, "height", { value: 900, configurable: true });
    vi.advanceTimersByTime(300);

    // Now trigger resize - maxHeight should be 900 (updated by setTimeout)
    Object.defineProperty(vp, "height", { value: 600, configurable: true });
    result.keyboardHeight.value = 0;

    // Extract resize handler from vi.fn() mock calls
    const resizeHandlerCalls =
      (vp as unknown as { addEventListener: ReturnType<typeof vi.fn> })
        .addEventListener.mock.calls;
    const resizeHandlerCall = resizeHandlerCalls.find(
      (call: unknown[]) => call[0] === "resize"
    );
    const resizeHandler = resizeHandlerCall?.[1] as () => void;
    if (resizeHandler) resizeHandler();

    // diff = 900 - 600 = 300 > 150, so keyboard should be detected as open
    expect(result.isKeyboardOpen.value).toBe(true);
    expect(result.keyboardHeight.value).toBe(300);

    vi.useRealTimers();
  });
});
