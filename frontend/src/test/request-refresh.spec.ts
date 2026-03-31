import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const warning = vi.fn();
const error = vi.fn();
const restoreSession = vi.fn();
const clearSession = vi.fn();
const logout = vi.fn();
const refreshAccessTokenRaw = vi.fn();

type MockItem = {
  status?: number;
  data?: unknown;
  httpError?: boolean;
};

const responseQueue: Record<string, MockItem[]> = {};
let requestOnFulfilled: ((config: Record<string, unknown>) => unknown) | null = null;
let responseOnFulfilled:
  | ((response: { data: unknown; status: number; config: Record<string, unknown> }) => unknown)
  | null = null;
let responseOnRejected: ((error: unknown) => unknown) | null = null;

const dispatch = async (config: Record<string, unknown>) => {
  const nextConfig = requestOnFulfilled
    ? ((await requestOnFulfilled(config)) as Record<string, unknown>)
    : config;
  const url = String(nextConfig.url || "");
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

vi.mock("nprogress", () => ({
  default: {
    configure: vi.fn(),
    start: vi.fn(),
    done: vi.fn(),
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
    restoreSession,
    clearSession,
    logout,
  }),
}));

vi.mock("@/services/auth-refresh", () => ({
  refreshAccessTokenRaw,
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
    requestOnFulfilled = null;
    responseOnFulfilled = null;
    responseOnRejected = null;
    refreshAccessTokenRaw.mockReset();
    restoreSession.mockReset();
    clearSession.mockReset();
    logout.mockReset();
    push.mockReset();
    warning.mockReset();
    error.mockReset();
    restoreSession.mockResolvedValue(true);
  });

  it("refreshes session and retries once on 401 business response", async () => {
    responseQueue["/secure"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: true } } },
    ];
    refreshAccessTokenRaw.mockResolvedValue({
      data: {
        code: 200,
        data: {
          expiresInMs: 60_000,
        },
      },
    });

    const { http } = await import("@/utils/request");
    const response = await http.get<{ ok: boolean }>("/secure");

    expect(response.code).toBe(200);
    expect(response.data.ok).toBe(true);
    expect(refreshAccessTokenRaw).toHaveBeenCalledTimes(1);
    expect(refreshAccessTokenRaw).toHaveBeenCalledWith(expect.any(String));
    expect(restoreSession).toHaveBeenCalledTimes(1);
    expect(clearSession).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("clears session and redirects to login when refresh failed", async () => {
    responseQueue["/secure"] = [{ data: { code: 401, message: "未授权" } }];
    refreshAccessTokenRaw.mockResolvedValue({
      data: { code: 500, message: "refresh failed" },
    });

    const { http } = await import("@/utils/request");
    await expect(http.get("/secure")).rejects.toThrow("未授权");

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("shares a single refresh request for concurrent 401 responses", async () => {
    responseQueue["/secure-a"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: "a" } } },
    ];
    responseQueue["/secure-b"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: "b" } } },
    ];
    refreshAccessTokenRaw.mockImplementation(
      async () =>
        await new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: {
                  code: 200,
                  data: {
                    expiresInMs: 60_000,
                  },
                },
              }),
            10,
          ),
        ),
    );

    const { http } = await import("@/utils/request");
    const [responseA, responseB] = await Promise.all([
      http.get<{ ok: string }>("/secure-a"),
      http.get<{ ok: string }>("/secure-b"),
    ]);

    expect(responseA.code).toBe(200);
    expect(responseB.code).toBe(200);
    expect(refreshAccessTokenRaw).toHaveBeenCalledTimes(1);
    expect(restoreSession).toHaveBeenCalledTimes(1);
  });
});
