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
  userId?: string;
  username: string;
  nickname: string;
  avatar?: string;
  email?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  signature?: string;
  location?: string;
  lastSeen?: string;
  status: "ONLINE" | "OFFLINE" | "BUSY" | "AWAY" | "online" | "offline" | "busy" | "away";
  lastLoginTime?: string;
  createTime?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginForm extends LoginRequest {
  rememberMe?: boolean;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
  email?: string;
  phone?: string;
}

export interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreement: boolean;
  nickname?: string;
  phone?: string;
}

export interface UserInfo {
  id: string;
  username: string;
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  signature?: string;
  location?: string;
  gender?: string;
  birthday?: string;
  lastSeen?: string;
  status?: "ONLINE" | "OFFLINE" | "BUSY" | "AWAY" | "online" | "offline" | "busy" | "away";
}

// 消息相关类型
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
  extra?: any;
}

export interface SendMessageRequest {
  receiverId?: string;
  groupId?: string;
  isGroupChat: boolean;
  type: MessageType;
  content: string;
  extra?: Record<string, any>;
}

export interface MessageSearchResult {
  message: Message;
  highlight: string;
  context: Message[];
}

// 好友相关类型
export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  friendInfo?: User;
  friend?: UserInfo;
  username?: string;
  nickname?: string;
  avatar?: string;
  signature?: string;
  lastSeen?: string;
  remark?: string;
  createTime: string;
}

export type FriendListDTO = Friend;

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
  name?: string;
  groupName?: string;
  description?: string;
  announcement?: string;
  type?: string | number;
  avatar?: string;
  ownerId: string;
  memberCount: number;
  maxMembers?: number;
  isPublic?: boolean;
  unreadCount?: number;
  lastMessageTime?: string;
  lastActivityAt?: string;
  members?: Array<{ userId: string | number; role?: string | number }>;
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
  name?: string;
  avatar?: string;
  targetAvatar?: string;
  lastMessage?: (Partial<Message> & Record<string, any>) | string;
  unreadCount: number;
  lastActiveTime: string;
  updateTime?: string;
  memberCount?: number;
  isPinned: boolean;
  pinned?: boolean;
  isMuted: boolean;
  muted?: boolean;
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
  type:
    | "MESSAGE"
    | "HEARTBEAT"
    | "ONLINE_STATUS"
    | "READ_RECEIPT"
    | "SYSTEM";
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
