/**
 * Pure diagnostic types and functions for WebSocket connection status.
 * Per W7/W22: shared-ws-core only provides pure state descriptions,
 * never performs telemetry, logging, or reads Date.now internally.
 */

export type WebSocketConnectionStatus = "connected" | "connecting" | "disconnected";

export interface ResolveConnectionStatusInput {
  connected: boolean;
  connecting: boolean;
}

/**
 * Derive display connection status from boolean flags. Pure function.
 * Per W7: shared can carry pure status derivation, not socket lifecycle.
 */
export function resolveWebSocketConnectionStatus(
  input: ResolveConnectionStatusInput,
): WebSocketConnectionStatus {
  if (input.connecting) return "connecting";
  if (input.connected) return "connected";
  return "disconnected";
}

export interface DiagnosticsSnapshotInput {
  connected: boolean;
  connecting: boolean;
  reconnectAttempts: number;
  lastEventAt: number;
}

export interface WebSocketDiagnosticsSnapshot {
  status: WebSocketConnectionStatus;
  reconnectAttempts: number;
  lastEventAt: number;
}

/**
 * Create a diagnostics snapshot from current state. Pure function.
 * Per W22: shared can define snapshot type/format, not record or send telemetry.
 * Per W23: lastEventAt must be passed in, shared does not read Date.now.
 */
export function createWebSocketDiagnosticsSnapshot(
  input: DiagnosticsSnapshotInput,
): WebSocketDiagnosticsSnapshot {
  return {
    status: resolveWebSocketConnectionStatus(input),
    reconnectAttempts: input.reconnectAttempts,
    lastEventAt: input.lastEventAt,
  };
}
