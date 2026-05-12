import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";

/**
 * Parse a raw WebSocket message string into a structured object.
 *
 * @param raw  The raw `MessageEvent.data` string from the WebSocket.
 * @returns The parsed value, or `null` if parsing fails.
 */
export const parseWebSocketPayload = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Shape guard — checks that `data` looks like a WebSocket message envelope. */
const isEnvelope = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null && "type" in data;

/**
 * Check whether the parsed payload is a chat message
 * (`type === "MESSAGE"`).
 */
export const isMessagePayload = (data: unknown): boolean =>
  isEnvelope(data) && data.type === WS_MESSAGE_TYPE.MESSAGE;

/**
 * Check whether the parsed payload is an online-status update
 * (`type === "ONLINE_STATUS"`).
 */
export const isOnlineStatusPayload = (data: unknown): boolean =>
  isEnvelope(data) && data.type === WS_MESSAGE_TYPE.ONLINE_STATUS;

/**
 * Check whether the parsed payload is a read-receipt event
 * (`type === "READ_RECEIPT"`).
 */
export const isReadReceiptPayload = (data: unknown): boolean =>
  isEnvelope(data) && data.type === WS_MESSAGE_TYPE.READ_RECEIPT;

/**
 * Check whether the parsed payload is a system message
 * (`type === "SYSTEM"`).
 */
export const isSystemPayload = (data: unknown): boolean =>
  isEnvelope(data) && data.type === WS_MESSAGE_TYPE.SYSTEM;
