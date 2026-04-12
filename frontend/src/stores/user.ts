import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import router from "@/router";
import { authService, userService } from "@/services";
import { normalizeUser } from "@/normalizers/user";
import type {
  LoginRequest,
  RegisterRequest,
  TokenParseResultDTO,
  UpdateUserRequest,
  User,
} from "@/types";
import { APP_CONFIG, STORAGE_CONFIG } from "@/config";
import { logger } from "@/utils/logger";

const readPersistedAccessToken = (): string => {
  if (typeof localStorage === "undefined") {
    return "";
  }
  const token = localStorage.getItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY);
  return typeof token === "string" ? token.trim() : "";
};

const persistAccessToken = (token: string): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (token) {
    localStorage.setItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY, token);
    return;
  }
  localStorage.removeItem(STORAGE_CONFIG.ACCESS_TOKEN_KEY);
};

const readPersistedUser = (): User | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(STORAGE_CONFIG.USER_SNAPSHOT_KEY);
  if (!raw) {
    return null;
  }
  try {
    return normalizeUser(JSON.parse(raw) as User);
  } catch {
    localStorage.removeItem(STORAGE_CONFIG.USER_SNAPSHOT_KEY);
    return null;
  }
};

const persistUser = (user: User | null): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (!user) {
    localStorage.removeItem(STORAGE_CONFIG.USER_SNAPSHOT_KEY);
    return;
  }
  localStorage.setItem(
    STORAGE_CONFIG.USER_SNAPSHOT_KEY,
    JSON.stringify(user),
  );
};

const isValidTokenResult = (
  result?: TokenParseResultDTO | null,
): result is TokenParseResultDTO & { userId: number } => {
  return !!result && result.valid && !result.expired && result.userId != null;
};

const readUserFromAccessToken = (token: string): User | null => {
  const normalized = token.trim().replace(/^Bearer\s+/i, "");
  const [, payload] = normalized.split(".");
  if (!payload || typeof atob === "undefined") {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const claims = JSON.parse(atob(padded)) as Record<string, unknown>;
    const rawUserId = claims.userId;
    const userId =
      typeof rawUserId === "number" || typeof rawUserId === "string"
        ? String(rawUserId)
        : "";
    if (!userId) {
      return null;
    }
    const username =
      typeof claims.username === "string" && claims.username.trim()
        ? claims.username.trim()
        : userId;
    return {
      id: userId,
      username,
      nickname: username,
      avatar: APP_CONFIG.DEFAULT_AVATAR,
      status: "offline",
    };
  } catch {
    return null;
  }
};

export const useUserStore = defineStore("user", () => {
  const currentUser = ref<User | null>(readPersistedUser());
  const accessToken = ref(readPersistedAccessToken());
  const loading = ref(false);
  const authReady = ref(false);
  const lastSessionCheckAt = ref(0);
  const lastSessionValid = ref(false);
  let sessionCheckInFlight: Promise<boolean> | null = null;

  const isAuthenticated = computed(() => lastSessionValid.value && !!currentUser.value);
  const isLoggedIn = computed(() => isAuthenticated.value);
  const avatar = computed(
    () => currentUser.value?.avatar || APP_CONFIG.DEFAULT_AVATAR,
  );
  const nickname = computed(
    () => currentUser.value?.nickname || currentUser.value?.username || "未知用户",
  );
  const userId = computed(() => currentUser.value?.id || "");
  const userInfo = computed(() => currentUser.value);

  const setAccessToken = (token?: string | null) => {
    const normalized = typeof token === "string" ? token.trim() : "";
    accessToken.value = normalized;
    persistAccessToken(normalized);
  };

  const setCurrentUser = (user?: User | null) => {
    const normalized = user ? normalizeUser(user) : null;
    currentUser.value = normalized;
    persistUser(normalized);
  };

  const getAccessToken = (): string => {
    if (accessToken.value) {
      return accessToken.value;
    }
    const persisted = readPersistedAccessToken();
    if (persisted) {
      accessToken.value = persisted;
    }
    return persisted;
  };

  const clearSession = () => {
    setCurrentUser(null);
    setAccessToken("");
    lastSessionCheckAt.value = 0;
    lastSessionValid.value = false;
    authReady.value = true;
  };

  const markSessionValid = () => {
    lastSessionCheckAt.value = Date.now();
    lastSessionValid.value = true;
    authReady.value = true;
  };

  const markSessionInvalid = () => {
    lastSessionCheckAt.value = Date.now();
    lastSessionValid.value = false;
    authReady.value = true;
  };

  const applyTokenResultUser = (
    result: TokenParseResultDTO & { userId: number },
    persistedUser?: User | null,
  ) => {
    if (persistedUser && persistedUser.id === String(result.userId)) {
      setCurrentUser(persistedUser);
      return;
    }
    setCurrentUser({
      id: String(result.userId),
      username: result.username || String(result.userId),
      nickname: result.username || String(result.userId),
      avatar: APP_CONFIG.DEFAULT_AVATAR,
      status: "offline",
    });
  };

  const restoreFromLocalSnapshot = (persistedUser?: User | null): boolean => {
    const persistedToken = getAccessToken();
    if (!persistedToken || !persistedUser) {
      return false;
    }
    setCurrentUser(persistedUser);
    markSessionValid();
    return true;
  };

  const restoreFromLocalToken = (): boolean => {
    const persistedToken = getAccessToken();
    if (!persistedToken) {
      return false;
    }
    const tokenUser = readUserFromAccessToken(persistedToken);
    if (!tokenUser) {
      return false;
    }
    setCurrentUser(tokenUser);
    markSessionValid();
    return true;
  };

  const refreshPersistedSession = async (
    persistedUser?: User | null,
  ): Promise<boolean> => {
    try {
      const refreshResponse = await authService.refreshAccessToken();
      const nextAccessToken =
        typeof refreshResponse?.data?.accessToken === "string"
          ? refreshResponse.data.accessToken.trim()
          : "";
      if (!nextAccessToken) {
        return false;
      }
      const parseResponse = await authService.parseAccessToken(
        nextAccessToken,
        true,
      );
      const result = parseResponse.data;
      if (!isValidTokenResult(result)) {
        return false;
      }
      setAccessToken(nextAccessToken);
      applyTokenResultUser(result, persistedUser);
      markSessionValid();
      return true;
    } catch (error) {
      logger.warn("refreshPersistedSession failed", error);
      return false;
    }
  };

  const restoreSession = async (): Promise<boolean> => {
    const now = Date.now();
    if (authReady.value && now - lastSessionCheckAt.value < 60_000) {
      return lastSessionValid.value;
    }
    if (sessionCheckInFlight) {
      return sessionCheckInFlight;
    }
    sessionCheckInFlight = (async () => {
      try {
        const persistedToken = getAccessToken();
        const persistedUser = readPersistedUser();
        if (persistedUser) {
          setCurrentUser(persistedUser);
          markSessionValid();
          void refreshPersistedSession(persistedUser);
          return true;
        }
        if (restoreFromLocalToken()) {
          void refreshPersistedSession(currentUser.value);
          return true;
        }
        if (!persistedToken) {
          markSessionInvalid();
          return false;
        }
        let response = await authService.parseAccessToken(
          persistedToken || undefined,
          true,
        );
        let result = response.data;
        let restoredFromCookieSession = false;
        if (
          !isValidTokenResult(result) &&
          (await refreshPersistedSession(persistedUser))
        ) {
          return true;
        }
        if (!isValidTokenResult(result) && persistedToken) {
          response = await authService.parseAccessToken(undefined, true);
          result = response.data;
          restoredFromCookieSession = isValidTokenResult(result);
        }
        if (!isValidTokenResult(result)) {
          if (restoreFromLocalSnapshot(persistedUser)) {
            return true;
          }
          clearSession();
          return false;
        }
        if (restoredFromCookieSession) {
          setAccessToken("");
        }
        applyTokenResultUser(result, persistedUser);
        markSessionValid();
        return true;
      } catch (error) {
        logger.warn("restoreSession failed", error);
        const persistedUser = readPersistedUser();
        if (restoreFromLocalSnapshot(persistedUser)) {
          return true;
        }
        clearSession();
        return false;
      } finally {
        sessionCheckInFlight = null;
      }
    })();
    return sessionCheckInFlight;
  };

  const initializeStore = async () => {
    await restoreSession();
  };

  const init = initializeStore;

  const login = async (loginForm: LoginRequest) => {
    if (loading.value) return false;
    loading.value = true;
    try {
      const username = String(loginForm.username || "").trim();
      const password = String(loginForm.password || "");
      if (!username || !password) {
        throw new Error("请输入用户名和密码");
      }
      const response = await userService.login({ username, password });
      if (!response.data.success) {
        throw new Error(response.data.message || "登录失败");
      }
      setAccessToken(response.data.token);
      setCurrentUser(response.data.user);
      lastSessionCheckAt.value = Date.now();
      lastSessionValid.value = true;
      authReady.value = true;
      ElMessage.success("登录成功");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败";
      ElMessage.error(message);
      return false;
    } finally {
      loading.value = false;
    }
  };

  const register = async (registerForm: RegisterRequest) => {
    if (loading.value) return false;
    loading.value = true;
    try {
      const response = await userService.register({
        username: String(registerForm.username || "").trim(),
        password: registerForm.password,
        nickname:
          String(registerForm.nickname || "").trim() ||
          String(registerForm.username || "").trim(),
        email: registerForm.email?.trim(),
        phone: registerForm.phone?.trim(),
      });
      if (response.code !== 200) {
        throw new Error(response.message || "注册失败");
      }
      ElMessage.success("注册成功，请登录");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "注册失败";
      ElMessage.error(message);
      return false;
    } finally {
      loading.value = false;
    }
  };

  const logout = async () => {
    if (loading.value) {
      return;
    }
    loading.value = true;
    let serverLogoutOk = false;
    try {
      const response = await userService.logout();
      serverLogoutOk = response.code === 200;
    } catch (error) {
      logger.warn("logout failed on server", error);
      serverLogoutOk = false;
    } finally {
      clearSession();
      if (serverLogoutOk) {
        ElMessage.success("已退出登录");
      } else {
        ElMessage.warning("已退出本地登录，服务端会话稍后失效");
      }
      await router.push({ name: "Login" });
      loading.value = false;
    }
  };

  const updateUserInfo = async (userData: UpdateUserRequest) => {
    loading.value = true;
    try {
      const response = await userService.updateProfile(userData);
      setCurrentUser(response.data);
      ElMessage.success("更新成功");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新失败";
      ElMessage.error(message);
      return false;
    } finally {
      loading.value = false;
    }
  };

  const ensureAuthenticated = async (): Promise<boolean> => {
    return restoreSession();
  };

  return {
    currentUser,
    accessToken,
    userInfo,
    loading,
    authReady,
    isAuthenticated,
    isLoggedIn,
    avatar,
    nickname,
    userId,
    login,
    register,
    logout,
    updateUserInfo,
    initializeStore,
    init,
    restoreSession,
    ensureAuthenticated,
    setAccessToken,
    setCurrentUser,
    getAccessToken,
    clearSession,
  };
});
