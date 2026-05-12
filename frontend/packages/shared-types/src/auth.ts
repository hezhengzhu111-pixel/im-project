/** Token 解析结果 */
export interface TokenParseResultDTO {
  valid: boolean;
  expired: boolean;
  error?: string;
  userId?: string | number;
  username?: string;
  issuedAtEpochMs?: number;
  expiresAtEpochMs?: number;
  jti?: string;
  tokenType?: string;
  permissions?: string[];
}

/** Token 对 */
export interface TokenPairDTO {
  accessToken?: string;
  refreshToken?: string;
  expiresInMs: number;
  refreshExpiresInMs: number;
}

/** WebSocket 票据 */
export interface WsTicketDTO {
  ticket: string;
  expiresInMs: number;
}
