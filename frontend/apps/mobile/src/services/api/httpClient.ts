import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import CookieManager from '@preeternal/react-native-cookie-manager';
import { AUTH_ENDPOINTS } from '@im/shared-api-contract';
import { createRefreshCoordinator, shouldSkipRefreshEndpoint } from '@im/shared-auth-core';
import { createTraceId } from '@im/shared-utils';
import { APP_CONFIG, STORAGE_KEYS } from '@/constants/config';
import { debugTelemetry } from '@/services/debug/debugTelemetry';
import { secureStorage } from '@/services/storage/secureStorage';
import { logger } from '@/utils/logger';
import type { ApiResponse } from '@im/shared-types';

let accessTokenProvider: () => string = () => '';
let onAuthInvalid: (generation: number) => void = () => {};
let sessionGenerationProvider: () => number = () => 0;
let onSessionRefreshed: () => void = () => {};
type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const registerAuthHooks = (hooks: {
  getAccessToken: () => string;
  getSessionGeneration: () => number;
  onAuthInvalid: (generation: number) => void;
  onSessionRefreshed?: () => void;
}) => {
  accessTokenProvider = hooks.getAccessToken;
  sessionGenerationProvider = hooks.getSessionGeneration;
  onAuthInvalid = hooks.onAuthInvalid;
  onSessionRefreshed = hooks.onSessionRefreshed || (() => {});
};

export const apiClient = axios.create({
  baseURL: APP_CONFIG.API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json;charset=UTF-8',
  },
});

const refreshCoordinator = createRefreshCoordinator({
  async doRefresh(traceId: string) {
    const response = await axios.post(
      `${APP_CONFIG.API_BASE_URL}${AUTH_ENDPOINTS.REFRESH}`,
      {},
      {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'X-Gateway-Route': 'true',
          'X-Trace-Id': traceId || createTraceId(),
        },
        withCredentials: true,
        timeout: 15_000,
      },
    );
    await secureStorage.mirrorCookies();
    return { status: response.status, data: response.data };
  },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  config.headers.set('X-Gateway-Route', 'true');
  config.headers.set('X-Trace-Id', String(config.headers.get('X-Trace-Id') || createTraceId()));
  if (!config.headers.get('Authorization')) {
    const token = accessTokenProvider() || (await secureStorage.get(STORAGE_KEYS.accessToken));
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
  }
  await CookieManager.get(APP_CONFIG.API_BASE_URL, true).catch(() => undefined);
  return config;
});

const is401 = (response?: AxiosResponse | undefined) => response?.status === 401 || response?.data?.code === 401;
const captureApiError = (input: { message: string; status?: number; url?: string }) => {
  debugTelemetry.recordApiError(input);
};
const clearAuthorizationHeader = (config: InternalAxiosRequestConfig) => {
  if (typeof config.headers.delete === 'function') {
    config.headers.delete('Authorization');
    return;
  }
  const headers = config.headers as unknown as Record<string, unknown>;
  delete headers.Authorization;
  delete headers.authorization;
};

const rejectApiError = (error: AxiosError): Promise<never> => {
  const config = error.config as RetriableRequestConfig | undefined;
  captureApiError({
    message: error.message || 'Request failed',
    status: error.response?.status,
    url: config?.url,
  });
  if (error.response?.status && error.response.status >= 500) {
    logger.error('http', 'server request failed', {
      status: error.response.status,
      url: config?.url,
    });
  }
  return Promise.reject(error);
};

const refreshAndRetry = async (error: AxiosError): Promise<AxiosResponse> => {
  const config = error.config as RetriableRequestConfig | undefined;
  if (!config || config._retry || shouldSkipRefreshEndpoint(config.url || '') || !is401(error.response)) {
    return rejectApiError(error);
  }

  const generation = sessionGenerationProvider();
  config._retry = true;
  const result = await refreshCoordinator.refresh(createTraceId());
  if (result.status !== 'success') {
    onAuthInvalid(generation);
    return Promise.reject(error);
  }
  onSessionRefreshed();
  clearAuthorizationHeader(config);
  return apiClient.request(config);
};

apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse | Promise<AxiosResponse> => {
    const data = response.data;
    if (data && typeof data === 'object' && 'code' in data) {
      const apiData = data as ApiResponse<unknown>;
      if (apiData.code === 200) {
        response.data = apiData;
        return response;
      }
      if (apiData.code === 401 && !shouldSkipRefreshEndpoint(response.config.url || '')) {
        captureApiError({
          message: apiData.message || 'Unauthorized',
          status: 401,
          url: response.config.url,
        });
        return refreshAndRetry(
          new AxiosError(apiData.message || 'Unauthorized', 'ERR_BAD_RESPONSE', response.config, response.request, response),
        );
      }
      captureApiError({
        message: apiData.message || 'Request failed',
        status: typeof apiData.code === 'number' ? apiData.code : response.status,
        url: response.config.url,
      });
      throw new Error(apiData.message || 'Request failed');
    }
    response.data = {
      code: 200,
      message: 'success',
      data,
      timestamp: Date.now(),
    } satisfies ApiResponse<unknown>;
    return response;
  },
  async (error: AxiosError) => {
    return refreshAndRetry(error);
  },
);

export const http = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await apiClient.get(url, config);
    return response.data as ApiResponse<T>;
  },
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await apiClient.post(url, data, config);
    return response.data as ApiResponse<T>;
  },
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await apiClient.put(url, data, config);
    return response.data as ApiResponse<T>;
  },
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await apiClient.delete(url, config);
    return response.data as ApiResponse<T>;
  },
};

export { refreshCoordinator };
