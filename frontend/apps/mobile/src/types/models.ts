export type SessionType = 'private' | 'group';

export type MessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'FILE'
  | 'VIDEO'
  | 'VOICE'
  | 'SYSTEM'
  | 'AI_REPLY';

export type MessageStatus = 'SENDING' | 'SENT' | 'FAILED' | 'READ' | 'RECALLED' | 'DELETED';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp?: number;
  success?: boolean;
}

export interface User {
  id: string;
  username: string;
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  signature?: string;
  region?: string;
  status?: string;
  permissions?: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  nickname?: string;
  email?: string;
  phone?: string;
}

export interface UserAuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  accessToken?: string;
  user?: User;
  permissions?: string[];
}

export interface UserSettings {
  privacy: Record<string, boolean>;
  message: Record<string, boolean>;
  general: Record<string, unknown>;
}

export interface Friendship {
  friendId: string;
  username?: string;
  nickname?: string;
  remark?: string;
  avatar?: string;
  online?: boolean;
  status?: string;
}

export interface FriendRequest {
  requestId: string;
  fromUserId: string;
  toUserId?: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  reason?: string;
  status: string;
  createdAt?: string;
}

export interface Group {
  id: string;
  groupName?: string;
  name?: string;
  avatar?: string;
  announcement?: string;
  ownerId?: string;
  memberCount?: number;
  lastMessageTime?: string;
  lastActivityAt?: string;
}

export interface GroupMember {
  userId: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  role?: string;
  online?: boolean;
}

export interface ChatSession {
  id: string;
  type: SessionType;
  targetId: string;
  targetName: string;
  targetAvatar?: string;
  unreadCount: number;
  lastActiveTime?: string;
  lastMessage?: MobileMessage;
  isPinned?: boolean;
  isMuted?: boolean;
  encrypted?: boolean;
  memberCount?: number;
}

export interface MobileMessage {
  id: string;
  serverId?: string;
  clientMessageId?: string;
  conversationId?: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  receiverId?: string;
  receiverName?: string;
  receiverAvatar?: string;
  groupId?: string;
  groupName?: string;
  groupAvatar?: string;
  isGroupChat?: boolean;
  messageType: MessageType;
  content?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaName?: string;
  mediaSize?: number;
  duration?: number;
  status?: MessageStatus;
  readStatus?: number;
  readBy?: string[];
  readByCount?: number;
  readAt?: string;
  sendTime: string;
  encrypted?: boolean | number;
  isAiGenerated?: boolean;
  extra?: Record<string, unknown>;
  rawJson?: string;
}

export interface PendingMessage {
  localId: string;
  conversationId: string;
  sendType: SessionType;
  payloadJson: string;
  status: 'pending' | 'sending' | 'failed' | 'sent' | 'blocked';
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  nextRetryAt?: number;
}

export interface UploadTask {
  taskId: string;
  conversationId?: string;
  localMessageId?: string;
  fileUri: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  uploadType: MessageType;
  status: 'pending' | 'uploading' | 'failed' | 'uploaded';
  progress: number;
  retryCount: number;
  remoteUrl?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AiApiKey {
  id: string;
  provider: string;
  keyName: string;
  maskedKey: string;
  isActive: boolean;
  validateStatus: string;
  lastValidatedAt?: string;
}

export interface AiSettings {
  autoReplyEnabled: boolean;
  autoReplyPersona: string;
}

export interface LocalLogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
  createdAt: number;
  detail?: string;
}
