import type { Message, ReadReceipt } from "@im/shared-types";
import { toBigIntId } from "./session-id.js";

/**
 * Mode for applying read receipts to messages.
 *
 * - "received": Mark messages SENT BY `targetUserId` as read (used when someone
 *   else reads my messages — `applyReadReceipt` case).
 * - "sync": Mark messages NOT SENT BY `targetUserId` as read (used when I read
 *   messages and the read sync comes back — `applyReadSync` case).
 */
export type ReadReceiptApplyMode = "received" | "sync";

/**
 * Applies a read receipt to a list of messages, marking messages as read
 * where appropriate. Returns the updated message list and the subset that changed.
 *
 * For private sessions: updates message status to "READ".
 * For group sessions: adds the reader to the readBy array.
 *
 * This is a pure function — it does not mutate the input list.
 */
export const applyReadReceiptToMessages = (
  messages: Message[],
  receipt: Pick<ReadReceipt, "readerId" | "lastReadMessageId" | "readAt">,
  options: {
    /** The user ID used to filter which messages to update */
    targetUserId: string;
    /** "received" = update messages sent by targetUserId; "sync" = update messages NOT sent by targetUserId */
    mode: ReadReceiptApplyMode;
    /** Whether this is a group session (determines readBy vs status update) */
    isGroupSession: boolean;
  },
): { updated: Message[]; changed: Message[] } => {
  const lastReadMessageId = receipt.lastReadMessageId
    ? toBigIntId(receipt.lastReadMessageId)
    : null;
  const readAtMilliseconds = receipt.readAt
    ? new Date(receipt.readAt).getTime()
    : Number.NaN;

  const changed: Message[] = [];

  const updated = messages.map((message) => {
    // Filter by sender based on mode
    const isTargetSender = message.senderId === options.targetUserId;
    const shouldUpdate =
      options.mode === "received" ? isTargetSender : !isTargetSender;
    if (!shouldUpdate) {
      return message;
    }

    // If we have a lastReadMessageId, skip messages newer than it
    if (lastReadMessageId != null) {
      const messageId = toBigIntId(message.id);
      if (messageId == null || messageId > lastReadMessageId) {
        return message;
      }
    }

    // Skip messages sent after the read timestamp
    const messageMilliseconds = new Date(message.sendTime).getTime();
    if (
      Number.isFinite(readAtMilliseconds) &&
      Number.isFinite(messageMilliseconds) &&
      messageMilliseconds > readAtMilliseconds
    ) {
      return message;
    }

    let next: Message;
    if (options.isGroupSession) {
      const readers = message.readBy || [];
      if (readers.includes(receipt.readerId)) {
        return message;
      }
      next = {
        ...message,
        readBy: [...readers, receipt.readerId],
        readByCount: readers.length + 1,
        readStatus: 1,
      };
    } else {
      next = {
        ...message,
        status: "READ",
        readStatus: 1,
        readAt: receipt.readAt || message.readAt,
      };
    }

    changed.push(next);
    return next;
  });

  return { updated, changed };
};
