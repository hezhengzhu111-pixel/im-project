import type { Message } from "./message.js";

export type ChatSessionType = "private" | "group";

export interface ChatSession {
  id: string;
  conversationId?: string;
  type: ChatSessionType;
  targetId: string;
  targetName: string;
  targetAvatar?: string;
  name?: string;
  avatar?: string;
  conversationType?: "PRIVATE" | "GROUP";
  conversationName?: string;
  conversationAvatar?: string;
  lastMessage?: Message;
  lastMessageTime?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  unreadCount: number;
  lastActiveTime?: string;
  updateTime?: string;
  memberCount?: number;
  encrypted?: boolean;
  isPinned?: boolean;
  pinned?: boolean;
  isMuted?: boolean;
  muted?: boolean;
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
  encrypted?: boolean | number;
}

export interface OnlineStatus {
  userId: string;
  status: "ONLINE" | "OFFLINE";
  lastSeen?: string;
}

export interface WebSocketMessage<TData = unknown> {
  type:
    | "MESSAGE"
    | "MESSAGE_STATUS_CHANGED"
    | "HEARTBEAT"
    | "ONLINE_STATUS"
    | "READ_RECEIPT"
    | "READ_SYNC"
    | "SYSTEM"
    | "FRIEND_REQUEST"
    | "FRIEND_ACCEPTED"
    | "E2EE_NEGOTIATION";
  data: TData;
  timestamp: number;
}

export interface GroupReadUser {
  userId: string;
  displayName: string;
}

/**
 * E2EE negotiation control-plane payload (E10, E11, E29).
 *
 * Carries negotiation lifecycle events (request/accepted/rejected/disabled).
 * This is a control-plane type — it must NOT contain private keys, root key,
 * chain key, message key, Ratchet state, media key, or ciphertext payload.
 *
 * Fields support both camelCase and snake_case for cross-platform compat.
 * requestPayloadJson is opaque to shared-types; its semantics are E10.1.
 */
export interface E2eeNegotiationPayload {
  action: 'request' | 'accepted' | 'rejected' | 'disabled';
  sessionId: string;
  session_id?: string;
  requesterId: string;
  requester_id?: string;
  requesterName: string;
  requester_name?: string;
  targetUserId: string;
  target_user_id?: string;
  requestPayloadJson?: string;
  request_payload_json?: string;
}

export type Conversation = ChatSession;
