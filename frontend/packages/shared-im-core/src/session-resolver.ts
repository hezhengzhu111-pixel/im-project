import type { Message } from "@im/shared-types";
import { buildSessionId } from "./session-id.js";

/**
 * Resolves the session ID that a given message belongs to.
 * Returns null if the message lacks enough information to determine a session.
 *
 * For group messages: uses groupId.
 * For private messages: determines the "other party" relative to currentUserId.
 */
export const resolveMessageSessionId = (
  message: Message,
  currentUserId: string,
): string | null => {
  if (message.isGroupChat && message.groupId) {
    return buildSessionId("group", currentUserId, message.groupId);
  }
  if (message.senderId && message.receiverId) {
    const targetId =
      message.senderId === currentUserId
        ? message.receiverId
        : message.senderId;
    if (targetId) {
      return buildSessionId("private", currentUserId, targetId);
    }
  }
  return null;
};
