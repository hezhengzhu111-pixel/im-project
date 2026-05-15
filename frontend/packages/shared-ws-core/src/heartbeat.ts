import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";

/**
 * Create a heartbeat payload string ready to be sent over the WebSocket.
 *
 * The payload conforms to the `WebSocketMessage` envelope with type
 * `HEARTBEAT` and includes the provided timestamp so the server can
 * measure client latency.
 *
 * Per W1 / W9: timestamp is an explicit input; callers pass Date.now() from
 * the platform side. shared-ws-core must not read time by itself.
 *
 * @param timestampMs - Epoch milliseconds for the heartbeat.
 * @returns JSON string of the heartbeat message.
 */
export function createHeartbeatPayload(timestampMs: number): string {
  return JSON.stringify({
    type: WS_MESSAGE_TYPE.HEARTBEAT,
    data: { timestamp: timestampMs },
    timestamp: timestampMs,
  });
}
