import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const {
  refreshMock,
  registerAccessTokenProviderMock,
  registerRequestInterceptorMock,
  registerResponseInterceptorMock,
  getHeaderValueMock,
  setHeaderValueMock,
  shouldSkipRefreshMock,
  notifyAuthExpiredMock,
  routerPushMock,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  registerAccessTokenProviderMock: vi.fn(),
  registerRequestInterceptorMock: vi.fn(),
  registerResponseInterceptorMock: vi.fn(),
  getHeaderValueMock: vi.fn(),
  setHeaderValueMock: vi.fn(),
  shouldSkipRefreshMock: vi.fn(),
  notifyAuthExpiredMock: vi.fn(),
  routerPushMock: vi.fn(),
}));

// Mock userStore
const userStoreMock = vi.hoisted(() =>
  vi.fn(() => ({
    accessToken: "",
    getAccessToken: vi.fn().mockReturnValue("test-access-token"),
    setAccessToken: vi.fn(),
    restoreSession: vi.fn().mockResolvedValue(true),
    clearSession: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getSessionGeneration: vi.fn().mockReturnValue(0),
  })),
);

vi.mock("@/stores/user", () => ({
  useUserStore: userStoreMock,
}));

vi.mock("@/services/auth-refresh", () => ({
  refreshAccessTokenCoordinated: refreshMock,
}));

vi.mock("@/utils/httpClient", () => ({
  registerAccessTokenProvider: registerAccessTokenProviderMock,
  registerRequestInterceptor: registerRequestInterceptorMock,
  registerResponseInterceptor: registerResponseInterceptorMock,
  getHeaderValue: getHeaderValueMock,
  setHeaderValue: setHeaderValueMock,
  shouldSkipRefresh: shouldSkipRefreshMock,
}));

vi.mock("@/services/http-error-notifier", () => ({
  notifyAuthExpired: notifyAuthExpiredMock,
}));

vi.mock("@/router", () => ({
  default: {
    push: routerPushMock,
    currentRoute: { value: { path: "/chat" } },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface InterceptorPair {
  onFulfilled: (response: any) => any;
  onRejected: (error: any) => any;
}

function captureInterceptors(): {
  provider: () => string;
  requestInterceptor: (config: any) => any;
  interceptorPairs: InterceptorPair[];
} {
  const result = {
    provider: () => "",
    requestInterceptor: (config: any) => config,
    interceptorPairs: [] as InterceptorPair[],
  };

  // Capture the access token provider
  registerAccessTokenProviderMock.mockImplementation(
    (fn: () => string) => {
      result.provider = fn;
    },
  );

  // Capture the request interceptor
  registerRequestInterceptorMock.mockImplementation(
    (fn: (config: any) => any) => {
      result.requestInterceptor = fn;
    },
  );

  // Capture response interceptor pairs
  registerResponseInterceptorMock.mockImplementation(
    (onFulfilled: any, onRejected: any) => {
      result.interceptorPairs.push({ onFulfilled, onRejected });
    },
  );

  return result;
}

describe("auth-session-adapter", () => {
  let httpClientRequestMock: ReturnType<typeof vi.fn>;
  let captured: ReturnType<typeof captureInterceptors>;

  beforeEach(() => {
    vi.clearAllMocks();

    httpClientRequestMock = vi.fn().mockResolvedValue({ data: "ok" });
    captured = captureInterceptors();
  });

  describe("registerAuthSessionAdapter", () => {
    it("registers an access token provider", async () => {
      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      expect(registerAccessTokenProviderMock).toHaveBeenCalledWith(
        expect.any(Function),
      );
      const token = captured.provider();
      expect(token).toBe("test-access-token");
    });

    it("registers a request interceptor", async () => {
      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      expect(registerRequestInterceptorMock).toHaveBeenCalledWith(
        expect.any(Function),
      );
      const config = { url: "/test", headers: {} };
      const result = captured.requestInterceptor(config);
      expect(result).toBe(config);
    });

    it("registers a response interceptor pair", async () => {
      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      expect(registerResponseInterceptorMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
      );
      expect(captured.interceptorPairs.length).toBe(1);
    });
  });

  describe("business 401 interceptor (onFulfilled)", () => {
    it("passes through response with success boolean field", async () => {
      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onFulfilled } = captured.interceptorPairs[0];
      const response = {
        data: { success: true, code: 200 },
        config: { url: "/test" },
      };

      const result = await onFulfilled(response);
      expect(result).toBe(response);
    });

    it("tries refresh on code 401 and retries request on success", async () => {
      refreshMock.mockResolvedValue({ status: "success" });

      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onFulfilled } = captured.interceptorPairs[0];
      const config = { url: "/api/message/send", headers: {} };
      const response = {
        data: { code: 401, message: "unauthorized" },
        config,
      };

      httpClientRequestMock.mockResolvedValue({ data: "retried-ok" });
      const result = await onFulfilled(response);

      expect(refreshMock).toHaveBeenCalled();
      expect(setHeaderValueMock).toHaveBeenCalled();
      expect(httpClientRequestMock).toHaveBeenCalledWith(config);
      expect(result).toEqual({ data: "retried-ok" });
    });

    it("rejects on code 401 when refresh fails and shouldClearSession is false", async () => {
      refreshMock.mockResolvedValue({ status: "transientError" });

      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onFulfilled } = captured.interceptorPairs[0];
      const config = { url: "/api/message/send", headers: {} };
      const response = {
        data: { code: 401, message: "unauthorized" },
        config,
      };

      await expect(onFulfilled(response)).rejects.toThrow("unauthorized");
    });

    it("rejects immediately on code 401 when url should skip refresh", async () => {
      shouldSkipRefreshMock.mockReturnValue(true);

      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onFulfilled } = captured.interceptorPairs[0];
      const config = { url: "/api/auth/parse", headers: {} };
      const response = {
        data: { code: 401, message: "unauthorized" },
        config,
      };

      await expect(onFulfilled(response)).rejects.toThrow("unauthorized");
      expect(refreshMock).not.toHaveBeenCalled();
    });

    it("passes through non-401, non-success responses unchanged", async () => {
      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onFulfilled } = captured.interceptorPairs[0];
      const response = {
        data: { code: 403, message: "forbidden" },
        config: { url: "/test" },
      };

      const result = await onFulfilled(response);
      expect(result).toBe(response);
    });
  });

  describe("HTTP 401 interceptor (onRejected)", () => {
    it("rejects errors without a response", async () => {
      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onRejected } = captured.interceptorPairs[0];
      const error = new Error("network error");

      await expect(onRejected(error)).rejects.toThrow("network error");
    });

    it("rejects non-401 HTTP errors", async () => {
      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onRejected } = captured.interceptorPairs[0];
      const error = new Error("bad request");
      (error as any).response = { status: 400 };

      await expect(onRejected(error)).rejects.toThrow("bad request");
    });

    it("tries refresh on HTTP 401 and retries request on success", async () => {
      refreshMock.mockResolvedValue({ status: "success" });

      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onRejected } = captured.interceptorPairs[0];
      const config = { url: "/api/user/profile", headers: {} };
      const error = new Error("unauthorized");
      (error as any).response = { status: 401 };
      (error as any).config = config;

      httpClientRequestMock.mockResolvedValue({ data: "retried-profile" });
      const result = await onRejected(error);

      expect(refreshMock).toHaveBeenCalled();
      expect(setHeaderValueMock).toHaveBeenCalled();
      expect(httpClientRequestMock).toHaveBeenCalledWith(config);
      expect(result).toEqual({ data: "retried-profile" });
    });

    it("rejects HTTP 401 when refresh fails", async () => {
      refreshMock.mockResolvedValue({ status: "transientError" });

      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onRejected } = captured.interceptorPairs[0];
      const config = { url: "/api/user/profile", headers: {} };
      const error = new Error("unauthorized");
      (error as any).response = { status: 401 };
      (error as any).config = config;

      await expect(onRejected(error)).rejects.toThrow("unauthorized");
    });

    it("skips refresh for urls that should be skipped", async () => {
      shouldSkipRefreshMock.mockReturnValue(true);

      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onRejected } = captured.interceptorPairs[0];
      const error = new Error("unauthorized");
      (error as any).response = { status: 401 };
      (error as any).config = { url: "/api/auth/refresh", headers: {} };

      await expect(onRejected(error)).rejects.toThrow("unauthorized");
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  describe("clearAuthSession and promptReLogin on refresh failure", () => {
    it("clears session and navigates to login when refresh returns authInvalid for non-offline/heartbeat/logout urls", async () => {
      refreshMock.mockResolvedValue({ status: "authInvalid" });

      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onFulfilled } = captured.interceptorPairs[0];
      const config = { url: "/api/message/send", headers: {} };
      const response = {
        data: { code: 401, message: "unauthorized" },
        config,
      };

      await expect(onFulfilled(response)).rejects.toThrow("unauthorized");
      expect(notifyAuthExpiredMock).toHaveBeenCalled();
      expect(routerPushMock).toHaveBeenCalledWith("/login");
    });

    it("does not clear session for offline/logout/heartbeat urls", async () => {
      refreshMock.mockResolvedValue({ status: "authInvalid" });

      const { registerAuthSessionAdapter } = await import(
        "@/services/auth-session-adapter"
      );
      registerAuthSessionAdapter(httpClientRequestMock);

      const { onFulfilled } = captured.interceptorPairs[0];

      for (const url of [
        "/api/user/offline",
        "/api/user/logout",
        "/api/user/heartbeat",
      ]) {
        const config = { url, headers: {} };
        const response = {
          data: { code: 401, message: "unauthorized" },
          config,
        };
        await expect(onFulfilled(response)).rejects.toThrow("unauthorized");
      }

      // Should not call clearSession or navigate to login for these urls
      expect(notifyAuthExpiredMock).not.toHaveBeenCalled();
    });
  });

  describe("token provider integration", () => {
    it("returns empty string when getAccessToken is not a function and accessToken is missing", async () => {
      userStoreMock.mockReturnValue({
        accessToken: "",
        getAccessToken: undefined as unknown as ReturnType<typeof vi.fn>,
        setAccessToken: vi.fn(),
        clearSession: vi.fn(),
        logout: vi.fn(),
        restoreSession: vi.fn().mockResolvedValue(true),
        getSessionGeneration: vi.fn().mockReturnValue(0),
      });

      vi.resetModules();
      const { registerAuthSessionAdapter: register } = await import(
        "@/services/auth-session-adapter"
      );
      const localCaptured = captureInterceptors();
      register(httpClientRequestMock);

      const token = localCaptured.provider();
      expect(token).toBe("");
    });

    it("returns accessToken property directly when getAccessToken is not a function", async () => {
      userStoreMock.mockReturnValue({
        accessToken: "direct-token",
        getAccessToken: undefined as unknown as ReturnType<typeof vi.fn>,
        setAccessToken: vi.fn(),
        clearSession: vi.fn(),
        logout: vi.fn(),
        restoreSession: vi.fn().mockResolvedValue(true),
        getSessionGeneration: vi.fn().mockReturnValue(0),
      });

      vi.resetModules();
      const { registerAuthSessionAdapter: register } = await import(
        "@/services/auth-session-adapter"
      );
      const localCaptured = captureInterceptors();
      register(httpClientRequestMock);

      const token = localCaptured.provider();
      expect(token).toBe("direct-token");
    });
  });

  describe("restoreSession integration", () => {
    it("calls restoreSession on the user store after successful refresh", async () => {
      const restoreSession = vi.fn().mockResolvedValue(true);
      userStoreMock.mockReturnValue({
        accessToken: "",
        getAccessToken: vi.fn().mockReturnValue("token"),
        restoreSession,
        setAccessToken: vi.fn(),
        clearSession: vi.fn(),
        logout: vi.fn(),
        getSessionGeneration: vi.fn().mockReturnValue(0),
      });
      refreshMock.mockResolvedValue({ status: "success" });

      vi.resetModules();
      const { registerAuthSessionAdapter: register } = await import(
        "@/services/auth-session-adapter"
      );
      const localCaptured = captureInterceptors();
      register(httpClientRequestMock);

      const { onFulfilled } = localCaptured.interceptorPairs[0];
      const config = { url: "/test", headers: {} };
      const response = {
        data: { code: 401, message: "unauthorized" },
        config,
      };

      httpClientRequestMock.mockResolvedValue({ data: "ok" });
      await onFulfilled(response);

      expect(restoreSession).toHaveBeenCalled();
    });

    it("does not retry if restoreSession returns false", async () => {
      const restoreSession = vi.fn().mockResolvedValue(false);
      userStoreMock.mockReturnValue({
        accessToken: "",
        getAccessToken: vi.fn().mockReturnValue("token"),
        restoreSession,
        setAccessToken: vi.fn(),
        clearSession: vi.fn(),
        logout: vi.fn(),
        getSessionGeneration: vi.fn().mockReturnValue(0),
      });
      refreshMock.mockResolvedValue({ status: "success" });

      vi.resetModules();
      const { registerAuthSessionAdapter: register } = await import(
        "@/services/auth-session-adapter"
      );
      const localCaptured = captureInterceptors();
      register(httpClientRequestMock);

      const { onFulfilled } = localCaptured.interceptorPairs[0];
      const config = { url: "/test", headers: {} };
      const response = {
        data: { code: 401, message: "unauthorized" },
        config,
      };

      await expect(onFulfilled(response)).rejects.toThrow("unauthorized");
      expect(httpClientRequestMock).not.toHaveBeenCalled();
    });
  });
});
