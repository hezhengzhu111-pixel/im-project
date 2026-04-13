import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { STORAGE_CONFIG } from "@/config";

const login = vi.fn();
const register = vi.fn();
const logout = vi.fn();
const online = vi.fn();
const parseAccessToken = vi.fn();
const refreshAccessToken = vi.fn();
const refreshAccessTokenCoordinated = vi.fn();
const push = vi.fn();

const createUnsignedAccessToken = (payload: Record<string, unknown>) => {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.sig`;
};

vi.mock("element-plus", () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/services", () => ({
  userService: {
    login,
    register,
    logout,
    online,
  },
  authService: {
    parseAccessToken,
    refreshAccessToken,
  },
}));

vi.mock("@/services/auth-refresh", () => ({
  refreshAccessTokenCoordinated,
}));

vi.mock("@/router", () => ({
  default: {
    currentRoute: { value: { fullPath: "/chat" } },
    push,
  },
}));

describe("user auth store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    login.mockReset();
    register.mockReset();
    logout.mockReset();
    online.mockReset();
    parseAccessToken.mockReset();
    refreshAccessToken.mockReset();
    refreshAccessTokenCoordinated.mockReset();
    push.mockReset();
    localStorage.clear();
    refreshAccessToken.mockResolvedValue({ code: 500, data: {} });
    refreshAccessTokenCoordinated.mockResolvedValue({ status: "transientError" });
  });

  it("trims username before login", async () => {
    login.mockResolvedValue({
      code: 200,
      data: {
        success: true,
        token: "access-token-1",
        user: {
          id: "1",
          username: "u1",
          nickname: "u1",
          status: "offline",
        },
      },
    });
    online.mockResolvedValue({ code: 200, data: "ok" });

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.login({
      username: "  u1  ",
      password: "123456",
    });

    expect(ok).toBe(true);
    expect(login).toHaveBeenCalledWith({
      username: "u1",
      password: "123456",
    });
    expect(store.currentUser?.id).toBe("1");
    expect(store.accessToken).toBe("access-token-1");
    expect(localStorage.getItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY)).toBe(
      "access-token-1",
    );
    expect(localStorage.getItem(STORAGE_CONFIG.USER_SNAPSHOT_KEY)).toContain('"id":"1"');
  });

  it("returns false when register failed", async () => {
    register.mockRejectedValue(new Error("用户名已存在"));

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.register({
      username: "u1",
      password: "123456",
      email: "u1@test.com",
      nickname: "u1",
    });

    expect(ok).toBe(false);
  });

  it("clears local auth state even when server logout fails", async () => {
    logout.mockRejectedValue(new Error("network"));

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();
    store.setAccessToken("to-be-cleared");
    store.currentUser = {
      id: "1",
      username: "u1",
      nickname: "u1",
      status: "offline",
    };

    await store.logout();

    expect(store.currentUser).toBeNull();
    expect(store.accessToken).toBe("");
    expect(localStorage.getItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_CONFIG.USER_SNAPSHOT_KEY)).toBeNull();
    expect(push).toHaveBeenCalled();
  });

  it("prefers persisted access token when restoring session", async () => {
    localStorage.setItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY, "persisted-token");
    parseAccessToken.mockResolvedValue({
      code: 200,
      data: {
        valid: true,
        expired: false,
        userId: "1",
        username: "u1",
      },
    });

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(true);
    expect(parseAccessToken).toHaveBeenCalledWith("persisted-token", true);
    expect(store.currentUser?.id).toBe("1");
  });

  it("falls back to cookie session when persisted access token is invalid", async () => {
    localStorage.setItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY, "stale-token");
    parseAccessToken
      .mockResolvedValueOnce({
        code: 200,
        data: {
          valid: false,
          expired: true,
          userId: null,
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: {
          valid: true,
          expired: false,
          userId: "2",
          username: "u2",
        },
      });

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(true);
    expect(parseAccessToken).toHaveBeenNthCalledWith(1, "stale-token", true);
    expect(parseAccessToken).toHaveBeenNthCalledWith(2, undefined, true);
    expect(refreshAccessTokenCoordinated).not.toHaveBeenCalled();
    expect(store.currentUser?.id).toBe("2");
    expect(store.accessToken).toBe("");
    expect(localStorage.getItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY)).toBeNull();
  });

  it("refreshes an expired persisted access token when restoring session", async () => {
    localStorage.setItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY, "expired-token");
    parseAccessToken
      .mockResolvedValueOnce({
        code: 200,
        data: {
          valid: false,
          expired: true,
          userId: "3",
          username: "u3",
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: {
          valid: false,
          expired: false,
          userId: null,
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: {
          valid: true,
          expired: false,
          userId: "3",
          username: "u3",
        },
      });
    refreshAccessTokenCoordinated.mockResolvedValue({
      status: "success",
      accessToken: "fresh-token",
      expiresInMs: 60_000,
    });

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(true);
    expect(refreshAccessTokenCoordinated).toHaveBeenCalledTimes(1);
    expect(parseAccessToken).toHaveBeenNthCalledWith(1, "expired-token", true);
    expect(parseAccessToken).toHaveBeenNthCalledWith(2, undefined, true);
    expect(parseAccessToken).toHaveBeenNthCalledWith(3, "fresh-token", true);
    expect(store.currentUser?.id).toBe("3");
    expect(store.accessToken).toBe("fresh-token");
    expect(localStorage.getItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY)).toBe(
      "fresh-token",
    );
  });

  it("keeps local snapshot when startup probes cannot revalidate immediately", async () => {
    localStorage.setItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY, "possibly-valid-token");
    localStorage.setItem(
      STORAGE_CONFIG.USER_SNAPSHOT_KEY,
      JSON.stringify({
        id: "4",
        username: "u4",
        nickname: "u4",
        status: "offline",
      }),
    );
    parseAccessToken.mockResolvedValue({
      code: 200,
      data: {
        valid: false,
        expired: false,
        userId: null,
      },
    });
    refreshAccessTokenCoordinated.mockResolvedValue({ status: "transientError" });

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(false);
    expect(store.currentUser?.id).toBe("4");
    expect(store.accessToken).toBe("possibly-valid-token");
    expect(parseAccessToken).toHaveBeenCalledWith("possibly-valid-token", true);
    expect(localStorage.getItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY)).toBe(
      "possibly-valid-token",
    );
    expect(localStorage.getItem(STORAGE_CONFIG.USER_SNAPSHOT_KEY)).toContain(
      '"id":"4"',
    );
  });

  it("does not authenticate from an unsigned persisted access token when backend rejects it", async () => {
    localStorage.setItem(
      STORAGE_CONFIG.ACCESS_TOKEN_KEY,
      createUnsignedAccessToken({
        userId: 5,
        username: "u5",
        typ: "access",
      }),
    );
    parseAccessToken.mockResolvedValue({
      code: 200,
      data: {
        valid: false,
        expired: false,
        userId: null,
      },
    });
    refreshAccessTokenCoordinated.mockResolvedValue({ status: "authInvalid" });

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(false);
    expect(store.currentUser).toBeNull();
    expect(parseAccessToken).toHaveBeenCalled();
  });

  it("probes backend cookie session when there is no local auth state", async () => {
    parseAccessToken.mockResolvedValue({
      code: 200,
      data: {
        valid: true,
        expired: false,
        userId: "6",
        username: "u6",
        permissions: ["log:read"],
      },
    });

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(true);
    expect(parseAccessToken).toHaveBeenCalledWith(undefined, true);
    expect(store.currentUser?.id).toBe("6");
    expect(store.hasPermission("log:read")).toBe(true);
  });

  it("keeps persisted session on transient restore failure", async () => {
    localStorage.setItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY, "persisted-token");
    localStorage.setItem(
      STORAGE_CONFIG.USER_SNAPSHOT_KEY,
      JSON.stringify({
        id: "9",
        username: "u9",
        nickname: "u9",
        status: "offline",
      }),
    );
    parseAccessToken.mockRejectedValue(new Error("network"));
    refreshAccessTokenCoordinated.mockResolvedValue({ status: "transientError" });

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(false);
    expect(store.currentUser?.id).toBe("9");
    expect(store.accessToken).toBe("persisted-token");
    expect(store.isAuthenticated).toBe(false);
  });
});
