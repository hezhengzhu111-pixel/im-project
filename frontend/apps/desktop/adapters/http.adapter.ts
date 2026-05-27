import type {
  HttpClientPort,
  RequestConfig,
} from "@im/shared-platform-ports";

export class NotImplementedHttpAdapter implements HttpClientPort {
  async get<T>(_url: string, _config?: RequestConfig): Promise<T> {
    throw new Error("HttpClientPort.get not implemented for desktop");
  }

  async post<T>(
    _url: string,
    _data?: unknown,
    _config?: RequestConfig,
  ): Promise<T> {
    throw new Error("HttpClientPort.post not implemented for desktop");
  }

  async put<T>(
    _url: string,
    _data?: unknown,
    _config?: RequestConfig,
  ): Promise<T> {
    throw new Error("HttpClientPort.put not implemented for desktop");
  }

  async delete<T>(_url: string, _config?: RequestConfig): Promise<T> {
    throw new Error("HttpClientPort.delete not implemented for desktop");
  }
}
