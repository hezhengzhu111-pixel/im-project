/**
 * 聊天会话相关类型定义
 */

import type { Message } from './message';
import type { User } from './user';
import type { Group } from './group';

/** 聊天会话 */
export interface ChatSession {
  id: string;
  type: 'private' | 'group';
  targetId: string;
  targetName: string;
  name?: string;
  avatar?: string;
  targetAvatar?: string;
  lastMessage?: (Partial<Message> & Record<string, unknown>) | string;
  unreadCount: number;
  lastActiveTime: string;
  updateTime?: string;
  memberCount?: number;
  isPinned: boolean;
  pinned?: boolean;
  isMuted: boolean;
  muted?: boolean;
}

/** 聊天项 */
export interface ChatItem {
  id: string;
  type: 'PRIVATE' | 'GROUP';
  targetId: string;
  targetInfo: User | Group;
  lastMessage?: Message;
  unreadCount: number;
  lastActiveTime: string;
  isPinned: boolean;
  isMuted: boolean;
}

/** 在线状态 */
export interface OnlineStatus {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeen?: string;
}

/** WebSocket 消息 */
export interface WebSocketMessage {
  type: 'MESSAGE' | 'HEARTBEAT' | 'ONLINE_STATUS' | 'READ_RECEIPT' | 'SYSTEM';
  data: unknown;
  timestamp: number;
}
