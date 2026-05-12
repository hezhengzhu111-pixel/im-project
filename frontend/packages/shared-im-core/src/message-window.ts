import type { Message } from "@im/shared-types";
import { sortMessagesAscending } from "./message-sort.js";

export const MESSAGE_WINDOW_SIZE = 50;

export const limitMessageWindow = (
  list: Message[],
  keep: "latest" | "oldest" = "latest",
  size = MESSAGE_WINDOW_SIZE,
): Message[] => {
  const sorted = list.slice().sort(sortMessagesAscending);
  if (sorted.length <= size) {
    return sorted;
  }
  return keep === "oldest" ? sorted.slice(0, size) : sorted.slice(-size);
};
