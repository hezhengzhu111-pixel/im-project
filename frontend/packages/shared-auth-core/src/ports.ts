/**
 * Port for auth API operations.
 * Implemented by platform-specific auth service adapters.
 */
export interface AuthApiPort {
  refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }>;
  parseToken(token: string): Promise<unknown>;
}

/**
 * Port for token storage operations.
 * Implemented by platform-specific storage adapters (localStorage, SecureStore, etc.).
 */
export interface TokenStoragePort {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh: string): void;
  clearTokens(): void;
}

/**
 * Port for auth session operations.
 * Implemented by platform-specific session adapters.
 */
export interface AuthSessionPort {
  getUserId(): string | null;
  isAuthenticated(): boolean;
  clearSession(): void;
}
