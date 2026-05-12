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
} from "@im/shared-im-core";

export type ConversationClearMarker = {
  clearedAtMs: number;
  lastServerMessageId?: string;
};
