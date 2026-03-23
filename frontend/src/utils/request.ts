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
import { STORAGE_CONFIG } from "@/config";
import { refreshAccessTokenRaw } from "@/services/auth-refresh";

function createTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let refreshInFlight: Promise<string | null> | null = null;
let reauthPromptInFlight = false;

const shouldSkipRefresh = (url?: string) => {
  if (!url) return false;
  return (
    url.includes("/auth/refresh") ||
    url.includes("/user/login") ||
    url.includes("/user/register") ||
    url.includes("/user/logout") ||
    url.includes("/user/offline")
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

const tryRefreshAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = localStorage.getItem(STORAGE_CONFIG.REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  refreshInFlight = (async () => {
    try {
      const response = await refreshAccessTokenRaw(
        refreshToken,
        createTraceId(),
      );
      const payload = response?.data;
      if (payload?.code !== 200 || !payload?.data?.accessToken) {
        return null;
      }
      const accessToken = String(payload.data.accessToken);
      const nextRefreshToken = String(
        payload.data.refreshToken || refreshToken,
      );
      localStorage.setItem(STORAGE_CONFIG.TOKEN_KEY, accessToken);
      localStorage.setItem(STORAGE_CONFIG.REFRESH_TOKEN_KEY, nextRefreshToken);
      try {
        const userStore = useUserStore();
        userStore.setAuthToken(accessToken, nextRefreshToken);
      } catch {}
      return accessToken;
    } catch {
      return null;
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

    // 添加认证token
    const userStore = useUserStore();
    const token =
      userStore.token || localStorage.getItem(STORAGE_CONFIG.TOKEN_KEY) || "";

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

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
    console.error("请求拦截器错误:", error);
    return Promise.reject(error);
  },
);

// 响应拦截器
request.interceptors.response.use(
  async (response: AxiosResponse<any>) => {
    NProgress.done();

    const responseData = response.data;

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
      } as any; // 强转以适配拦截器返回类型预期
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
      const userStore = useUserStore();
      if (
        !response.config.url?.includes("/user/offline") &&
        !response.config.url?.includes("/user/logout")
      ) {
        userStore.logout();
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

    console.error("响应拦截器错误:", error);

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
        const userStore = useUserStore();
        if (
          !error.config?.url?.includes("/user/offline") &&
          !error.config?.url?.includes("/user/logout")
        ) {
          userStore.logout();
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
  get<T = any>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.get(url, config);
  },

  post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.post(url, data, config);
  },

  put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.put(url, data, config);
  },

  delete<T = any>(
    url: string,
    params?: any,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.delete(url, { params, ...config });
  },

  patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return request.patch(url, data, config);
  },

  upload<T = any>(
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
