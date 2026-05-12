import axios from 'axios';
import { AUTH_ENDPOINTS } from '@im/shared-api-contract';
import { APP_CONFIG } from '@/constants/config';
import { http } from '@/services/api/httpClient';
import type { ApiResponse } from '@/types/models';

export interface TokenParseResult {
  valid: boolean;
  expired?: boolean;
  userId?: string | number;
  username?: string;
  permissions?: string[];
  error?: string;
}

export interface WsTicket {
  ticket: string;
  expiresInMs?: number;
}

export const authService = {
  async parseAccessToken(token?: string, allowExpired = true): Promise<ApiResponse<TokenParseResult>> {
    const response = await axios.post<ApiResponse<TokenParseResult>>(
      `${APP_CONFIG.API_BASE_URL}${AUTH_ENDPOINTS.PARSE}`,
      {
        ...(token ? { token } : {}),
        allowExpired,
      },
      {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'X-Gateway-Route': 'true',
        },
        withCredentials: true,
        timeout: 15_000,
      },
    );
    return response.data;
  },

  issueWsTicket(): Promise<ApiResponse<WsTicket>> {
    return http.post<WsTicket>(AUTH_ENDPOINTS.WS_TICKET);
  },
};
