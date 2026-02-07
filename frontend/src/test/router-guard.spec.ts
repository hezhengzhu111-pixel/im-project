import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("element-plus", () => ({
  ElMessage: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/pages/Login.vue", () => ({
  default: { template: "<div>login</div>" },
}));
vi.mock("@/pages/Register.vue", () => ({
  default: { template: "<div>register</div>" },
}));
vi.mock("@/pages/Chat.vue", () => ({
  default: { template: "<div>chat</div>" },
}));

vi.mock("@/stores/user", async () => {
  const { STORAGE_CONFIG } = await import("@/config");
  const decodePayload = (token: string): any => {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
      const json = Buffer.from(parts[1], "base64url").toString("utf8");
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  return {
    useUserStore: () => ({
      async ensureAuthenticated() {
        const token = localStorage.getItem(STORAGE_CONFIG.TOKEN_KEY);
        if (!token) return false;
        const payload = decodePayload(token);
        const exp = payload?.exp;
        if (typeof exp === "number" && exp * 1000 < Date.now()) {
          localStorage.removeItem(STORAGE_CONFIG.TOKEN_KEY);
          localStorage.removeItem(STORAGE_CONFIG.USER_INFO_KEY);
          return false;
        }
        return true;
      },
    }),
  };
});

function b64url(input: any): string {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

describe("router auth guard", () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.resetModules();
  });

  it("redirects unauthenticated users to login with redirect", async () => {
    const router = (await import("@/router")).default;
    await router.push("/chat").catch(() => {});
    await router.isReady();
    expect(router.currentRoute.value.name).toBe("Login");
    expect(router.currentRoute.value.query.redirect).toBe("/chat");
  });

  it("rejects expired token and redirects to login", async () => {
    const { STORAGE_CONFIG } = await import("@/config");
    const expired = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
      exp: Math.floor(Date.now() / 1000) - 60,
      userId: 1,
      username: "u",
    })}.x`;
    localStorage.setItem(STORAGE_CONFIG.TOKEN_KEY, expired);
    localStorage.setItem(
      STORAGE_CONFIG.USER_INFO_KEY,
      JSON.stringify({
        id: "1",
        username: "u",
        nickname: "u",
        avatar: "",
        status: "OFFLINE",
      }),
    );

    const router = (await import("@/router")).default;
    await router.push("/chat").catch(() => {});
    await router.isReady();
    expect(router.currentRoute.value.name).toBe("Login");
  });

  it("does not block public pages", async () => {
    const router = (await import("@/router")).default;
    await router.push("/login").catch(() => {});
    await router.isReady();
    expect(router.currentRoute.value.name).toBe("Login");
  });
});
