import { http } from "@/utils/request";
import type { TokenParseResultDTO, TokenPairDTO, WsTicketDTO } from "@/types/user";

export const authService = {
  parseAccessToken: (token: string, allowExpired: boolean = true) =>
    http.post<TokenParseResultDTO>("/auth/parse", {
      token,
      allowExpired,
    }),
  issueWsTicket: () => http.post<WsTicketDTO>("/auth/ws-ticket"),
  refreshAccessToken: (refreshToken: string) =>
    http.post<TokenPairDTO>("/auth/refresh", { refreshToken }),
};
