export interface E2eeEnvelope {
  version: 2;
  algorithm: "rust-x25519-x3dh-dr-v1";
  senderDeviceId: string;
  recipientDeviceId: string;
  sessionId: string;
  handshake?: string;
  wire: string;
}

export type MessageType =
  | "TEXT"
  | "IMAGE"
  | "FILE"
  | "VIDEO"
  | "VOICE"
  | "SYSTEM"
  | "AI_REPLY";

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
  receiverAvatar?: string;
  groupId?: string;
  conversationSeq?: number;
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
  mentionedUserIds?: string[];
  readBy?: string[];
  readByCount?: number;
  readStatus?: number;
  readAt?: string;
  isAiGenerated?: boolean;
  aiProvider?: string;
  aiModel?: string;
  encrypted?: boolean | number;
  e2eeHeader?: string;
  e2eeDeviceId?: string;
  e2eeSenderIdentityKey?: string;
  e2eeEphemeralKey?: string;
  e2eeEnvelope?: E2eeEnvelope;
  /**
   * 解密状态：success=已解密, failed=解密失败, session_missing=缺少会话, skipped_own=自己的加密消息。
   * 仅内存态，不持久化。content 为展示明文（解密后写入或 own message 本地明文）。
   */
  decryptStatus?: "success" | "failed" | "session_missing" | "skipped_own";
}

export interface RawMessageDTO {
  id?: string | number;
  messageId?: string | number;
  message_id?: string | number;
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
    username?: string;
    nickname?: string;
    avatar?: string;
  };
  receiverName?: string;
  receiverAvatar?: string;
  groupId?: string | number;
  group_id?: string | number;
  conversationSeq?: number | string;
  conversation_seq?: number | string;
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
  isAiGenerated?: boolean;
  is_ai_generated?: boolean;
  aiProvider?: string;
  ai_provider?: string;
  aiModel?: string;
  ai_model?: string;
  encrypted?: boolean | number;
  e2eeHeader?: string;
  e2ee_header?: string;
  e2eeDeviceId?: string;
  e2ee_device_id?: string;
  e2eeSenderIdentityKey?: string;
  e2ee_sender_identity_key?: string;
  e2eeEphemeralKey?: string;
  e2ee_ephemeral_key?: string;
  e2eeEnvelope?: E2eeEnvelope;
  e2ee_envelope?: E2eeEnvelope;
  decryptStatus?: string;
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
  e2eeEnvelope?: E2eeEnvelope;
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
  mentionedUserIds?: string[];
  e2eeEnvelope?: E2eeEnvelope;
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
  lastReadSeq?: number;
  readAt?: string;
}
