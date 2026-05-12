/**
 * Close reason sent when a duplicate WebSocket connection is detected.
 * The server or client uses this to distinguish intentional disconnects
 * from connection-replacement closes so that reconnect logic can skip.
 */
export const DUPLICATE_CONNECTION_REASON = "duplicate_connection";
