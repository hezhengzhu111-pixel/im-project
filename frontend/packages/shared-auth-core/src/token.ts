/**
 * Pure JWT token parsing utilities.
 *
 * These functions use only `atob()` for base64 decoding — no localStorage or
 * any other browser storage API. They accept a token string directly.
 */

/**
 * Check whether a JWT token is expired.
 *
 * Decodes the JWT payload and compares `exp` against the current time.
 * Returns `true` if the token is missing, malformed, or expired
 * (with a 5-minute safety margin).
 *
 * @param token - A raw JWT string (header.payload.signature)
 */
export function isTokenExpired(token: string): boolean {
  if (!token) return true;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const currentTime = Math.floor(Date.now() / 1000);

    // Consider expired 5 minutes before actual expiry
    return payload.exp < currentTime + 300;
  } catch {
    return true;
  }
}

/**
 * Extract the user ID from a JWT token.
 *
 * Looks for `sub`, `userId`, or `id` claims in the payload.
 *
 * @param token - A raw JWT string
 * @returns The user ID as a string, or `null` if not found / malformed
 */
export function getUserIdFromToken(token: string): string | null {
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const userId = payload.sub || payload.userId || payload.id;
    return userId == null ? null : String(userId);
  } catch {
    return null;
  }
}

/**
 * Extract user roles from a JWT token.
 *
 * Looks for `roles` or `authorities` claims in the payload.
 *
 * @param token - A raw JWT string
 * @returns An array of role strings, or `[]` if not found / malformed
 */
export function getUserRolesFromToken(token: string): string[] {
  if (!token) return [];

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.roles || payload.authorities || [];
  } catch {
    return [];
  }
}
