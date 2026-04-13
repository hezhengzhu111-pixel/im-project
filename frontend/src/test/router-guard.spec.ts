import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureAuthenticated = vi.fn();
const hasPermission = vi.fn();
const warning = vi.fn();
const error = vi.fn();

let beforeEachGuard:
  | ((to: any, from: any, next: (payload?: unknown) => void) => unknown)
  | null = null;

vi.mock("element-plus", () => ({
  ElMessage: {
    warning,
    success: vi.fn(),
    error,
  },
}));

vi.mock("nprogress", () => ({
  default: {
    configure: vi.fn(),
    start: vi.fn(),
    done: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  createWebHistory: vi.fn(() => ({})),
  createRouter: vi.fn(() => ({
    currentRoute: { value: { path: "/" } },
    beforeEach: vi.fn((guard) => {
      beforeEachGuard = guard;
    }),
    afterEach: vi.fn(),
    onError: vi.fn(),
  })),
  isNavigationFailure: vi.fn(() => false),
  NavigationFailureType: {
    duplicated: 16,
    cancelled: 8,
  },
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({
    ensureAuthenticated,
    hasPermission,
  }),
}));

describe("router auth guard", () => {
  beforeEach(async () => {
    vi.resetModules();
    ensureAuthenticated.mockReset();
    hasPermission.mockReset();
    warning.mockReset();
    error.mockReset();
    beforeEachGuard = null;
    hasPermission.mockReturnValue(true);
    await import("@/router");
  });

  it("redirects unauthenticated users to login with redirect", async () => {
    ensureAuthenticated.mockResolvedValue(false);
    const next = vi.fn();

    await beforeEachGuard?.(
      {
        fullPath: "/chat",
        meta: { requiresAuth: true, hideForAuth: false },
      },
      { fullPath: "/" },
      next,
    );

    expect(next).toHaveBeenCalledWith({
      name: "Login",
      query: { redirect: "/chat" },
    });
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("redirects authenticated users away from login", async () => {
    ensureAuthenticated.mockResolvedValue(true);
    const next = vi.fn();

    await beforeEachGuard?.(
      {
        fullPath: "/login",
        meta: { requiresAuth: false, hideForAuth: true },
      },
      { fullPath: "/" },
      next,
    );

    expect(next).toHaveBeenCalledWith({ name: "Chat" });
  });

  it("does not block public pages for guests", async () => {
    ensureAuthenticated.mockResolvedValue(false);
    const next = vi.fn();

    await beforeEachGuard?.(
      {
        fullPath: "/register",
        meta: { requiresAuth: false, hideForAuth: false },
      },
      { fullPath: "/" },
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("blocks admin logs when authenticated user lacks log permission", async () => {
    ensureAuthenticated.mockResolvedValue(true);
    hasPermission.mockReturnValue(false);
    const next = vi.fn();

    await beforeEachGuard?.(
      {
        fullPath: "/admin/logs",
        meta: { requiresAuth: true, hideForAuth: false, permission: "log:read" },
      },
      { fullPath: "/" },
      next,
    );

    expect(hasPermission).toHaveBeenCalledWith("log:read");
    expect(next).toHaveBeenCalledWith({ name: "Chat" });
    expect(error).toHaveBeenCalledTimes(1);
  });
});
