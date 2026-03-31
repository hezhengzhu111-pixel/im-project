import axios from "axios";
import qs from "qs";

import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { ElMessage } from "element-plus";
import { useUserStore } from "@/stores/user";
import type { ApiResponse } from "@/types/api";
import router from "@/router";
import NProgress from "nprogress";
import { refreshAccessTokenRaw } from "@/services/auth-refresh";
import { logger } from "@/utils/logger";

function createTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let refreshInFlight: Promise<boolean> | null = null;
let reauthPromptInFlight = false;

const clearAuthSession = async () => {
  const userStore = useUserStore() as {
    clearSession?: () => void;
    logout?: () => Promise<unknown> | unknown;
  };
  if (typeof userStore.clearSession === "function") {
    userStore.clearSession();
    return;
  }
  if (typeof userStore.logout === "function") {
    await userStore.logout();
  }
};

const shouldSkipRefresh = (url?: string) => {
  if (!url) return false;
  return (
    url.includes("/auth/refresh") ||
    url.includes("/user/login") ||
    url.includes("/user/register") ||
    url.includes("/user/logout") ||
    url.includes("/user/offline") ||
    url.includes("/user/online") ||
    url.includes("/user/heartbeat")
  );
};

const promptReLogin = () => {
  if (reauthPromptInFlight) return;
  reauthPromptInFlight = true;
  ElMessage.warning("登录状态已过期，已为您跳转到登录页");
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

const tryRefreshAccessToken = async (): Promise<boolean> => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await refreshAccessTokenRaw(createTraceId());
      const payload = response?.data;
      if (payload?.code !== 200) {
        return false;
      }
      try {
        const userStore = useUserStore();
        await userStore.restoreSession();
      } catch {
        return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
};

// 创建axios实例
const request: AxiosInstance = axios.create({
  baseURL: "/api",
  timeout: 10000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json;charset=UTF-8",
  },
  paramsSerializer: (params) => {
    return qs.stringify(params, { arrayFormat: "repeat", skipNulls: true });
  },
});

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 显示进度条
    NProgress.start();

    if (config.headers) {
      config.headers["X-Gateway-Route"] = "true";
      const existingTraceId =
        config.headers["X-Trace-Id"] ||
        (typeof config.headers.get === "function"
          ? config.headers.get("X-Trace-Id")
          : undefined);
      config.headers["X-Trace-Id"] = String(existingTraceId || createTraceId());
    }

    // 添加请求时间戳（防止缓存）
    if (config.method === "get") {
      config.params = {
        ...config.params,
        _t: Date.now(),
      };
    }

    return config;
  },
  (error) => {
    NProgress.done();
    logger.error("request interceptor failed", error);
    return Promise.reject(error);
  },
);

// 响应拦截器
request.interceptors.response.use(
  async (response: AxiosResponse<unknown>) => {
    NProgress.done();

    const responseData = response.data as Record<string, unknown>;

    // 处理UserAuthResponse格式（登录接口）
    if (
      "success" in responseData &&
      typeof responseData.success === "boolean"
    ) {
      if (responseData.success) {
        return responseData;
      } else {
        ElMessage.error(responseData.message || "操作失败");
        return Promise.reject(new Error(responseData.message || "操作失败"));
      }
    }

    // 处理ApiResponse格式（其他接口）
    const { code, message } = responseData;

    // 成功响应
    if (code === 200) {
      return responseData;
    }

    // 如果响应数据直接是数组或对象（没有包装 code/message/data），且 HTTP 状态码为 200，则视为成功
    // 这是为了兼容 getUserGroups 接口直接返回 List<GroupInfoDTO> 的情况
    if (
      code === undefined &&
      message === undefined &&
      response.status === 200
    ) {
      return {
        code: 200,
        message: "success",
        data: responseData,
        success: true,
        timestamp: Date.now(),
      } as ApiResponse<unknown>;
    }

    // 业务错误
    if (code === 401) {
      const config = response.config as any;
      if (!config?.__retry401 && !shouldSkipRefresh(response.config.url)) {
        config.__retry401 = true;
        const refreshed = await tryRefreshAccessToken();
        if (refreshed) {
          return request(config);
        }
      }
      if (
        !response.config.url?.includes("/user/offline") &&
        !response.config.url?.includes("/user/logout") &&
        !response.config.url?.includes("/user/online") &&
        !response.config.url?.includes("/user/heartbeat")
      ) {
        await clearAuthSession();
      }
      promptReLogin();

      return Promise.reject(new Error(message || "未授权"));
    }

    if (code === 403) {
      ElMessage.error("权限不足");
      return Promise.reject(new Error(message || "权限不足"));
    }

    if (code === 404) {
      ElMessage.error("请求的资源不存在");
      return Promise.reject(new Error(message || "资源不存在"));
    }

    if (code === 500) {
      ElMessage.error("服务器内部错误");
      return Promise.reject(new Error(message || "服务器错误"));
    }

    // 其他业务错误
    ElMessage.error(message || "请求失败");
    return Promise.reject(new Error(message || "请求失败"));
  },
  async (error) => {
    NProgress.done();

    logger.error("response interceptor failed", error);

    // 网络错误
    if (!error.response) {
      ElMessage.error("网络连接失败，请检查网络设置");
      return Promise.reject(error);
    }

    const { status, statusText } = error.response;

    switch (status) {
      case 400:
        ElMessage.error("请求参数错误");
        break;
      case 401: {
        const config = error.config as any;
        if (!config?.__retry401 && !shouldSkipRefresh(config?.url)) {
          config.__retry401 = true;
          const refreshed = await tryRefreshAccessToken();
          if (refreshed) {
            return request(config);
          }
        }
        if (
          !error.config?.url?.includes("/user/offline") &&
          !error.config?.url?.includes("/user/logout") &&
          !error.config?.url?.includes("/user/online") &&
          !error.config?.url?.includes("/user/heartbeat")
        ) {
          await clearAuthSession();
        }
        promptReLogin();
        break;
      }
      case 403:
        ElMessage.error("权限不足");
        break;
      case 404:
        ElMessage.error("请求的资源不存在");
        break;
      case 408:
        ElMessage.error("请求超时");
        break;
      case 500:
        ElMessage.error("服务器内部错误");
        break;
      case 502:
        ElMessage.error("网关错误");
        break;
      case 503:
        ElMessage.error("服务不可用");
        break;
      case 504:
        ElMessage.error("网关超时");
        break;
      default:
        ElMessage.error(`请求失败: ${status} ${statusText}`);
    }

    return Promise.reject(error);
  },
);

// 请求方法封装
export const http = {
  get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.get(url, config);
  },

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.post(url, data, config);
  },

  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.put(url, data, config);
  },

  delete<T = unknown>(
    url: string,
    params?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    const requestConfig: AxiosRequestConfig = { ...config };
    if (params !== undefined) {
      requestConfig.params = params;
    }
    return request.delete(url, requestConfig);
  },

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.patch(url, data, config);
  },

  upload<T = unknown>(
    url: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append("file", file);

    return request.post(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress(progress);
        }
      },
    });
  },
};

export default request;
