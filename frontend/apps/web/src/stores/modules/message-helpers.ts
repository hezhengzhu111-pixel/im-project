import { toBigIntId } from "@/normalizers/chat";
import type { Message } from "@/types";

export {
  MESSAGE_WINDOW_SIZE,
  messageIdentityValues,
  hasSameMessageIdentity,
  messageTimeValue,
  sortMessagesAscending,
  mergeMessagesChronologically,
  limitMessageWindow,
} from "@im/shared-im-core";

export type ConversationClearMarker = {
  clearedAtMs: number;
  lastServerMessageId?: string;
};

export const getServerMessages = (list: Message[]): Message[] =>
  list.filter((message) => !String(message.id).startsWith("local_"));

export const findOldestLoadedServerMessageId = (
  list: Message[],
): string | undefined => {
  const oldestId = getServerMessages(list)
    .map((message) => toBigIntId(message.id))
    .filter((item): item is bigint => item != null)
    .reduce<bigint | null>((minId, currentId) => {
      if (minId == null || currentId < minId) {
        return currentId;
      }
      return minId;
    }, null);
  return oldestId?.toString();
};
