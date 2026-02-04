// 聊天会话相关类型定义

// 会话类型
export type ConversationType = "PRIVATE" | "GROUP";

// 会话实体
export interface Conversation {
  id: string;
  type: ConversationType;
  targetId: string; // 私聊时为好友ID，群聊时为群组ID
  targetName: string; // 私聊时为好友昵称，群聊时为群组名称
  targetAvatar: string; // 私聊时为好友头像，群聊时为群组头像
  lastMessage?: {
    id: string;
    content: string;
    sendTime: string;
    senderName: string;
  };
  unreadCount: number;
  updateTime: string;
  pinned: boolean; // 是否置顶
  muted: boolean; // 是否静音
}

// 聊天会话状态
export interface ChatState {
  currentConversation: Conversation | null;
  conversations: Conversation[];
  messages: Record<string, any[]>; // 按会话ID存储消息
  typing: Record<string, boolean>; // 正在输入状态
}
