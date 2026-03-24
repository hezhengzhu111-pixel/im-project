import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const logout = vi.fn(async () => true);
const setAuthToken = vi.fn();
const warning = vi.fn();
const error = vi.fn();

const mockStore = {
  token: "old-access",
  logout,
  setAuthToken,
};

type MockItem = {
  status?: number;
  data?: any;
  httpError?: boolean;
};

const responseQueue: Record<string, MockItem[]> = {};
let requestOnFulfilled: ((config: any) => any) | null = null;
let requestOnRejected: ((error: any) => any) | null = null;
let responseOnFulfilled: ((response: any) => any) | null = null;
let responseOnRejected: ((error: any) => any) | null = null;
const axiosPost = vi.fn();

const dispatch = async (config: any) => {
  let nextConfig = config;
  if (requestOnFulfilled) {
    nextConfig = await requestOnFulfilled(nextConfig);
  }
  const url = String(nextConfig?.url || "");
  const q = responseQueue[url] || [];
  const item = q.shift();
  if (!item) {
    const fallbackError = { response: { status: 500, statusText: "NoMock" } };
    if (responseOnRejected) return responseOnRejected(fallbackError);
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
    if (responseOnRejected) return responseOnRejected(httpError);
    throw httpError;
  }
  const response = {
    data: item.data,
    status: item.status || 200,
    config: nextConfig,
  };
  if (responseOnFulfilled) return responseOnFulfilled(response);
  return response;
};

const requestInstance: any = vi.fn((config: any) => dispatch(config));
requestInstance.get = (url: string, config?: any) =>
  dispatch({ ...(config || {}), method: "get", url });
requestInstance.post = (url: string, data?: any, config?: any) =>
  dispatch({ ...(config || {}), method: "post", url, data });
requestInstance.put = (url: string, data?: any, config?: any) =>
  dispatch({ ...(config || {}), method: "put", url, data });
requestInstance.delete = (url: string, config?: any) =>
  dispatch({ ...(config || {}), method: "delete", url });
requestInstance.patch = (url: string, data?: any, config?: any) =>
  dispatch({ ...(config || {}), method: "patch", url, data });
requestInstance.interceptors = {
  request: {
    use: (ok: any, fail: any) => {
      requestOnFulfilled = ok;
      requestOnRejected = fail;
    },
  },
  response: {
    use: (ok: any, fail: any) => {
      responseOnFulfilled = ok;
      responseOnRejected = fail;
    },
  },
};

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => requestInstance),
    post: axiosPost,
  },
}));

vi.mock("element-plus", () => ({
  ElMessage: {
    warning,
    error,
  },
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => mockStore,
}));

vi.mock("@/router", () => ({
  default: {
    push,
  },
}));

describe("request refresh and retry", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.keys(responseQueue).forEach((k) => delete responseQueue[k]);
    requestOnFulfilled = null;
    requestOnRejected = null;
    responseOnFulfilled = null;
    responseOnRejected = null;
    axiosPost.mockReset();
    logout.mockReset();
    setAuthToken.mockReset();
    push.mockReset();
    warning.mockReset();
    error.mockReset();
    localStorage.clear();
    mockStore.token = "old-access";
  });

  it("refreshes token and retries once on 401 business response", async () => {
    localStorage.setItem("im_refresh_token", "old-refresh");
    responseQueue["/secure"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: true } } },
    ];
    axiosPost.mockResolvedValue({
      data: {
        code: 200,
        data: {
          accessToken: "new-access",
          refreshToken: "new-refresh",
        },
      },
    });
    const { http } = await import("@/utils/request");
    const resp = await http.get<{ ok: boolean }>("/secure");
    expect(resp.code).toBe(200);
    expect(resp.data.ok).toBe(true);
    expect(axiosPost).toHaveBeenCalledWith(
      "/api/auth/refresh",
      { refreshToken: "old-refresh" },
      expect.any(Object),
    );
    expect(setAuthToken).toHaveBeenCalledWith("new-access", "new-refresh");
    expect(logout).not.toHaveBeenCalled();
  });

  it("silently redirects to login when refresh failed", async () => {
    localStorage.setItem("im_refresh_token", "old-refresh");
    responseQueue["/secure"] = [{ data: { code: 401, message: "未授权" } }];
    axiosPost.mockResolvedValue({
      data: { code: 500, message: "refresh failed" },
    });
    const { http } = await import("@/utils/request");
    await expect(http.get("/secure")).rejects.toThrow();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("shares one refresh call for concurrent 401 requests", async () => {
    localStorage.setItem("im_refresh_token", "old-refresh");
    responseQueue["/secure-a"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: "a" } } },
    ];
    responseQueue["/secure-b"] = [
      { data: { code: 401, message: "未授权" } },
      { data: { code: 200, message: "ok", data: { ok: "b" } } },
    ];
    axiosPost.mockImplementation(
      async () =>
        await new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: {
                  code: 200,
                  data: {
                    accessToken: "new-access",
                    refreshToken: "new-refresh",
                  },
                },
              }),
            10,
          ),
        ),
    );
    const { http } = await import("@/utils/request");
    const [a, b] = await Promise.all([
      http.get("/secure-a"),
      http.get("/secure-b"),
    ]);
    expect(a.code).toBe(200);
    expect(b.code).toBe(200);
    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(setAuthToken).toHaveBeenCalledWith("new-access", "new-refresh");
  });
});
