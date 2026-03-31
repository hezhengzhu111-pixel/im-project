import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

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
  });

  it("trims username before login", async () => {
    login.mockResolvedValue({
      code: 200,
      data: {
        success: true,
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
    store.currentUser = {
      id: "1",
      username: "u1",
      nickname: "u1",
      status: "offline",
    };

    await store.logout();

    expect(store.currentUser).toBeNull();
    expect(push).toHaveBeenCalled();
  });
});
