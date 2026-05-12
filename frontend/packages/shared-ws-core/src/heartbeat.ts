import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";

/**
 * Create a heartbeat payload string ready to be sent over the WebSocket.
 *
 * The payload conforms to the `WebSocketMessage` envelope with type
 * `HEARTBEAT` and includes the current timestamp so the server can
 * measure client latency.
 *
 * @returns JSON string of the heartbeat message.
 */
export const createHeartbeatPayload = (): string =>
  JSON.stringify({
    type: WS_MESSAGE_TYPE.HEARTBEAT,
    data: { timestamp: Date.now() },
    timestamp: Date.now(),
  });
