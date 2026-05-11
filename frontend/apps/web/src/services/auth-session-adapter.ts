import { useUserStore } from "@/stores/user";
import {
  refreshAccessTokenCoordinated,
  type RefreshAccessTokenStatus,
} from "@/services/auth-refresh";
import {
  registerAccessTokenProvider,
  registerRequestInterceptor,
  registerResponseInterceptor,
  getHeaderValue,
  setHeaderValue,
  shouldSkipRefresh,
} from "@/utils/httpClient";
import { notifyAuthExpired } from "@/services/http-error-notifier";
import router from "@/router";

type UserStoreLike = {
  accessToken?: string;
  getAccessToken?: () => string;
  setAccessToken?: (token?: string | null) => void;
  restoreSession?: () => Promise<boolean> | boolean;
  clearSession?: () => void;
  logout?: () => Promise<unknown> | unknown;
  getSessionGeneration?: () => number;
};

type HeaderBag = Record<string, unknown> & {
  get?: (name: string) => unknown;
  set?: (name: string, value: string) => unknown;
  delete?: (name: string) => unknown;
};

const getUserStore = (): UserStoreLike => useUserStore() as UserStoreLike;

const getLatestAccessToken = (): string => {
  const userStore = getUserStore();
  if (typeof userStore.getAccessToken === "function") {
    return String(userStore.getAccessToken() || "").trim();
  }
  if (
    typeof userStore.accessToken === "string" &&
    userStore.accessToken.trim()
  ) {
    return userStore.accessToken.trim();
  }
  return "";
};

let reauthPromptInFlight = false;
let clearAuthSessionInFlight: Promise<void> | null = null;

const clearAuthSession = async () => {
  if (clearAuthSessionInFlight) {
    return clearAuthSessionInFlight;
  }
  clearAuthSessionInFlight = (async () => {
    const userStore = getUserStore();
    if (typeof userStore.clearSession === "function") {
      userStore.clearSession();
      return;
    }
    if (typeof userStore.logout === "function") {
      await userStore.logout();
    }
  })().finally(() => {
    clearAuthSessionInFlight = null;
  });
  return clearAuthSessionInFlight;
};

const promptReLogin = () => {
  if (reauthPromptInFlight) return;
  reauthPromptInFlight = true;
  notifyAuthExpired();
  Promise.resolve()
    .then(() => {
      if (router.currentRoute?.value?.path !== "/login") {
        return router.push("/login");
      }
      return undefined;
    })
    .finally(() => {
      reauthPromptInFlight = false;
    });
};

const getSessionGeneration = (): number => {
  const userStore = getUserStore();
  return typeof userStore.getSessionGeneration === "function"
    ? userStore.getSessionGeneration()
    : 0;
};

const hasSessionChangedSince = (
  tokenBeforeRefresh?: string,
  generationBeforeRefresh?: number,
) => {
  const latestToken = getLatestAccessToken();
  if (latestToken && latestToken !== (tokenBeforeRefresh || "")) {
    return true;
  }
  return getSessionGeneration() > (generationBeforeRefresh || 0);
};

const tryRefreshAccessToken = async (
  config?: Record<string, unknown>,
): Promise<boolean> => {
  const tokenBeforeRefresh = getLatestAccessToken();
  const generationBeforeRefresh = getSessionGeneration();
  if (config) {
    config.__authTokenBeforeRefresh = tokenBeforeRefresh;
    config.__authGenerationBeforeRefresh = generationBeforeRefresh;
  }

  const refreshResult = await refreshAccessTokenCoordinated();
  if (config) {
    config.__refreshStatus = refreshResult.status;
  }
  if (refreshResult.status !== "success") {
    return hasSessionChangedSince(tokenBeforeRefresh, generationBeforeRefresh);
  }

  try {
    const userStore = getUserStore();
    const restored =
      typeof userStore.restoreSession === "function"
        ? await userStore.restoreSession()
        : true;
    if (restored === false) {
      return hasSessionChangedSince(
        tokenBeforeRefresh,
        generationBeforeRefresh,
      );
    }
  } catch {
    return hasSessionChangedSince(tokenBeforeRefresh, generationBeforeRefresh);
  }
  return true;
};

const shouldClearSession = (url?: string) =>
  !url?.includes("/user/offline") &&
  !url?.includes("/user/logout") &&
  !url?.includes("/user/heartbeat");

const getRefreshStatus = (
  config?: Record<string, unknown>,
): RefreshAccessTokenStatus | "" => {
  const status = config?.__refreshStatus;
  return status === "success" ||
    status === "authInvalid" ||
    status === "transientError"
    ? status
    : "";
};

const shouldClearAfterRefreshFailure = (config?: Record<string, unknown>) => {
  if (getRefreshStatus(config) !== "authInvalid") {
    return false;
  }
  const tokenBeforeRefresh =
    typeof config?.__authTokenBeforeRefresh === "string"
      ? config.__authTokenBeforeRefresh
      : "";
  const generationBeforeRefresh =
    typeof config?.__authGenerationBeforeRefresh === "number"
      ? config.__authGenerationBeforeRefresh
      : 0;
  return !hasSessionChangedSince(tokenBeforeRefresh, generationBeforeRefresh);
};

const retryWithFreshAccessToken = async (
  config: Record<string, unknown>,
  httpClientRequest: (config: Record<string, unknown>) => Promise<unknown>,
) => {
  if (config.__retry401 || shouldSkipRefresh(String(config.url || ""))) {
    return null;
  }
  config.__retry401 = true;
  const refreshed = await tryRefreshAccessToken(config);
  if (!refreshed) {
    return null;
  }
  const headers = (config.headers || {}) as HeaderBag;
  config.headers = headers;
  const latestAccessToken = getLatestAccessToken();
  if (latestAccessToken) {
    setHeaderValue(headers, "Authorization", `Bearer ${latestAccessToken}`);
  } else {
    setHeaderValue(headers, "Authorization");
  }
  return httpClientRequest(config);
};

const postRefreshFailure = (config?: Record<string, unknown>): void => {
  if (
    shouldClearSession(String(config?.url || "")) &&
    shouldClearAfterRefreshFailure(config)
  ) {
    clearAuthSession();
    promptReLogin();
  }
};

/**
 * Register all auth-related interceptors with the httpClient.
 * Called once during application initialization.
 */
export const registerAuthSessionAdapter = (
  httpClientRequest: (config: Record<string, unknown>) => Promise<unknown>,
): void => {
  // 1. Register access token provider
  registerAccessTokenProvider(getLatestAccessToken);

  // 2. Register request interceptor (no-op, token injection handled by httpClient base interceptor)
  registerRequestInterceptor((config) => config);

  // 3. Register response interceptor for 401 handling
  registerResponseInterceptor(
    // Business 401 handler
    async (response) => {
      const responseData =
        response.data && typeof response.data === "object"
          ? (response.data as Record<string, unknown>)
          : {};

      if (
        "success" in responseData &&
        typeof responseData.success === "boolean"
      ) {
        return response;
      }

      const { code, message } = responseData;
      const messageText = typeof message === "string" ? message : "";

      if (code === 401) {
        if (shouldSkipRefresh(response.config?.url)) {
          return Promise.reject(
            new Error(messageText || "未授权"),
          );
        }
        const config = response.config as any;
        const retried = await retryWithFreshAccessToken(
          config,
          httpClientRequest,
        );
        if (retried) {
          return retried;
        }
        postRefreshFailure(config);
        return Promise.reject(
          new Error(messageText || "未授权"),
        );
      }

      return response;
    },
    // HTTP 401 handler
    async (error) => {
      if (!error?.response) {
        return Promise.reject(error);
      }

      const { status } = error.response;
      if (status !== 401) {
        return Promise.reject(error);
      }

      if (shouldSkipRefresh(error.config?.url)) {
        return Promise.reject(error);
      }

      const config = error.config as any;
      const retried = await retryWithFreshAccessToken(
        config,
        httpClientRequest,
      );
      if (retried) {
        return retried;
      }
      postRefreshFailure(config);
      return Promise.reject(error);
    },
  );
};
