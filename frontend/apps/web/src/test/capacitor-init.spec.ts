import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  isNativeMock,
  setStyleMock,
  setBgColorMock,
  hideSplashMock,
  setAccessoryBarMock,
  addBackButtonListenerMock,
  exitAppMock,
  loggerWarnMock,
  loggerInfoMock,
} = vi.hoisted(() => ({
  isNativeMock: vi.fn(),
  setStyleMock: vi.fn(),
  setBgColorMock: vi.fn(),
  hideSplashMock: vi.fn(),
  setAccessoryBarMock: vi.fn(),
  addBackButtonListenerMock: vi.fn(),
  exitAppMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: isNativeMock,
  },
}));

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: {
    setStyle: setStyleMock,
    setBackgroundColor: setBgColorMock,
  },
  Style: { Dark: "DARK" },
}));

vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: {
    hide: hideSplashMock,
  },
}));

vi.mock("@capacitor/keyboard", () => ({
  Keyboard: {
    setAccessoryBarVisible: setAccessoryBarMock,
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: addBackButtonListenerMock,
    exitApp: exitAppMock,
  },
}));

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    info: loggerInfoMock,
  },
}));

describe("capacitor-init", () => {
  let historyBackSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    historyBackSpy = vi.fn();
    vi.stubGlobal("window", {
      ...window,
      history: { back: historyBackSpy },
    });
  });

  describe("setupBackButtonHandler", () => {
    it("stores a handler that is called by back button event", async () => {
      isNativeMock.mockReturnValue(true);
      addBackButtonListenerMock.mockResolvedValue(undefined);
      setStyleMock.mockResolvedValue(undefined);
      setBgColorMock.mockResolvedValue(undefined);
      hideSplashMock.mockResolvedValue(undefined);
      setAccessoryBarMock.mockResolvedValue(undefined);

      const { setupBackButtonHandler, initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );

      const customHandler = vi.fn();
      setupBackButtonHandler(customHandler);
      await initCapacitorPlugins();

      // Get the backButton listener
      const listener = addBackButtonListenerMock.mock.calls.find(
        (call) => call[0] === "backButton",
      )?.[1];
      expect(listener).toBeDefined();

      listener({ canGoBack: true });
      expect(customHandler).toHaveBeenCalledWith({ canGoBack: true });
    });

    it("calls exitApp when no handler and cannot go back", async () => {
      isNativeMock.mockReturnValue(true);
      addBackButtonListenerMock.mockResolvedValue(undefined);
      setStyleMock.mockResolvedValue(undefined);
      setBgColorMock.mockResolvedValue(undefined);
      hideSplashMock.mockResolvedValue(undefined);
      setAccessoryBarMock.mockResolvedValue(undefined);

      const { initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );
      await initCapacitorPlugins();

      const listener = addBackButtonListenerMock.mock.calls.find(
        (call) => call[0] === "backButton",
      )?.[1];
      expect(listener).toBeDefined();

      listener({ canGoBack: false });
      expect(exitAppMock).toHaveBeenCalled();
    });

    it("calls window.history.back() when no handler and can go back", async () => {
      isNativeMock.mockReturnValue(true);
      addBackButtonListenerMock.mockResolvedValue(undefined);
      setStyleMock.mockResolvedValue(undefined);
      setBgColorMock.mockResolvedValue(undefined);
      hideSplashMock.mockResolvedValue(undefined);
      setAccessoryBarMock.mockResolvedValue(undefined);

      const { initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );
      await initCapacitorPlugins();

      const listener = addBackButtonListenerMock.mock.calls.find(
        (call) => call[0] === "backButton",
      )?.[1];
      expect(listener).toBeDefined();

      listener({ canGoBack: true });
      expect(historyBackSpy).toHaveBeenCalled();
    });
  });

  describe("initCapacitorPlugins", () => {
    it("does nothing when not on native platform", async () => {
      isNativeMock.mockReturnValue(false);

      const { initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );
      await initCapacitorPlugins();

      expect(setStyleMock).not.toHaveBeenCalled();
      expect(hideSplashMock).not.toHaveBeenCalled();
      expect(setAccessoryBarMock).not.toHaveBeenCalled();
      expect(addBackButtonListenerMock).not.toHaveBeenCalled();
    });

    it("initializes all plugin setup on native platform", async () => {
      isNativeMock.mockReturnValue(true);
      setStyleMock.mockResolvedValue(undefined);
      setBgColorMock.mockResolvedValue(undefined);
      hideSplashMock.mockResolvedValue(undefined);
      setAccessoryBarMock.mockResolvedValue(undefined);
      addBackButtonListenerMock.mockResolvedValue(undefined);

      const { initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );
      await initCapacitorPlugins();

      expect(setStyleMock).toHaveBeenCalledWith({ style: "DARK" });
      expect(setBgColorMock).toHaveBeenCalledWith({ color: "#0f172a" });
      expect(hideSplashMock).toHaveBeenCalled();
      expect(setAccessoryBarMock).toHaveBeenCalledWith({ isVisible: false });
      expect(addBackButtonListenerMock).toHaveBeenCalledWith(
        "backButton",
        expect.any(Function),
      );
      expect(loggerInfoMock).toHaveBeenCalledWith(
        "capacitor: plugins initialized",
      );
    });

    it("handles StatusBar setup failure gracefully", async () => {
      isNativeMock.mockReturnValue(true);
      setStyleMock.mockRejectedValue(new Error("status bar error"));
      hideSplashMock.mockResolvedValue(undefined);
      setAccessoryBarMock.mockResolvedValue(undefined);
      addBackButtonListenerMock.mockResolvedValue(undefined);

      const { initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );
      await initCapacitorPlugins();

      expect(loggerWarnMock).toHaveBeenCalledWith(
        expect.stringContaining("StatusBar"),
        expect.any(Error),
      );
    });

    it("handles SplashScreen hide failure gracefully", async () => {
      isNativeMock.mockReturnValue(true);
      setStyleMock.mockResolvedValue(undefined);
      setBgColorMock.mockResolvedValue(undefined);
      hideSplashMock.mockRejectedValue(new Error("splash error"));
      setAccessoryBarMock.mockResolvedValue(undefined);
      addBackButtonListenerMock.mockResolvedValue(undefined);

      const { initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );
      await initCapacitorPlugins();

      expect(loggerWarnMock).toHaveBeenCalledWith(
        expect.stringContaining("SplashScreen"),
        expect.any(Error),
      );
    });

    it("handles Keyboard setup failure gracefully (Android)", async () => {
      isNativeMock.mockReturnValue(true);
      setStyleMock.mockResolvedValue(undefined);
      setBgColorMock.mockResolvedValue(undefined);
      hideSplashMock.mockResolvedValue(undefined);
      setAccessoryBarMock.mockRejectedValue(
        new Error("not supported on Android"),
      );
      addBackButtonListenerMock.mockResolvedValue(undefined);

      const { initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );
      await initCapacitorPlugins();

      // Keyboard failure should not even produce a warn log per source code
      expect(addBackButtonListenerMock).toHaveBeenCalled();
    });

    it("handles back button setup failure gracefully", async () => {
      isNativeMock.mockReturnValue(true);
      setStyleMock.mockResolvedValue(undefined);
      setBgColorMock.mockResolvedValue(undefined);
      hideSplashMock.mockResolvedValue(undefined);
      setAccessoryBarMock.mockResolvedValue(undefined);

      // addListener is not awaited in source code, so it must throw synchronously
      // to be caught by the try/catch
      addBackButtonListenerMock.mockImplementation(() => {
        throw new Error("back button error");
      });

      const { initCapacitorPlugins } = await import(
        "@/services/platform/capacitor-init"
      );
      await initCapacitorPlugins();

      expect(loggerWarnMock).toHaveBeenCalledWith(
        "capacitor: Back button setup failed",
        expect.any(Error),
      );
    });
  });
});
