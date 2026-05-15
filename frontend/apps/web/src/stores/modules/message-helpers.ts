export {
  MESSAGE_WINDOW_SIZE,
  messageIdentityValues,
  hasSameMessageIdentity,
  messageTimeValue,
  sortMessagesAscending,
  mergeMessagesChronologically,
  limitMessageWindow,
  getServerMessages,
  findOldestLoadedServerMessageId,
  applyIncomingMessageToList,
  shouldHideClearedMessage,
  createClearMarkerFromMessages,
} from "@im/shared-im-core";

export type { ConversationClearMarker } from "@im/shared-im-core";
