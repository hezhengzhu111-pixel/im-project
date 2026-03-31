import { http } from "@/utils/request";
import type { TokenParseResultDTO, TokenPairDTO, WsTicketDTO } from "@/types";

export const authService = {
  parseAccessToken: (token?: string, allowExpired = true) =>
    http.post<TokenParseResultDTO>("/auth/parse", {
      ...(token ? { token } : {}),
      allowExpired,
    }),
  issueWsTicket: () => http.post<WsTicketDTO>("/auth/ws-ticket"),
  refreshAccessToken: () => http.post<TokenPairDTO>("/auth/refresh", {}),
};
