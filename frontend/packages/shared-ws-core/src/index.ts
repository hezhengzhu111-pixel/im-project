export { DUPLICATE_CONNECTION_REASON } from "./constants.js";
export { createTicketedWebSocketUrl } from "./path.js";
export { createHeartbeatPayload } from "./heartbeat.js";
export {
  parseWebSocketPayload,
  isMessagePayload,
  isMessageStatusChangedPayload,
  isOnlineStatusPayload,
  isReadReceiptPayload,
  isSystemPayload,
  isHeartbeatPayload,
  isFriendRequestPayload,
  isFriendAcceptedPayload,
  isE2eeNegotiationPayload,
} from "./payload.js";
export { shouldProcessSequentially } from "./strategy.js";
export {
  getIncomingPayloadType,
  shouldQueueIncomingPayload,
  createSequentialTail,
} from "./incoming-queue.js";
export {
  createReconnectDelay,
  shouldScheduleReconnect,
} from "./reconnect.js";
export type { ShouldScheduleReconnectOptions } from "./reconnect.js";
export {
  normalizePresenceUserId,
  isOnlineStatusValue,
  applyPresenceToRecord,
  applyPresenceToSet,
} from "./presence.js";
export {
  getMessageDedupKey,
  shouldDropRecentMessage,
  rememberRecentMessage,
  cleanupRecentMessages,
} from "./duplicate-message.js";
export {
  classifyContactRefreshFromWsType,
  classifyContactRefreshFromSystemContent,
  mergeContactRefreshActions,
} from "./contact-refresh.js";
export type { ContactRefreshAction } from "./contact-refresh.js";
