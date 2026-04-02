import axios from "axios";
import { http } from "@/utils/request";
import type { ApiResponse } from "@/types/api";
import type { TokenParseResultDTO, TokenPairDTO, WsTicketDTO } from "@/types";

const createTraceId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const invalidParseResponse = (message = "未登录"): ApiResponse<TokenParseResultDTO> => ({
  code: 200,
  message: "ok",
  data: {
    valid: false,
    expired: false,
    error: message,
  },
  timestamp: Date.now(),
});

export const authService = {
  async parseAccessToken(token?: string, allowExpired = true) {
    try {
      const response = await axios.post<ApiResponse<TokenParseResultDTO>>(
        "/api/auth/parse",
        {
          ...(token ? { token } : {}),
          allowExpired,
        },
        {
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "X-Gateway-Route": "true",
            "X-Trace-Id": createTraceId(),
          },
          withCredentials: true,
          timeout: 10000,
        },
      );
      const payload = response.data;
      if (payload?.code === 401 || payload?.code === 403) {
        return invalidParseResponse(payload.message || "未登录");
      }
      return payload;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return invalidParseResponse("未登录");
      }
      throw error;
    }
  },
  issueWsTicket: () => http.post<WsTicketDTO>("/auth/ws-ticket"),
  refreshAccessToken: () => http.post<TokenPairDTO>("/auth/refresh", {}),
};
