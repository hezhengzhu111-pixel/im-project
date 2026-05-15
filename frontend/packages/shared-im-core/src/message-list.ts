import type { Message } from "@im/shared-types";
import { mergeMessagesChronologically } from "./message-dedup.js";
import { limitMessageWindow, MESSAGE_WINDOW_SIZE } from "./message-window.js";

export interface ApplyIncomingOptions {
  windowLimit?: number;
  keep?: "latest" | "all";
}

export const applyIncomingMessageToList = (
  messages: Message[],
  incoming: Message,
  options?: ApplyIncomingOptions,
): Message[] => {
  const merged = mergeMessagesChronologically(messages, [incoming]);

  if (options?.keep === "all") {
    return merged;
  }

  return limitMessageWindow(
    merged,
    "latest",
    options?.windowLimit ?? MESSAGE_WINDOW_SIZE,
  );
};
