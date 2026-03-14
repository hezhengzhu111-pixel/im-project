import { http } from "@/utils/request";
import type { TokenParseResultDTO, TokenPairDTO } from "@/types/user";

export const authService = {
  parseAccessToken: (token: string, allowExpired: boolean = true) =>
    http.post<TokenParseResultDTO>("/auth/parse", {
      token,
      allowExpired,
    }),
  refreshAccessToken: (refreshToken: string) =>
    http.post<TokenPairDTO>("/auth/refresh", { refreshToken }),
};
