import { toBigIntId } from "./session-id.js";
import type { Message } from "@im/shared-types";

export interface ConversationClearMarker {
  clearedAtMs: number;
  lastServerMessageId?: string;
}

export function shouldHideClearedMessage(
  message: Message,
  marker: ConversationClearMarker | undefined,
): boolean {
  if (!marker) {
    return false;
  }

  const markerId = toBigIntId(marker.lastServerMessageId);
  const messageId = toBigIntId(message.id);
  if (markerId != null && messageId != null) {
    return messageId <= markerId;
  }

  const messageTime = new Date(message.sendTime).getTime();
  return Number.isFinite(messageTime) && messageTime <= marker.clearedAtMs;
}

export function createClearMarkerFromMessages(
  messages: readonly Message[],
  nowMs?: number,
): ConversationClearMarker {
  let maxServerId: bigint | null = null;
  let maxSendTime = 0;

  for (const message of messages) {
    const id = toBigIntId(message.id);
    if (id != null && (maxServerId == null || id > maxServerId)) {
      maxServerId = id;
    }

    const time = new Date(message.sendTime).getTime();
    if (Number.isFinite(time) && time > maxSendTime) {
      maxSendTime = time;
    }
  }

  return {
    clearedAtMs: maxSendTime > 0 ? maxSendTime : nowMs ?? 0,
    lastServerMessageId: maxServerId != null ? maxServerId.toString() : undefined,
  };
}
