// Types
export type {
  RefreshAccessTokenResult,
  RefreshAccessTokenStatus,
  RefreshResult,
} from "./types.js";

// Ports (interfaces for dependency injection)
export type { AuthApiPort, TokenStoragePort, AuthSessionPort } from "./ports.js";

// Pure JWT token parsing (no localStorage)
export {
  isTokenExpired,
  getUserIdFromToken,
  getUserRolesFromToken,
} from "./token.js";

// Refresh failure classification
export {
  classifyRefreshFailureStatus,
  shouldSkipRefreshEndpoint,
} from "./classify.js";

// Refresh coordinator (merges concurrent refresh attempts)
export { createRefreshCoordinator } from "./refresh-coordinator.js";
export type { RefreshApiAdapter } from "./refresh-coordinator.js";
