export {
  toBigIntId,
  compareIds,
  buildSessionId,
  safePreferExistingId,
} from "./session-id.js";

export {
  messageIdentityValues,
  hasSameMessageIdentity,
} from "./message-identity.js";

export {
  messageTimeValue,
  sortMessagesAscending,
} from "./message-sort.js";

export {
  MESSAGE_WINDOW_SIZE,
  limitMessageWindow,
} from "./message-window.js";

export {
  dedupeMessages,
  mergeMessagesChronologically,
  mergeServerMessageWithPending,
  applyMessageToMessageList,
} from "./message-dedup.js";

export {
  getServerMessages,
  findOldestLoadedServerMessageId,
} from "./message-filter.js";

export {
  resolveMessageSessionId,
} from "./session-resolver.js";

export {
  applyReadReceiptToMessages,
} from "./read-receipt.js";

export type { ReadReceiptApplyMode } from "./read-receipt.js";

export {
  compareSessions,
  sortSessions,
} from "./session-sort.js";

export {
  applyMessageToSession,
} from "./session-apply.js";

export type { SessionApplyResult } from "./session-apply.js";

export {
  markSessionRead,
  markSessionsRead,
} from "./session-read.js";

export {
  applyIncomingMessageToList,
} from "./message-list.js";

export type { ApplyIncomingOptions } from "./message-list.js";

export {
  shouldHideClearedMessage,
  createClearMarkerFromMessages,
} from "./clear-marker.js";

export type { ConversationClearMarker } from "./clear-marker.js";

export {
  createExponentialRetryDelay,
  createNextRetryAt,
  shouldStopRetry,
} from "./retry-policy.js";

export type { RetryPolicyOptions } from "./retry-policy.js";
