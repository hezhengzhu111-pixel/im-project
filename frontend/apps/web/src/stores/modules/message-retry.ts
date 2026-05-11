import type { messageService } from "@/services/message";
import type { messageRepo } from "@/utils/messageRepo";

type MessageServiceLike = Pick<
  typeof messageService,
  "sendPrivate" | "sendPrivateEncrypted" | "sendGroup"
>;

type MessageRepoLike = Pick<
  typeof messageRepo,
  "listPendingMessages" | "removePendingMessage"
>;

export async function retryPendingMessages(
  messageService: MessageServiceLike,
  messageRepo: MessageRepoLike,
): Promise<void> {
  const pending = await messageRepo.listPendingMessages();
  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload);
      if (payload.sendType === "group") {
        await messageService.sendGroup(payload.data);
      } else if (
        payload.encrypted === true ||
        payload.data?.encrypted === true
      ) {
        const data = payload.data;
        if (
          !data ||
          !data.content ||
          !data.e2eeHeader ||
          !data.e2eeDeviceId
        ) {
          await messageRepo.removePendingMessage(item.localId);
          continue;
        }
        await messageService.sendPrivateEncrypted(data);
      } else {
        await messageService.sendPrivate(payload.data);
      }
      await messageRepo.removePendingMessage(item.localId);
    } catch {
      // Still failing — leave in queue
    }
  }
}
