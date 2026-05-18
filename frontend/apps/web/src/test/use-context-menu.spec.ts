import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vue", async () => {
  const actual = await vi.importActual("vue");
  return {
    ...actual,
    onUnmounted: vi.fn(),
  };
});

describe("useContextMenu", () => {
  beforeEach(() => {
    // Set default viewport size
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 768,
      writable: true,
      configurable: true,
    });
  });

  it("returns initial state with menu hidden", async () => {
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    expect(menu.isVisible.value).toBe(false);
    expect(menu.x.value).toBe(0);
    expect(menu.y.value).toBe(0);
  });

  it("open() sets position and shows the menu", async () => {
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    const position = menu.open(event);

    expect(menu.isVisible.value).toBe(true);
    expect(menu.x.value).toBe(100);
    expect(menu.y.value).toBe(200);
    expect(position).toEqual({ x: 100, y: 200 });
  });

  it("open() clamps position within viewport bounds", async () => {
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    // Click near bottom-right corner
    const event = { clientX: 1000, clientY: 750 } as MouseEvent;
    menu.open(event);

    // Default menuWidth=220, menuHeight=180, viewportPadding=8
    // maxX = 1024 - 220 - 8 = 796
    // maxY = 768 - 180 - 8 = 580
    expect(menu.x.value).toBe(796);
    expect(menu.y.value).toBe(580);
  });

  it("open() clamps position at top-left corner", async () => {
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    const event = { clientX: -10, clientY: -10 } as MouseEvent;
    menu.open(event);

    // min is viewportPadding = 8
    expect(menu.x.value).toBe(8);
    expect(menu.y.value).toBe(8);
  });

  it("close() hides the menu", async () => {
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);
    expect(menu.isVisible.value).toBe(true);

    menu.close();
    expect(menu.isVisible.value).toBe(false);
  });

  it("toggle() toggles menu visibility", async () => {
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    const event = { clientX: 100, clientY: 200 } as MouseEvent;

    // First toggle: opens
    const result1 = menu.toggle(event);
    expect(menu.isVisible.value).toBe(true);
    expect(result1).toEqual({ x: 100, y: 200 });

    // Second toggle: closes (returns current position)
    const result2 = menu.toggle(event);
    expect(menu.isVisible.value).toBe(false);
    expect(result2).toEqual({ x: 100, y: 200 });
  });

  it("computePosition respects custom options", async () => {
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    const event = { clientX: 800, clientY: 500 } as MouseEvent;

    const pos = menu.computePosition(event, {
      menuWidth: 300,
      menuHeight: 200,
      viewportPadding: 16,
    });

    // maxX = 1024 - 300 - 16 = 708
    // maxY = 768 - 200 - 16 = 552
    expect(pos.x).toBe(708);
    expect(pos.y).toBe(500);
  });

  it("computePosition handles missing window gracefully", async () => {
    // Temporarily remove window
    const origWindow = globalThis.window;
    // @ts-expect-error - Testing SSR scenario
    delete globalThis.window;

    try {
      const { useContextMenu } = await import("@/composables/useContextMenu");
      const menu = useContextMenu();

      const event = { clientX: 100, clientY: 200 } as MouseEvent;
      const pos = menu.computePosition(event);

      // Without window, returns raw client coordinates
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(200);
    } finally {
      globalThis.window = origWindow;
    }
  });

  it("open() with closeOnOutsideClick: true binds document and window event handlers", async () => {
    const addEventListenerSpy = vi.spyOn(
      EventTarget.prototype,
      "addEventListener"
    );
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);

    // bindOutsideHandlers binds 4 events:
    // document: click, contextmenu
    // window: resize, blur
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "contextmenu",
      expect.any(Function),
      true
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "blur",
      expect.any(Function)
    );
  });

  it("open() with closeOnOutsideClick: false does not bind handlers", async () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    menu.open({ clientX: 100, clientY: 200 } as MouseEvent, {
      closeOnOutsideClick: false,
    });

    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true
    );
  });

  it("outside click handler closes the menu", async () => {
    // Get the click handler that was bound
    const clickHandlers: Array<() => void> = [];
    vi.spyOn(document, "addEventListener").mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === "click") {
          clickHandlers.push(handler as () => void);
        }
      }
    );

    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);
    expect(menu.isVisible.value).toBe(true);

    // Trigger the click handler
    clickHandlers.forEach((handler) => handler());
    expect(menu.isVisible.value).toBe(false);
  });

  it("close() does not bind outside handlers again", async () => {
    const addEventListenerSpy = vi.spyOn(
      EventTarget.prototype,
      "addEventListener"
    );
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    // First open binds handlers
    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);
    expect(addEventListenerSpy).toHaveBeenCalledTimes(4);

    // Close then open again — should not re-bind
    menu.close();
    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);
    // Still 4 calls since the handlers are already bound
    expect(addEventListenerSpy).toHaveBeenCalledTimes(4);
  });

  it("outside contextmenu handler closes the menu", async () => {
    const cmHandlers: Array<() => void> = [];
    vi.spyOn(document, "addEventListener").mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === "contextmenu") {
          cmHandlers.push(handler as () => void);
        }
      }
    );

    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);
    expect(menu.isVisible.value).toBe(true);

    cmHandlers.forEach((handler) => handler());
    expect(menu.isVisible.value).toBe(false);
  });

  it("window resize handler closes the menu", async () => {
    const resizeHandlers: Array<() => void> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === "resize") {
          resizeHandlers.push(handler as () => void);
        }
      }
    );

    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);
    expect(menu.isVisible.value).toBe(true);

    resizeHandlers.forEach((handler) => handler());
    expect(menu.isVisible.value).toBe(false);
  });

  it("window blur handler closes the menu", async () => {
    const blurHandlers: Array<() => void> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === "blur") {
          blurHandlers.push(handler as () => void);
        }
      }
    );

    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);
    expect(menu.isVisible.value).toBe(true);

    blurHandlers.forEach((handler) => handler());
    expect(menu.isVisible.value).toBe(false);
  });

  it("calls onUnmounted to unbind handlers", async () => {
    const { onUnmounted } = await import("vue");
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    // open to bind handlers
    menu.open({ clientX: 100, clientY: 200 } as MouseEvent);

    expect(onUnmounted).toHaveBeenCalledWith(expect.any(Function));
    const cleanupFn = (onUnmounted as ReturnType<typeof vi.fn>).mock.calls[0][0];

    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    cleanupFn();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "contextmenu",
      expect.any(Function),
      true
    );
  });

  it("respects custom viewport padding in computePosition", async () => {
    const { useContextMenu } = await import("@/composables/useContextMenu");
    const menu = useContextMenu();

    const event = { clientX: 0, clientY: 0 } as MouseEvent;

    const pos = menu.computePosition(event, { viewportPadding: 20 });
    expect(pos.x).toBe(20);
    expect(pos.y).toBe(20);
  });
});
