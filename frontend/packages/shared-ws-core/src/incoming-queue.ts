import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";
import { shouldProcessSequentially } from "./strategy.js";

/**
 * Extract the outer envelope type and inner message type from a WebSocket
 * payload object.
 *
 * Per W11 / W13, this is a pure protocol-level classification. It does not
 * read or write any store state.
 *
 * @param payload  The parsed WebSocket envelope (e.g. `{ type, data }`).
 * @returns `{ outerType, innerType }` where `innerType` is empty for
 *          non-MESSAGE envelopes.
 */
export const getIncomingPayloadType = (
  payload: Record<string, unknown>,
): { outerType: string; innerType: string } => {
  const outerType = String(payload.type || "");
  if (outerType !== WS_MESSAGE_TYPE.MESSAGE) {
    return { outerType, innerType: "" };
  }
  const data = payload.data as Record<string, unknown> | undefined;
  const innerType = data ? String(data.messageType || data.type || "") : "";
  return { outerType, innerType };
};

/**
 * Decide whether a parsed WebSocket payload should enter the incoming
 * sequential queue on the platform side.
 *
 * Per W12, this is a shared pure judgment; the actual Promise tail is owned
 * by each platform (Web `incomingProcessing`, Mobile `incomingTail`).
 *
 * @param payload  The parsed WebSocket envelope.
 * @returns `true` if the payload must be processed sequentially.
 */
export const shouldQueueIncomingPayload = (
  payload: Record<string, unknown>,
): boolean => {
  const { outerType, innerType } = getIncomingPayloadType(payload);
  return shouldProcessSequentially(outerType, innerType);
};
