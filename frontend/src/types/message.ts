/**
 * 消息相关类型定义
 */

/** 消息类型 */
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'VIDEO' | 'VOICE' | 'SYSTEM';

/** 消息状态 */
export type MessageStatus = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'OFFLINE' | 'RECALLED' | 'DELETED';

/** 消息 */
export interface Message {
  id: string | number;
  messageId?: string;
  senderId: string | number;
  senderName?: string;
  senderAvatar?: string;
  receiverId?: string | number;
  receiverName?: string;
  groupId?: string | number;
  groupName?: string;
  groupAvatar?: string;
  isGroupChat?: boolean;
  type?: MessageType;
  messageType: MessageType;
  content: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  sendTime: string;
  status?: MessageStatus | string;
  extra?: Record<string, unknown>;
  readBy?: string[];
  readByCount?: number;
  readStatus?: number;
  readAt?: string;
}

/** 发送消息请求 */
export interface SendMessageRequest {
  receiverId?: string;
  groupId?: string;
  isGroupChat: boolean;
  type: MessageType;
  content: string;
  extra?: Record<string, unknown>;
}

export interface SendPrivateMessageRequest {
  receiverId: string | number;
  messageType: string;
  content?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  locationInfo?: string;
}

export interface SendGroupMessageRequest {
  groupId: string | number;
  messageType: string;
  content?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  locationInfo?: string;
}

/** 消息搜索结果 */
export interface MessageSearchResult {
  message: Message;
  highlight: string;
  context: Message[];
}
