import type { Message } from "@im/shared-types";
import { toBigIntId } from "./session-id.js";

/**
 * Filters a message list to only include server-originated messages
 * (excludes locally-created pending messages with "local_" prefix IDs).
 */
export const getServerMessages = (list: Message[]): Message[] =>
  list.filter((message) => !String(message.id).startsWith("local_"));

/**
 * Finds the oldest (smallest) server message ID from a message list.
 * Returns undefined if no valid server message IDs exist.
 */
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
