import type { Message } from "./message";

export type ChatSessionType = "private" | "group";

export interface ChatSession {
  id: string;
  conversationId?: string;
  type: ChatSessionType;
  targetId: string;
  targetName: string;
  targetAvatar?: string;
  conversationName?: string;
  conversationAvatar?: string;
  lastMessage?: Message;
  lastMessageTime?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  unreadCount: number;
  lastActiveTime: string;
  updateTime?: string;
  memberCount?: number;
  isPinned: boolean;
  isMuted: boolean;
}

export interface RawConversationDTO {
  conversationId?: string | number;
  conversationType?: string | number;
  type?: string | number;
  targetId?: string | number;
  partnerId?: string | number;
  friendId?: string | number;
  userId?: string | number;
  conversationName?: string;
  conversationAvatar?: string;
  unreadCount?: number | string;
  lastMessage?: string | Record<string, unknown>;
  lastMessageType?: string;
  lastMessageSenderId?: string | number;
  lastMessageSenderName?: string;
  lastMessageTime?: string;
  isPinned?: boolean;
  pinned?: boolean;
  isMuted?: boolean;
  muted?: boolean;
}

export interface OnlineStatus {
  userId: string;
  status: "ONLINE" | "OFFLINE";
  lastSeen?: string;
}

export interface WebSocketMessage<TData = unknown> {
  type: "MESSAGE" | "HEARTBEAT" | "ONLINE_STATUS" | "READ_RECEIPT" | "SYSTEM";
  data: TData;
  timestamp: number;
}

export interface GroupReadUser {
  userId: string;
  displayName: string;
}

export type Conversation = ChatSession;
