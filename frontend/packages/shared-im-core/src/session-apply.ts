import type { ChatSession, Message } from "@im/shared-types";

/**
 * 将消息应用到会话的纯函数结果。
 * 端侧拿到后自行赋值到 Pinia/Zustand state。
 */
export interface SessionApplyResult {
  lastMessage: Message;
  lastMessageTime: string;
  lastActiveTime: string;
  unreadIncrement: boolean;
}

/**
 * 纯函数：根据消息和选项，计算会话应更新的字段。
 *
 * 规则（S9）：
 * - lastMessage、lastMessageTime、lastActiveTime 始终更新为消息的 sendTime
 * - unreadIncrement 仅当 incrementUnread 为 true 时为 true
 *
 * 不读取运行时环境，不修改输入。
 */
export const applyMessageToSession = (
  session: Pick<ChatSession, "id">,
  message: Message,
  options?: { incrementUnread?: boolean },
): SessionApplyResult => ({
  lastMessage: message,
  lastMessageTime: message.sendTime,
  lastActiveTime: message.sendTime,
  unreadIncrement: Boolean(options?.incrementUnread),
});
