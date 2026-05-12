/**
 * Result of a refresh token attempt.
 */
export type RefreshAccessTokenResult = "success" | "authInvalid" | "transientError";

/**
 * Status of the refresh coordinator.
 */
export type RefreshAccessTokenStatus = "idle" | "refreshing" | "failed";

/**
 * Detailed result returned by the refresh coordinator.
 */
export interface RefreshResult {
  status: RefreshAccessTokenResult;
  expiresInMs?: number;
  refreshExpiresInMs?: number;
  message?: string;
}
