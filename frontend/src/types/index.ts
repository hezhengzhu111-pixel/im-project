/**
 * 类型定义统一入口
 * 定义所有核心数据类型
 */

// 基础API响应类型
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

// 用户相关类型
export interface User {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
  email?: string;
  phone?: string;
  status: "ONLINE" | "OFFLINE" | "BUSY" | "AWAY";
  lastLoginTime?: string;
  createTime?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
  email?: string;
  phone?: string;
}

// 消息相关类型
export type MessageType =
  | "TEXT"
  | "IMAGE"
  | "FILE"
  | "AUDIO"
  | "VIDEO"
  | "VOICE"
  | "SYSTEM";
export type MessageStatus =
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

export interface Message {
  id: string;
  messageId?: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  receiverId?: string;
  receiverName?: string;
  groupId?: string;
  groupName?: string;
  isGroupChat: boolean;
  type: MessageType;
  messageType?: MessageType;
  content: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  sendTime: string;
  status: MessageStatus | string;
  extra?: Record<string, any>;
  thumbnailUrl?: string;
  duration?: number;
}

export interface SendMessageRequest {
  receiverId?: string;
  groupId?: string;
  isGroupChat: boolean;
  type: MessageType;
  content: string;
  extra?: Record<string, any>;
}

// 好友相关类型
export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  friendInfo: User;
  remark?: string;
  createTime: string;
}

export interface FriendRequest {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantAvatar: string;
  reason: string;
  status: string;
  createTime: string;
}

// 群组相关类型
export interface Group {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  ownerId: string;
  memberCount: number;
  maxMembers: number;
  isPublic: boolean;
  createTime: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  userInfo: User;
  role: "OWNER" | "ADMIN" | "MEMBER";
  nickname?: string;
  joinTime: string;
}

// 聊天相关类型
// 聊天会话接口
export interface ChatSession {
  id: string;
  type: "private" | "group";
  targetId: string;
  targetName: string;
  targetAvatar?: string;
  lastMessage?: Message;
  unreadCount: number;
  lastActiveTime: string;
  isPinned: boolean;
  isMuted: boolean;
}

export interface ChatItem {
  id: string;
  type: "PRIVATE" | "GROUP";
  targetId: string; // 好友ID或群组ID
  targetInfo: User | Group;
  lastMessage?: Message;
  unreadCount: number;
  lastActiveTime: string;
  isPinned: boolean;
  isMuted: boolean;
}

// WebSocket相关类型
export interface WebSocketMessage {
  type: "MESSAGE" | "HEARTBEAT" | "ONLINE_STATUS" | "SYSTEM";
  data: any;
  timestamp: number;
}

export interface OnlineStatus {
  userId: string;
  status: "ONLINE" | "OFFLINE";
  lastSeen?: string;
}

// 文件相关类型
export interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  thumbnailUrl?: string;
  uploadTime: string;
}

export interface UploadProgress {
  file: File;
  progress: number;
  status: "UPLOADING" | "SUCCESS" | "ERROR";
  url?: string;
  error?: string;
}

// 设置相关类型
export interface UserSettings {
  theme: "light" | "dark" | "auto";
  language: "zh-CN" | "en-US";
  notifications: {
    sound: boolean;
    desktop: boolean;
    preview: boolean;
  };
  privacy: {
    showOnlineStatus: boolean;
    allowSearchByPhone: boolean;
    allowSearchByEmail: boolean;
  };
  chat: {
    enterToSend: boolean;
    showTimestamp: boolean;
    fontSize: "small" | "medium" | "large";
  };
}

// 搜索相关类型
export interface SearchResult {
  users: User[];
  groups: Group[];
  messages: Message[];
}

// 分页相关类型
export interface PageRequest {
  page: number;
  size: number;
  sort?: string;
  order?: "asc" | "desc";
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  first: boolean;
  last: boolean;
}

// 表单相关类型
export interface FormRule {
  required?: boolean;
  message?: string;
  trigger?: string | string[];
  min?: number;
  max?: number;
  pattern?: RegExp;
  validator?: (rule: any, value: any, callback: any) => void;
}

export interface FormRules {
  [key: string]: FormRule[];
}

// 组件相关类型
export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: MenuItem[];
  disabled?: boolean;
}

export interface TabItem {
  name: string;
  label: string;
  icon?: string;
  closable?: boolean;
}

// 事件相关类型
export interface EventData {
  type: string;
  payload: any;
  timestamp: number;
}

// 导出所有类型
export * from "./api";
export * from "./chat";
export * from "./group";
export * from "./message";
export * from "./user";
