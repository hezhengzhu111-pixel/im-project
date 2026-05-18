import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativeMock, addAppListenerMock } = vi.hoisted(() => ({
  isNativeMock: vi.fn(),
  addAppListenerMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: isNativeMock,
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: addAppListenerMock,
  },
}));

describe("appLifecycleService", () => {
  let visibilityListeners: Set<EventListener>;
  let documentStub: Record<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    visibilityListeners = new Set();

    documentStub = {
      hidden: false,
      addEventListener: vi.fn(
        (event: string, handler: EventListener) => {
          if (event === "visibilitychange") {
            visibilityListeners.add(handler);
          }
        },
      ),
      removeEventListener: vi.fn(
        (event: string, handler: EventListener) => {
          if (event === "visibilitychange") {
            visibilityListeners.delete(handler);
          }
        },
      ),
    };
    vi.stubGlobal("document", documentStub);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("isForeground", () => {
    it("returns true initially", async () => {
      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );
      expect(appLifecycleService.isForeground).toBe(true);
    });
  });

  describe("onForeground (browser mode)", () => {
    it("registers callback and triggers on visibilitychange visible", async () => {
      isNativeMock.mockReturnValue(false);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const cb = vi.fn();
      appLifecycleService.onForeground(cb);

      const handler = visibilityListeners.values().next().value;

      // First go to background (hidden: true) to change state
      (documentStub as any).hidden = true;
      handler(new Event("visibilitychange"));

      // Now go to foreground (hidden: false) — state changes, callback fires
      cb.mockClear();
      (documentStub as any).hidden = false;
      handler(new Event("visibilitychange"));

      expect(cb).toHaveBeenCalledTimes(1);
      expect(appLifecycleService.isForeground).toBe(true);
    });

    it("triggers callback only when visibility actually changes", async () => {
      isNativeMock.mockReturnValue(false);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const cb = vi.fn();
      appLifecycleService.onForeground(cb);

      const handler = visibilityListeners.values().next().value;

      // Go to background first
      (documentStub as any).hidden = true;
      handler(new Event("visibilitychange"));
      cb.mockClear();

      // Go to foreground
      (documentStub as any).hidden = false;
      handler(new Event("visibilitychange"));
      expect(cb).toHaveBeenCalledTimes(1);

      // Same state again — should NOT trigger
      handler(new Event("visibilitychange"));
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("returns unsubscribe function that removes callback", async () => {
      isNativeMock.mockReturnValue(false);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const cb = vi.fn();
      const unsubscribe = appLifecycleService.onForeground(cb);
      unsubscribe();

      const handler = visibilityListeners.values().next().value;
      (documentStub as any).hidden = true;
      handler(new Event("visibilitychange"));

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe("onBackground (browser mode)", () => {
    it("registers callback and triggers on visibilitychange hidden", async () => {
      isNativeMock.mockReturnValue(false);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const cb = vi.fn();
      appLifecycleService.onBackground(cb);

      // Simulate becoming hidden
      (documentStub as any).hidden = true;
      const handler = visibilityListeners.values().next().value;
      handler(new Event("visibilitychange"));

      expect(cb).toHaveBeenCalledTimes(1);
      expect(appLifecycleService.isForeground).toBe(false);
    });

    it("does not trigger onBackground when already background", async () => {
      isNativeMock.mockReturnValue(false);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const cb = vi.fn();
      appLifecycleService.onBackground(cb);

      const handler = visibilityListeners.values().next().value;

      // First trigger: become hidden
      (documentStub as any).hidden = true;
      handler(new Event("visibilitychange"));
      expect(cb).toHaveBeenCalledTimes(1);

      // Second same-state: no trigger
      handler(new Event("visibilitychange"));
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("native mode with Capacitor App", () => {
    it("registers Capacitor appStateChange listener in native mode", async () => {
      isNativeMock.mockReturnValue(true);
      addAppListenerMock.mockResolvedValue(undefined);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      appLifecycleService.onForeground(vi.fn());

      expect(addAppListenerMock).toHaveBeenCalledWith(
        "appStateChange",
        expect.any(Function),
      );
    });

    it("calls foreground callbacks when app becomes active", async () => {
      isNativeMock.mockReturnValue(true);
      addAppListenerMock.mockResolvedValue(undefined);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const cb = vi.fn();
      appLifecycleService.onForeground(cb);

      const listener = addAppListenerMock.mock.calls[0][1];

      // First send inactive to change state
      listener({ isActive: false });
      cb.mockClear();

      // Now send active — state changes, callback fires
      listener({ isActive: true });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(appLifecycleService.isForeground).toBe(true);
    });

    it("calls background callbacks when app becomes inactive", async () => {
      isNativeMock.mockReturnValue(true);
      addAppListenerMock.mockResolvedValue(undefined);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const cb = vi.fn();
      appLifecycleService.onBackground(cb);

      const listener = addAppListenerMock.mock.calls[0][1];
      listener({ isActive: false });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(appLifecycleService.isForeground).toBe(false);
    });

    it("falls back to browser listener when Capacitor listener fails", async () => {
      isNativeMock.mockReturnValue(true);
      addAppListenerMock.mockRejectedValue(new Error("capacitor error"));

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      appLifecycleService.onForeground(vi.fn());

      // Wait for the promise .catch() microtask to run, which triggers fallback
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(documentStub.addEventListener).toHaveBeenCalledWith(
        "visibilitychange",
        expect.any(Function),
      );
    });
  });

  describe("destroy", () => {
    it("removes event listeners and clears all callbacks", async () => {
      isNativeMock.mockReturnValue(false);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const fgCb = vi.fn();
      const bgCb = vi.fn();
      appLifecycleService.onForeground(fgCb);
      appLifecycleService.onBackground(bgCb);

      appLifecycleService.destroy();

      // After destroy, visibility change should not trigger callbacks
      const handler = visibilityListeners.values().next().value;
      if (handler) {
        (documentStub as any).hidden = true;
        handler(new Event("visibilitychange"));
      }

      expect(fgCb).not.toHaveBeenCalled();
      expect(bgCb).not.toHaveBeenCalled();
    });

    it("removes the visibilitychange event listener from document", async () => {
      isNativeMock.mockReturnValue(false);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      appLifecycleService.onForeground(vi.fn());
      appLifecycleService.destroy();

      expect(documentStub.removeEventListener).toHaveBeenCalledWith(
        "visibilitychange",
        expect.any(Function),
      );
    });
  });

  describe("multiple callbacks", () => {
    it("supports multiple foreground callbacks", async () => {
      isNativeMock.mockReturnValue(false);

      const { appLifecycleService } = await import(
        "@/services/platform/app-lifecycle.service"
      );

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      appLifecycleService.onForeground(cb1);
      appLifecycleService.onForeground(cb2);

      const handler = visibilityListeners.values().next().value;

      // First go to background
      (documentStub as any).hidden = true;
      handler(new Event("visibilitychange"));

      // Then go to foreground — both callbacks should fire
      cb1.mockClear();
      cb2.mockClear();
      (documentStub as any).hidden = false;
      handler(new Event("visibilitychange"));

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });
});
