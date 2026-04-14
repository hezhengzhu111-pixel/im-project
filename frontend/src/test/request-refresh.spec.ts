import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const warning = vi.fn();
const error = vi.fn();
const restoreSession = vi.fn();
const clearSession = vi.fn();
const logout = vi.fn();
const refreshAccessTokenCoordinated = vi.fn();
let currentAccessToken = "";
let sessionGeneration = 0;

type MockItem = {
  status?: number;
  data?: unknown;
  httpError?: boolean;
};

const responseQueue: Record<string, MockItem[]> = {};
const observedRequests: Record<string, Array<{ headers: Record<string, unknown> }>> = {};
let requestOnFulfilled: ((config: Record<string, unknown>) => unknown) | null = null;
let responseOnFulfilled:
  | ((response: { data: unknown; status: number; config: Record<string, unknown> }) => unknown)
  | null = null;
let responseOnRejected: ((error: unknown) => unknown) | null = null;

const snapshotHeaders = (headers: unknown): Record<string, unknown> => {
  if (!headers || typeof headers !== "object") {
    return {};
  }
  return { ...(headers as Record<string, unknown>) };
};

const dispatch = async (config: Record<string, unknown>) => {
  const nextConfig = requestOnFulfilled
    ? ((await requestOnFulfilled(config)) as Record<string, unknown>)
    : config;
  const url = String(nextConfig.url || "");
  if (!observedRequests[url]) {
    observedRequests[url] = [];
  }
  observedRequests[url].push({
    headers: snapshotHeaders(nextConfig.headers),
  });
  const queue = responseQueue[url] || [];
  const item = queue.shift();
  if (!item) {
    const fallbackError = {
      response: { status: 500, statusText: "NoMock" },
      config: nextConfig,
    };
    if (responseOnRejected) {
      return responseOnRejected(fallbackError);
    }
    throw fallbackError;
  }

  if (item.httpError) {
    const httpError = {
      response: {
        status: item.status || 401,
        statusText: "Unauthorized",
      },
      config: nextConfig,
    };
    if (responseOnRejected) {
      return responseOnRejected(httpError);
    }
    throw httpError;
  }

  const response = {
    data: item.data,
    status: item.status || 200,
    config: nextConfig,
  };
  if (responseOnFulfilled) {
    return responseOnFulfilled(response);
  }
  return response;
};

const requestInstance: Record<string, unknown> = vi.fn((config: Record<string, unknown>) =>
  dispatch(config),
) as unknown as Record<string, unknown>;
(requestInstance as any).get = (url: string, config?: Record<string, unknown>) =>
  dispatch({ ...(config || {}), method: "get", url });
(requestInstance as any).post = (
  url: string,
  data?: unknown,
  config?: Record<string, unknown>,
) => dispatch({ ...(config || {}), method: "post", url, data });
(requestInstance as any).put = (
  url: string,
  data?: unknown,
  config?: Record<string, unknown>,
) => dispatch({ ...(config || {}), method: "put", url, data });
(requestInstance as any).delete = (url: string, config?: Record<string, unknown>) =>
  dispatch({ ...(config || {}), method: "delete", url });
(requestInstance as any).patch = (
  url: string,
  data?: unknown,
  config?: Record<string, unknown>,
) => dispatch({ ...(config || {}), method: "patch", url, data });
(requestInstance as any).interceptors = {
  request: {
    use: (ok: (config: Record<string, unknown>) => unknown) => {
      requestOnFulfilled = ok;
    },
  },
  response: {
    use: (
      ok: (response: {
        data: unknown;
        status: number;
        config: Record<string, unknown>;
      }) => unknown,
      fail: (error: unknown) => unknown,
    ) => {
      responseOnFulfilled = ok;
      responseOnRejected = fail;
    },
  },
};

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => requestInstance),
  },
}));

vi.mock("element-plus", () => ({
  ElMessage: {
    warning,
    error,
  },
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({
    accessToken: currentAccessToken,
    getAccessToken: () => currentAccessToken,
    setAccessToken: (token?: string | null) => {
      currentAccessToken = typeof token === "string" ? token : "";
      sessionGeneration += 1;
    },
    getSessionGeneration: () => sessionGeneration,
    restoreSession,
    clearSession,
    logout,
  }),
}));

vi.mock("@/services/auth-refresh", () => ({
  refreshAccessTokenCoordinated,
}));

vi.mock("@/router", () => ({
  default: {
    currentRoute: {
      value: {
        path: "/chat",
      },
    },
    push,
  },
}));

describe("request refresh and retry", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.keys(responseQueue).forEach((key) => delete responseQueue[key]);
    Object.keys(observedRequests).forEach((key) => delete observedRequests[key]);
    requestOnFulfilled = null;
    responseOnFulfilled = null;
    responseOnRejected = null;
    refreshAccessTokenCoordinated.mockReset();
    restoreSession.mockReset();
    clearSession.mockReset();
    logout.mockReset();
    push.mockReset();
    warning.mockReset();
    error.mockReset();
    currentAccessToken = "";
    sessionGeneration = 0;
    localStorage.clear();
    restoreSession.mockResolvedValue(true);
  });

  it("refreshes session and retries once on 401 business response with latest token", async () => {
    currentAccessToken = "old-token";
    responseQueue["/secure"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: true } } },
    ];
    refreshAccessTokenCoordinated.mockResolvedValue({
      status: "success",
      accessToken: "new-token",
      expiresInMs: 60_000,
    });

    const { http } = await import("@/utils/request");
    const response = await http.get<{ ok: boolean }>("/secure");

    expect(response.code).toBe(200);
    expect(response.data.ok).toBe(true);
    expect(refreshAccessTokenCoordinated).toHaveBeenCalledTimes(1);
    expect(restoreSession).toHaveBeenCalledTimes(1);
    expect(clearSession).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(observedRequests["/secure"]).toHaveLength(2);
    expect(observedRequests["/secure"][0].headers.Authorization).toBe("Bearer old-token");
    expect(observedRequests["/secure"][1].headers.Authorization).toBe("Bearer new-token");
    expect(currentAccessToken).toBe("new-token");
  });

  it("clears session and redirects to login when refresh failed", async () => {
    responseQueue["/secure"] = [{ data: { code: 401, message: "未授权" } }];
    refreshAccessTokenCoordinated.mockResolvedValue({
      status: "authInvalid",
      message: "refresh failed",
    });

    const { http } = await import("@/utils/request");
    await expect(http.get("/secure")).rejects.toThrow("未授权");

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("retries HTTP 401 requests with the refreshed token", async () => {
    currentAccessToken = "expired-token";
    responseQueue["/secure-http"] = [
      { httpError: true, status: 401 },
      { data: { code: 200, message: "ok", data: { ok: true } } },
    ];
    refreshAccessTokenCoordinated.mockResolvedValue({
      status: "success",
      accessToken: "fresh-token",
      expiresInMs: 60_000,
    });

    const { http } = await import("@/utils/request");
    const response = await http.get<{ ok: boolean }>("/secure-http");

    expect(response.code).toBe(200);
    expect(observedRequests["/secure-http"]).toHaveLength(2);
    expect(observedRequests["/secure-http"][0].headers.Authorization).toBe(
      "Bearer expired-token",
    );
    expect(observedRequests["/secure-http"][1].headers.Authorization).toBe(
      "Bearer fresh-token",
    );
  });

  it("shares a single refresh request for concurrent 401 responses", async () => {
    currentAccessToken = "old-token";
    responseQueue["/secure-a"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: "a" } } },
    ];
    responseQueue["/secure-b"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: "b" } } },
    ];
    const sharedRefresh = new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            status: "success",
            accessToken: "shared-token",
            expiresInMs: 60_000,
          }),
        10,
      ),
    );
    refreshAccessTokenCoordinated.mockReturnValue(sharedRefresh);

    const { http } = await import("@/utils/request");
    const [responseA, responseB] = await Promise.all([
      http.get<{ ok: string }>("/secure-a"),
      http.get<{ ok: string }>("/secure-b"),
    ]);

    expect(responseA.code).toBe(200);
    expect(responseB.code).toBe(200);
    expect(refreshAccessTokenCoordinated).toHaveBeenCalledTimes(2);
    expect(restoreSession).toHaveBeenCalledTimes(2);
    expect(observedRequests["/secure-a"][1].headers.Authorization).toBe(
      "Bearer shared-token",
    );
    expect(observedRequests["/secure-b"][1].headers.Authorization).toBe(
      "Bearer shared-token",
    );
  });

  it("clears auth session only once for concurrent 401 failures", async () => {
    currentAccessToken = "expired-token";
    responseQueue["/secure-a"] = [{ data: { code: 401, message: "未授权" } }];
    responseQueue["/secure-b"] = [{ data: { code: 401, message: "未授权" } }];
    refreshAccessTokenCoordinated.mockResolvedValue({
      status: "authInvalid",
      message: "refresh failed",
    });

    const { http } = await import("@/utils/request");
    await Promise.allSettled([http.get("/secure-a"), http.get("/secure-b")]);

    expect(refreshAccessTokenCoordinated).toHaveBeenCalledTimes(2);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("does not clear session after refresh failure if another request already updated it", async () => {
    currentAccessToken = "expired-token";
    responseQueue["/secure"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: true } } },
    ];
    refreshAccessTokenCoordinated.mockImplementation(async () => {
      currentAccessToken = "newer-token";
      sessionGeneration += 1;
      return { status: "authInvalid", message: "old refresh rejected" };
    });

    const { http } = await import("@/utils/request");
    const response = await http.get<{ ok: boolean }>("/secure");

    expect(response.code).toBe(200);
    expect(clearSession).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(currentAccessToken).toBe("newer-token");
  });

  it("does not refresh or prompt relogin for auth parse probes", async () => {
    responseQueue["/auth/parse"] = [{ httpError: true, status: 401 }];

    const { http } = await import("@/utils/request");
    await expect(
      http.post("/auth/parse", { allowExpired: true }),
    ).rejects.toMatchObject({
      response: {
        status: 401,
      },
    });

    expect(refreshAccessTokenCoordinated).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
