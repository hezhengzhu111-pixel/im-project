import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import axios from "axios";
import qs from "qs";
import { logger } from "@/utils/logger";
import type { ApiResponse } from "@/types/api";
import { shouldSkipRefreshEndpoint } from "@im/shared-auth-core";

type HeaderBag = Record<string, unknown> & {
  get?: (name: string) => unknown;
  set?: (name: string, value: string) => unknown;
  delete?: (name: string) => unknown;
};

type AdapterRequestHandler = (
  config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

type AdapterResponseFulfilled = (response: AxiosResponse) => any;

type AdapterResponseRejected = (error: any) => any;

function createTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const getHeaderValue = (
  headers: HeaderBag | undefined,
  name: string,
): string => {
  if (!headers) {
    return "";
  }
  if (typeof headers.get === "function") {
    const value = headers.get(name);
    return value == null ? "" : String(value).trim();
  }
  const directValue = headers[name] ?? headers[name.toLowerCase()];
  return directValue == null ? "" : String(directValue).trim();
};

export const setHeaderValue = (
  headers: HeaderBag | undefined,
  name: string,
  value?: string,
) => {
  if (!headers) {
    return;
  }
  const normalized = typeof value === "string" ? value.trim() : "";
  if (typeof headers.set === "function") {
    if (normalized) {
      headers.set(name, normalized);
    } else if (typeof headers.delete === "function") {
      headers.delete(name);
    }
    return;
  }
  if (normalized) {
    headers[name] = normalized;
    return;
  }
  delete headers[name];
  delete headers[name.toLowerCase()];
};

/** Adapter-injected function to get the latest access token. */
let accessTokenProvider: (() => string) | null = null;

/** Adapter-injected request interceptor. */
let adapterRequestInterceptor: AdapterRequestHandler | null = null;

/** Adapter-injected response interceptors (registered in order). */
const adapterResponseFulfilledInterceptors: AdapterResponseFulfilled[] = [];
const adapterResponseRejectedInterceptors: AdapterResponseRejected[] = [];

/**
 * Register a function that provides the current access token.
 * Called by the auth-session-adapter during initialization.
 */
export const registerAccessTokenProvider = (provider: () => string): void => {
  accessTokenProvider = provider;
};

/**
 * Register an adapter request interceptor.
 * Called by the auth-session-adapter during initialization.
 */
export const registerRequestInterceptor = (
  handler: AdapterRequestHandler,
): void => {
  adapterRequestInterceptor = handler;
};

/**
 * Register an adapter response interceptor pair.
 * Called by auth-session-adapter and http-error-notifier during initialization.
 */
export const registerResponseInterceptor = (
  onFulfilled: AdapterResponseFulfilled,
  onRejected: AdapterResponseRejected,
): void => {
  adapterResponseFulfilledInterceptors.push(onFulfilled);
  adapterResponseRejectedInterceptors.push(onRejected);
};

const getLatestAccessToken = (): string => {
  if (accessTokenProvider) {
    return accessTokenProvider();
  }
  return "";
};

export const getHttpErrorMessage = (error: any): string => {
  const data = error?.response?.data;
  if (data && typeof data === "object") {
    const message = (data as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return error instanceof Error ? error.message : "";
};

const normalizeHttpError = (error: any): any => {
  const message = getHttpErrorMessage(error);
  if (!message || !(error instanceof Error)) {
    return error;
  }
  error.message = message;
  return error;
};

const httpClient: AxiosInstance = axios.create({
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

// Base request interceptor: gateway header, trace ID, access token, cache-bust
httpClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const headers = (config.headers || {}) as HeaderBag;
    config.headers = headers as InternalAxiosRequestConfig["headers"];

    if (headers) {
      setHeaderValue(headers, "X-Gateway-Route", "true");
      const existingTraceId = getHeaderValue(headers, "X-Trace-Id");
      setHeaderValue(
        config.headers as HeaderBag,
        "X-Trace-Id",
        existingTraceId || createTraceId(),
      );
      if (!getHeaderValue(headers, "Authorization")) {
        const accessToken = getLatestAccessToken();
        if (accessToken) {
          setHeaderValue(headers, "Authorization", `Bearer ${accessToken}`);
        }
      }
    }

    if (config.method === "get") {
      config.params = {
        ...config.params,
        _t: Date.now(),
      };
    }

    if (adapterRequestInterceptor) {
      return adapterRequestInterceptor(config);
    }
    return config;
  },
  (error) => {
    logger.error("request interceptor failed", error);
    return Promise.reject(error);
  },
);

// Base response interceptor: parse ApiResponse, delegate to adapter interceptors
httpClient.interceptors.response.use(
  async (response: AxiosResponse<unknown>): Promise<any> => {
    const responseData =
      response.data && typeof response.data === "object"
        ? (response.data as Record<string, unknown>)
        : {};

    if (
      "success" in responseData &&
      typeof responseData.success === "boolean"
    ) {
      if (responseData.success) {
        return responseData;
      }
      const authMessage =
        typeof responseData.message === "string"
          ? responseData.message
          : "操作失败";
      return Promise.reject(new Error(authMessage));
    }

    const { code, message } = responseData;
    const messageText = typeof message === "string" ? message : "";

    if (code === 200) {
      return responseData;
    }

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

    // Delegate to adapter response interceptors for error handling
    for (let i = 0; i < adapterResponseFulfilledInterceptors.length; i++) {
      const interceptor = adapterResponseFulfilledInterceptors[i];
      try {
        const result = await interceptor(response);
        if (result !== response) {
          return result;
        }
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return Promise.reject(new Error(messageText || "请求失败"));
  },
  async (error) => {
    if (!error.response) {
      logger.error("response interceptor failed", error);
      return Promise.reject(error);
    }

    const { status } = error.response;
    if (!(status === 401 && shouldSkipRefresh(error.config?.url))) {
      if (status >= 500) {
        logger.error("response interceptor failed", error);
      } else {
        logger.warn("request rejected", {
          status,
          url: error.config?.url,
          message: getHttpErrorMessage(error),
        });
      }
    }

    // Delegate to adapter response interceptors for error handling
    for (let i = 0; i < adapterResponseRejectedInterceptors.length; i++) {
      const interceptor = adapterResponseRejectedInterceptors[i];
      try {
        const result = await interceptor(error);
        if (result !== undefined) {
          return result;
        }
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return Promise.reject(normalizeHttpError(error));
  },
);

export const shouldSkipRefresh = (url?: string): boolean => {
  if (!url) return false;
  return shouldSkipRefreshEndpoint(url);
};

export const http = {
  get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return httpClient.get(url, config);
  },

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return httpClient.post(url, data, config);
  },

  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return httpClient.put(url, data, config);
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
    return httpClient.delete(url, requestConfig);
  },

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    return httpClient.patch(url, data, config);
  },

  upload<T = unknown>(
    url: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append("file", file);

    return httpClient.post(url, formData, {
      timeout: 0,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
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

export default httpClient;
