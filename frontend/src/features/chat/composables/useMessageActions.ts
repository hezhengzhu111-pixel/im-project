import { ElMessageBox } from "element-plus";
import { messageService } from "@/services/message";
import { useChatStore } from "@/stores/chat";
import type { Message } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export function useMessageActions() {
  const chatStore = useChatStore();
  const { capture, notifySuccess } = useErrorHandler("message-actions");

  const copy = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      notifySuccess("已复制");
    } catch (error) {
      capture(error, "复制失败");
    }
  };

  const recall = async (message: Message) => {
    try {
      await messageService.recallMessage(message.id);
      await chatStore.addMessage({
        ...message,
        status: "RECALLED",
        content: "消息已撤回",
      });
      notifySuccess("已撤回");
    } catch (error) {
      capture(error, "撤回失败");
    }
  };

  const remove = async (message: Message) => {
    try {
      await ElMessageBox.confirm("确定删除这条消息吗？", "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      });
      await chatStore.deleteMessage(message.id);
      notifySuccess("删除成功");
    } catch (error) {
      if (error !== "cancel" && error !== "close") {
        capture(error, "删除失败");
      }
    }
  };

  return {
    copy,
    recall,
    remove,
  };
}
