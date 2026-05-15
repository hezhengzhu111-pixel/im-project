import type { ChatSessionType, Message, MessageType } from '@im/shared-types';

export type {
  AiApiKey,
  AiSettings,
  ApiResponse,
  ChatSession,
  ChatSessionType,
  Friend,
  FriendRequest,
  Friendship,
  Group,
  GroupMember,
  LoginRequest,
  Message,
  MessageStatus,
  MessageType,
  RawMessageDTO,
  ReadReceipt,
  RegisterRequest,
  User,
  UserAuthResponse,
  UserSettings,
  WebSocketMessage,
} from '@im/shared-types';

// React Navigation params are mobile-only route payloads.
export interface ChatRouteParams {
  route?: string;
  conversationId?: string;
  sessionId?: string;
  senderId?: string;
  receiverId?: string;
  groupId?: string;
  targetId?: string;
  targetName?: string;
  groupName?: string;
  senderName?: string;
}

// Mobile cache/display message. Core IM fields come from shared Message; the
// extra fields below are React Native storage and routing metadata.
export type MobileMessage = Message & {
  // Local legacy alias for Message.messageId used by the mobile SQLite cache.
  serverId?: Message['messageId'];
  // Mobile conversation key used for local routing and offline cache buckets.
  conversationId?: string;
  rawJson?: string;
};

// Local offline-send queue row persisted by the mobile storage layer.
export interface PendingMessage {
  localId: string;
  conversationId: string;
  sendType: ChatSessionType;
  payloadJson: string;
  status: 'pending' | 'sending' | 'failed' | 'sent' | 'blocked';
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  nextRetryAt?: number;
}

// Local upload queue row for React Native file/media uploads.
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

// In-memory diagnostics entry generated only inside the mobile app.
export interface LocalLogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
  createdAt: number;
  detail?: string;
}
