import { WS_MESSAGE_TYPE } from "@im/shared-api-contract";

/**
 * Unified event kind classification for WebSocket payloads.
 *
 * Per W13, this is a pure protocol-level classification — it does not
 * read or write any store state, normalize messages, or trigger notifications.
 */
export type WsEventKind =
  | "message"
  | "messageStatusChanged"
  | "onlineStatus"
  | "readReceipt"
  | "friendRequest"
  | "friendAccepted"
  | "system"
  | "heartbeat"
  | "e2eeNegotiation"
  | "unknown";

const TYPE_TO_KIND: Record<string, WsEventKind> = {
  [WS_MESSAGE_TYPE.MESSAGE]: "message",
  [WS_MESSAGE_TYPE.MESSAGE_STATUS_CHANGED]: "messageStatusChanged",
  [WS_MESSAGE_TYPE.ONLINE_STATUS]: "onlineStatus",
  [WS_MESSAGE_TYPE.READ_RECEIPT]: "readReceipt",
  [WS_MESSAGE_TYPE.FRIEND_REQUEST]: "friendRequest",
  [WS_MESSAGE_TYPE.FRIEND_ACCEPTED]: "friendAccepted",
  [WS_MESSAGE_TYPE.SYSTEM]: "system",
  [WS_MESSAGE_TYPE.HEARTBEAT]: "heartbeat",
  [WS_MESSAGE_TYPE.E2EE_NEGOTIATION]: "e2eeNegotiation",
};

/**
 * Classify a parsed WebSocket envelope into a `WsEventKind`.
 *
 * Per W11/W13, this is a pure function — input determines output.
 *
 * @param payload  The parsed WebSocket envelope (e.g. `{ type, data }`).
 * @returns The classified event kind, or `"unknown"` if the type is not recognized.
 */
export const classifyWsEvent = (
  payload: Record<string, unknown>,
): WsEventKind => {
  const type = String(payload.type || "");
  return TYPE_TO_KIND[type] ?? "unknown";
};

/**
 * Extract the `data` field from a WebSocket envelope.
 *
 * Per W11, this is a pure accessor — no normalization or transformation.
 *
 * @param payload  The parsed WebSocket envelope.
 * @returns The `data` value, or `undefined` if absent.
 */
export const getWsPayloadData = (
  payload: Record<string, unknown>,
): unknown => payload.data;

/**
 * Whether the event kind represents a chat message that should be
 * added to conversation history (MESSAGE).
 */
export const isChatMessageEvent = (kind: WsEventKind): boolean =>
  kind === "message";

/**
 * Whether the event kind represents a contact-related event
 * (FRIEND_REQUEST or FRIEND_ACCEPTED) that should trigger contact refresh.
 *
 * Per W16.
 */
export const isContactEvent = (kind: WsEventKind): boolean =>
  kind === "friendRequest" || kind === "friendAccepted";

/**
 * Whether the event kind represents a presence/online-status event.
 *
 * Per W14.
 */
export const isPresenceEvent = (kind: WsEventKind): boolean =>
  kind === "onlineStatus";

/**
 * Whether the event kind represents a read-receipt event.
 *
 * Per W15.
 */
export const isReadEvent = (kind: WsEventKind): boolean =>
  kind === "readReceipt";
