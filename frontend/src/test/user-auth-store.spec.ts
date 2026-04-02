import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { STORAGE_CONFIG } from "@/config";

const login = vi.fn();
const register = vi.fn();
const logout = vi.fn();
const online = vi.fn();
const parseAccessToken = vi.fn();
const push = vi.fn();

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
  },
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
    push.mockReset();
    localStorage.clear();
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
    expect(store.currentUser?.id).toBe("2");
    expect(store.accessToken).toBe("");
    expect(localStorage.getItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY)).toBeNull();
  });

  it("does not probe auth parse when there is no local auth state", async () => {
    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(false);
    expect(parseAccessToken).not.toHaveBeenCalled();
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

    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.restoreSession();

    expect(ok).toBe(true);
    expect(store.currentUser?.id).toBe("9");
    expect(store.accessToken).toBe("persisted-token");
  });
});
