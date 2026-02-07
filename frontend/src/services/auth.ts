import { http } from "@/utils/request";
import type { TokenParseResultDTO } from "@/types/user";

export const authService = {
  parseAccessToken: (token: string, allowExpired: boolean = true) =>
    http.post<TokenParseResultDTO>("/auth/parse", {
      token,
      allowExpired,
    }),
};

