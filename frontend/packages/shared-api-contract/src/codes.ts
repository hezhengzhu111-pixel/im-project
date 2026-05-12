/**
 * WebSocket message types used in the IM system.
 * Extracted from stores/websocket.ts handleMessage switch cases.
 */
export const WS_MESSAGE_TYPE = {
  MESSAGE: 'MESSAGE',
  MESSAGE_STATUS_CHANGED: 'MESSAGE_STATUS_CHANGED',
  HEARTBEAT: 'HEARTBEAT',
  ONLINE_STATUS: 'ONLINE_STATUS',
  READ_RECEIPT: 'READ_RECEIPT',
  READ_SYNC: 'READ_SYNC',
  SYSTEM: 'SYSTEM',
  FRIEND_REQUEST: 'FRIEND_REQUEST',
  FRIEND_ACCEPTED: 'FRIEND_ACCEPTED',
  E2EE_NEGOTIATION: 'E2EE_NEGOTIATION',
} as const;

export type WsMessageType =
  (typeof WS_MESSAGE_TYPE)[keyof typeof WS_MESSAGE_TYPE];

/**
 * Common API response status codes.
 */
export const API_CODES = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;
