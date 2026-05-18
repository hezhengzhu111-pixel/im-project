import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativeMock, addNetworkListenerMock } = vi.hoisted(() => ({
  isNativeMock: vi.fn(),
  addNetworkListenerMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: isNativeMock,
  },
}));

vi.mock("@capacitor/network", () => ({
  Network: {
    addListener: addNetworkListenerMock,
  },
}));

describe("networkStatusService", () => {
  let windowListeners: Record<string, Set<EventListener>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    windowListeners = {};

    const windowStub = Object.assign({}, globalThis.window || {}, {
      addEventListener: vi.fn(
        (event: string, handler: EventListener) => {
          if (!windowListeners[event]) windowListeners[event] = new Set();
          windowListeners[event].add(handler);
        },
      ),
      removeEventListener: vi.fn(
        (event: string, handler: EventListener) => {
          if (windowListeners[event]) {
            windowListeners[event].delete(handler);
          }
        },
      ),
    });
    vi.stubGlobal("window", windowStub);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("isOnline", () => {
    it("returns true when navigator.onLine is true", async () => {
      vi.stubGlobal("navigator", { onLine: true });
      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );
      expect(networkStatusService.isOnline).toBe(true);
    });

    it("returns false when navigator.onLine is false", async () => {
      vi.stubGlobal("navigator", { onLine: false });
      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );
      expect(networkStatusService.isOnline).toBe(false);
    });

    it("returns true when navigator is undefined", async () => {
      vi.stubGlobal("navigator", undefined);
      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );
      expect(networkStatusService.isOnline).toBe(true);
    });
  });

  describe("onOnline / onOffline (browser mode)", () => {
    it("registers online callback and triggers on window online event", async () => {
      isNativeMock.mockReturnValue(false);

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      const onlineCb = vi.fn();
      networkStatusService.onOnline(onlineCb);

      const handler = windowListeners["online"]?.values().next().value;
      expect(handler).toBeDefined();
      handler!(new Event("online"));

      expect(onlineCb).toHaveBeenCalledTimes(1);
    });

    it("registers offline callback and triggers on window offline event", async () => {
      isNativeMock.mockReturnValue(false);

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      const offlineCb = vi.fn();
      networkStatusService.onOffline(offlineCb);

      const handler = windowListeners["offline"]?.values().next().value;
      expect(handler).toBeDefined();
      handler!(new Event("offline"));

      expect(offlineCb).toHaveBeenCalledTimes(1);
    });

    it("returns an unsubscribe function that removes the callback", async () => {
      isNativeMock.mockReturnValue(false);

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      const cb = vi.fn();
      const unsubscribe = networkStatusService.onOnline(cb);
      unsubscribe();

      const handler = windowListeners["online"]?.values().next().value;
      if (handler) handler!(new Event("online"));

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe("onOnline / onOffline (native mode)", () => {
    it("registers Capacitor network listener in native mode", async () => {
      isNativeMock.mockReturnValue(true);
      addNetworkListenerMock.mockResolvedValue(undefined);

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      networkStatusService.onOnline(vi.fn());

      expect(addNetworkListenerMock).toHaveBeenCalledWith(
        "networkStatusChange",
        expect.any(Function),
      );
    });

    it("calls online callbacks when Capacitor reports connected", async () => {
      isNativeMock.mockReturnValue(true);
      addNetworkListenerMock.mockResolvedValue(undefined);

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      const onlineCb = vi.fn();
      networkStatusService.onOnline(onlineCb);

      const listener = addNetworkListenerMock.mock.calls[0][1];
      listener({ connected: true });

      expect(onlineCb).toHaveBeenCalledTimes(1);
    });

    it("calls offline callbacks when Capacitor reports disconnected", async () => {
      isNativeMock.mockReturnValue(true);
      addNetworkListenerMock.mockResolvedValue(undefined);

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      const offlineCb = vi.fn();
      networkStatusService.onOffline(offlineCb);

      const listener = addNetworkListenerMock.mock.calls[0][1];
      listener({ connected: false });

      expect(offlineCb).toHaveBeenCalledTimes(1);
    });

    it("falls back to browser listener when Capacitor listener fails", async () => {
      isNativeMock.mockReturnValue(true);
      addNetworkListenerMock.mockRejectedValue(new Error("capacitor error"));

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      networkStatusService.onOnline(vi.fn());

      // Wait for the promise .catch() microtask to run, which triggers fallback
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(windowListeners["online"]?.size).toBe(1);
      expect(windowListeners["offline"]?.size).toBe(1);
    });
  });

  describe("destroy", () => {
    it("removes all event listeners and clears callbacks", async () => {
      isNativeMock.mockReturnValue(false);

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      const onlineCb = vi.fn();
      const offlineCb = vi.fn();
      networkStatusService.onOnline(onlineCb);
      networkStatusService.onOffline(offlineCb);

      networkStatusService.destroy();

      windowListeners["online"]?.forEach((h) => h(new Event("online")));
      windowListeners["offline"]?.forEach((h) => h(new Event("offline")));

      expect(onlineCb).not.toHaveBeenCalled();
      expect(offlineCb).not.toHaveBeenCalled();
    });

    it("does not double-register listeners when calling onOnline multiple times", async () => {
      isNativeMock.mockReturnValue(false);

      const { networkStatusService } = await import(
        "@/services/platform/network-status.service"
      );

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      networkStatusService.onOnline(cb1);
      networkStatusService.onOnline(cb2);

      expect(windowListeners["online"]?.size).toBe(1);
    });
  });
});
