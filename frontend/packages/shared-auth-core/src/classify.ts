import type { RefreshAccessTokenResult } from "./types.js";

/**
 * Classify an HTTP response status code as either a permanent auth failure
 * or a transient error.
 *
 * - 400, 401, 403 → `"authInvalid"` (credentials are bad; do not retry)
 * - Everything else → `"transientError"` (network/server issue; may retry)
 *
 * @param status - HTTP response status code
 */
export function classifyRefreshFailureStatus(
  status: number,
): RefreshAccessTokenResult {
  if (status === 400 || status === 401 || status === 403) {
    return "authInvalid";
  }
  return "transientError";
}

/**
 * Determine whether a request URL targets an auth endpoint that should
 * **not** trigger a token-refresh cycle.
 *
 * Auth endpoints (login, register, logout, parse, refresh, heartbeat, offline)
 * return 401 by design when credentials are missing or expired — retrying with
 * a refreshed token would be pointless or harmful.
 *
 * @param url - The request URL (absolute or relative)
 */
export function shouldSkipRefreshEndpoint(url: string): boolean {
  if (!url) return false;
  return (
    url.includes("/auth/parse") ||
    url.includes("/auth/refresh") ||
    url.includes("/user/login") ||
    url.includes("/user/register") ||
    url.includes("/user/logout") ||
    url.includes("/user/offline") ||
    url.includes("/user/heartbeat")
  );
}
