import { ref, computed } from "vue";
import { messageApi } from "@/services";
import { formatTime, getAvatarText } from "@/utils/common";
import { MESSAGE_TYPES, MESSAGE_STATUS } from "@/constants";
import type {
  Message,
  SendPrivateMessageRequest,
  SendGroupMessageRequest,
} from "@/types/message";

/**
 * 消息相关的组合式函数
 */
export function useMessage() {
  const loading = ref(false);
  const sending = ref(false);

  /**
   * 发送私聊消息
   */
  const sendPrivateMessage = async (
    data: SendPrivateMessageRequest,
  ): Promise<void> => {
    sending.value = true;
    try {
      const response = await messageApi.sendPrivateMessage(data);
      if (response.code !== 200) {
        throw new Error(response.message || "消息发送失败");
      }
    } finally {
      sending.value = false;
    }
  };

  /**
   * 发送群聊消息
   */
  const sendGroupMessage = async (
    data: SendGroupMessageRequest,
  ): Promise<void> => {
    sending.value = true;
    try {
      const response = await messageApi.sendGroupMessage(data);
      if (response.code !== 200) {
        throw new Error(response.message || "消息发送失败");
      }
    } finally {
      sending.value = false;
    }
  };

  /**
   * 撤回消息
   */
  const recallMessage = async (messageId: string): Promise<void> => {
    const response = await messageApi.recallMessage(messageId);
    if (response.code !== 200) {
      throw new Error(response.message || "撤回失败");
    }
  };

  /**
   * 标记消息为已读
   */
  const markAsRead = async (conversationId: string): Promise<void> => {
    const response = await messageApi.markAsRead(conversationId);
    if (response.code !== 200) {
      // 在这里，我们选择静默失败，因为标记已读不是关键操作
      console.error("标记已读失败:", response.message);
    }
  };

  /**
   * 获取消息发送者头像文本
   */
  const getMessageSenderAvatar = (message: Message): string => {
    // 优先使用直接在Message对象上的senderName，然后再尝试从sender对象获取
    const senderName = message.senderName || message.sender?.nickname || message.sender?.username;
    return getAvatarText(senderName);
  };

  /**
   * 获取消息发送者名称
   */
  const getMessageSenderName = (message: Message): string => {
    // 优先使用直接在Message对象上的senderName，然后再尝试从sender对象获取
    return message.senderName || message.sender?.nickname || message.sender?.username || "未知用户";
  };

  /**
   * 格式化消息时间
   */
  const formatMessageTime = (time: string): string => {
    return formatTime(time);
  };

  /**
   * 检查消息是否可以撤回
   */
  const canRecallMessage = (
    message: Message,
    currentUserId: string,
  ): boolean => {
    // 只能撤回自己发送的消息
    if (String(message.senderId) !== String(currentUserId)) return false;

    // 只能撤回2分钟内的消息
    const sendTime = new Date(message.sendTime).getTime();
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;

    return now - sendTime <= twoMinutes;
  };

  /**
   * 获取消息类型显示文本
   */
  const getMessageTypeText = (messageType: string): string => {
    const typeMap: Record<string, string> = {
      [MESSAGE_TYPES.TEXT]: "文本消息",
      [MESSAGE_TYPES.IMAGE]: "图片消息",
      [MESSAGE_TYPES.FILE]: "文件消息",
      [MESSAGE_TYPES.VOICE]: "语音消息",
      [MESSAGE_TYPES.VIDEO]: "视频消息",
      [MESSAGE_TYPES.SYSTEM]: "系统消息",
    };

    return typeMap[messageType] || "未知消息";
  };

  /**
   * 获取消息状态显示文本
   */
  const getMessageStatusText = (status?: string): string => {
    if (!status) return "";

    const statusMap: Record<string, string> = {
      [MESSAGE_STATUS.SENT]: "已发送",
      [MESSAGE_STATUS.DELIVERED]: "已送达",
      [MESSAGE_STATUS.READ]: "已读",
      [MESSAGE_STATUS.RECALLED]: "已撤回",
      [MESSAGE_STATUS.DELETED]: "已删除",
    };

    return statusMap[status] || "";
  };

  return {
    loading: computed(() => loading.value),
    sending: computed(() => sending.value),
    sendPrivateMessage,
    sendGroupMessage,
    recallMessage,
    markAsRead,
    getMessageSenderAvatar,
    getMessageSenderName,
    formatMessageTime,
    canRecallMessage,
    getMessageTypeText,
    getMessageStatusText,
  };
}
