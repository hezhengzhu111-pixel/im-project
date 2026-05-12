import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";

/**
 * Determine whether a message should be processed sequentially through the
 * incoming-message queue rather than fire-and-forget.
 *
 * All `MESSAGE`-type payloads whose inner messageType is **not** `SYSTEM`
 * are considered ordering-sensitive and must be processed one at a time so
 * that conversation history stays in order.  System messages, heartbeats,
 * online-status updates, etc. can safely be processed concurrently.
 *
 * @param messageType  The outer `type` field of the WebSocket envelope.
 * @param innerType    The inner `messageType` (or `type`) field of the data
 *                     payload.  Pass an empty string for non-MESSAGE types.
 * @returns `true` if the message should be queued for sequential processing.
 */
export const shouldProcessSequentially = (
  messageType: string,
  innerType: string,
): boolean => {
  if (messageType !== WS_MESSAGE_TYPE.MESSAGE) {
    return false;
  }
  return innerType.toUpperCase() !== "SYSTEM";
};

/**
 * Calculate the reconnect delay (in milliseconds) for a given attempt using
 * a simple linear back-off strategy.
 *
 * `delay = baseInterval * attempt`
 *
 * @param attempt       The current reconnect attempt number (1-based).
 * @param baseInterval  The base delay in ms (default: 1 000).
 * @returns The number of milliseconds to wait before the next reconnect.
 */
export const createReconnectDelay = (
  attempt: number,
  baseInterval: number = 1_000,
): number => baseInterval * attempt;
