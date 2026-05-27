import axios from "axios";
import type { HttpClientPort, RequestConfig } from "@im/shared-platform-ports";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8082";

const instance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
});

function toAxiosConfig(config?: RequestConfig) {
  return {
    headers: config?.headers,
    timeout: config?.timeout,
    signal: config?.signal,
  };
}

export class TauriHttpClientAdapter implements HttpClientPort {
  async get<T>(url: string, config?: RequestConfig): Promise<T> {
    const res = await instance.get(url, toAxiosConfig(config));
    return res.data;
  }

  async post<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const res = await instance.post(url, data, toAxiosConfig(config));
    return res.data;
  }

  async put<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const res = await instance.put(url, data, toAxiosConfig(config));
    return res.data;
  }

  async delete<T>(url: string, config?: RequestConfig): Promise<T> {
    const res = await instance.delete(url, toAxiosConfig(config));
    return res.data;
  }
}
