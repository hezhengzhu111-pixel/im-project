export type MessageType =
  | "TEXT"
  | "IMAGE"
  | "FILE"
  | "VIDEO"
  | "VOICE"
  | "SYSTEM";

export type MessageStatus =
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "OFFLINE"
  | "RECALLED"
  | "DELETED";

export interface Message {
  id: string;
  messageId?: string;
  clientMessageId?: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  receiverId?: string;
  receiverName?: string;
  groupId?: string;
  groupName?: string;
  groupAvatar?: string;
  isGroupChat: boolean;
  messageType: MessageType;
  content: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  sendTime: string;
  status: MessageStatus;
  extra?: Record<string, unknown>;
  readBy?: string[];
  readByCount?: number;
  readStatus?: number;
  readAt?: string;
}

export interface RawMessageDTO {
  id?: string | number;
  messageId?: string | number;
  clientMessageId?: string;
  client_message_id?: string;
  senderId?: string | number;
  sender_id?: string | number;
  sender?: {
    id?: string | number;
    username?: string;
    nickname?: string;
    avatar?: string;
  };
  senderName?: string;
  senderAvatar?: string;
  receiverId?: string | number;
  receiver_id?: string | number;
  receiver?: {
    id?: string | number;
  };
  receiverName?: string;
  groupId?: string | number;
  group_id?: string | number;
  group?: {
    id?: string | number;
  };
  groupName?: string;
  groupAvatar?: string;
  isGroupChat?: boolean;
  isGroupMessage?: boolean;
  isGroup?: boolean;
  type?: string;
  messageType?: string;
  content?: unknown;
  mediaUrl?: string;
  media_url?: string;
  mediaSize?: number | string;
  media_size?: number | string;
  mediaName?: string;
  media_name?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  duration?: number | string;
  sendTime?: string;
  send_time?: string;
  created_at?: string;
  createdAt?: string;
  createdTime?: string;
  created_time?: string;
  status?: string | number;
  extra?: Record<string, unknown>;
  readBy?: Array<string | number>;
  read_by_count?: number | string;
  readByCount?: number | string;
  readStatus?: number | string;
  readAt?: string;
  read_at?: string;
}

export interface MessageConfig {
  textEnforce: boolean;
  textMaxLength: number;
}

export interface SendPrivateMessageRequest {
  receiverId: string;
  clientMessageId?: string;
  messageType: MessageType;
  content?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  extra?: Record<string, unknown>;
}

export interface SendGroupMessageRequest {
  groupId: string;
  clientMessageId?: string;
  messageType: MessageType;
  content?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  extra?: Record<string, unknown>;
}

export interface MessageSearchResult {
  message: Message;
  highlight: string;
  context: Message[];
}

export interface ReadReceipt {
  readerId: string;
  toUserId?: string;
  conversationId?: string;
  lastReadMessageId?: string;
  readAt?: string;
}
