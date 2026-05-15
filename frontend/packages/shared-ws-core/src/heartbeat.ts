import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";

/**
 * Create a heartbeat payload string ready to be sent over the WebSocket.
 *
 * The payload conforms to the `WebSocketMessage` envelope with type
 * `HEARTBEAT` and includes the provided timestamp so the server can
 * measure client latency.
 *
 * Per W9: timestamp is an explicit input; callers pass Date.now() from
 * the platform side. A zero-arg overload is retained for backward
 * compatibility but delegates to the same core logic.
 *
 * @param timestampMs - Epoch milliseconds for the heartbeat.
 * @returns JSON string of the heartbeat message.
 */
export function createHeartbeatPayload(timestampMs: number): string;
export function createHeartbeatPayload(): string;
export function createHeartbeatPayload(timestampMs?: number): string {
  const ts = timestampMs ?? Date.now();
  return JSON.stringify({
    type: WS_MESSAGE_TYPE.HEARTBEAT,
    data: { timestamp: ts },
    timestamp: ts,
  });
}
