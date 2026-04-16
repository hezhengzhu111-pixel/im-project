import {ElMessageBox} from "element-plus";
import {messageService} from "@/services/message";
import {useChatStore} from "@/stores/chat";
import type {Message} from "@/types";
import {useErrorHandler} from "@/hooks/useErrorHandler";

export function useMessageActions() {
  const chatStore = useChatStore();
  const { capture, notifySuccess } = useErrorHandler("message-actions");

  const syncMessageStatus = async (
    message: Message,
    partial: Partial<Message> | undefined,
    status: Message["status"],
  ) => {
    await chatStore.addMessage({
      ...message,
      ...partial,
      id: String(partial?.id || message.id),
      senderId: String(partial?.senderId || message.senderId),
      receiverId: partial?.receiverId || message.receiverId,
      groupId: partial?.groupId || message.groupId,
      status,
    });
  };

  const copy = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      notifySuccess("Copied");
    } catch (error) {
      capture(error, "Copy failed");
    }
  };

  const recall = async (message: Message) => {
    try {
      const response = await messageService.recallMessage(message.id);
      await syncMessageStatus(message, response.data, "RECALLED");
      notifySuccess("Message recalled");
    } catch (error) {
      capture(error, "Recall failed");
    }
  };

  const remove = async (message: Message) => {
    try {
      await ElMessageBox.confirm("Delete this message?", "Confirm", {
        confirmButtonText: "Delete",
        cancelButtonText: "Cancel",
        type: "warning",
      });
      const response = await messageService.deleteMessage(message.id);
      await syncMessageStatus(message, response.data, "DELETED");
      notifySuccess("Message deleted");
    } catch (error) {
      if (error !== "cancel" && error !== "close") {
        capture(error, "Delete failed");
      }
    }
  };

  return {
    copy,
    recall,
    remove,
  };
}
