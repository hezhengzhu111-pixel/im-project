import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const loginWithPassword = vi.fn();
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
  userApi: {
    loginWithPassword,
    register,
    logout,
    online,
  },
  authApi: {
    parseAccessToken,
  },
}));

vi.mock("@/router", () => ({
  default: {
    currentRoute: { value: { fullPath: "/chat" } },
    push,
  },
}));

describe("user auth store optimize", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    loginWithPassword.mockReset();
    register.mockReset();
    logout.mockReset();
    parseAccessToken.mockReset();
    online.mockReset();
    push.mockReset();
  });

  it("trims username before login", async () => {
    loginWithPassword.mockResolvedValue({
      success: true,
      user: { id: "1", username: "u1", nickname: "u1", status: "OFFLINE" },
      token: "token",
      refreshToken: "refresh-token",
    });
    online.mockResolvedValue({ code: 200, data: "ok" });
    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();

    const ok = await store.login({
      username: "  u1  ",
      password: "123456",
    } as any);

    expect(ok).toBe(true);
    expect(loginWithPassword).toHaveBeenCalledWith("u1", "123456");
    expect(online).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("im_refresh_token")).toBe("refresh-token");
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
    } as any);

    expect(ok).toBe(false);
  });

  it("clears local session even when server logout fails", async () => {
    logout.mockRejectedValue(new Error("network"));
    localStorage.setItem("im_token", "token");
    localStorage.setItem("im_user_info", JSON.stringify({ id: "1" }));
    const { useUserStore } = await import("@/stores/user");
    const store = useUserStore();
    store.init();

    await store.logout();

    expect(localStorage.getItem("im_token")).toBeNull();
    expect(push).toHaveBeenCalled();
  });
});
