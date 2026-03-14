// 消息类型枚举 - 与后端MessageType枚举保持一致
export type MessageType =
  | "TEXT"
  | "IMAGE"
  | "FILE"
  | "VOICE"
  | "VIDEO"
  | "SYSTEM";

// 消息状态枚举 - 与后端MessageStatus枚举保持一致
export type MessageStatus =
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "OFFLINE"
  | "RECALLED"
  | "DELETED";

// 消息实体 - 基于后端MessageDTO和Message实体
export interface Message {
  id: string | number; // 支持后端的Long类型
  messageId?: string; // WebSocket消息的messageId字段
  senderId: string | number; // 支持后端的Long类型
  senderName?: string; // 发送者名称
  senderAvatar?: string; // 发送者头像
  receiverId?: string | number; // 支持后端的Long类型
  receiverName?: string; // 接收者名称
  receiverAvatar?: string; // 接收者头像
  groupId?: string | number; // 支持后端的Long类型
  groupName?: string; // 群组名称
  groupAvatar?: string; // 群组头像
  messageType: MessageType;
  content: string;
  mediaUrl?: string; // 媒体文件URL
  mediaSize?: number; // 媒体文件大小
  mediaName?: string; // 媒体文件名称
  thumbnailUrl?: string; // 缩略图URL
  duration?: number; // 音视频时长
  sendTime: string;
  status?: MessageStatus | string; // 兼容后端字符串状态
  createdTime?: string;
  createdAt?: string;
  created_at?: string;
  updatedTime?: string;
  updatedAt?: string;
  updated_at?: string;
  readStatus?: number;
  read_status?: number;
  readAt?: string;
  read_at?: string;
  readBy?: Array<string | number>;
  readByCount?: number;
  extra?: string; // 扩展信息JSON字符串
  sender?: {
    id: string | number;
    username: string;
    nickname: string;
    avatar?: string;
  };
  // 兼容WebSocket消息格式
  type?: MessageType; // WebSocket消息可能使用type字段
}

// 发送私聊消息请求 - 与后端SendPrivateMessageRequest保持一致
export interface SendPrivateMessageRequest {
  receiverId: string | number;
  messageType?: MessageType; // 使用MessageType枚举
  content?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  locationInfo?: string;
  replyToMessageId?: number; // 对应后端Long类型
}

// 发送群聊消息请求 - 与后端SendGroupMessageRequest保持一致
export interface SendGroupMessageRequest {
  groupId: string | number;
  messageType?: MessageType; // 使用MessageType枚举
  content?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  locationInfo?: string;
  replyToMessageId?: number; // 对应后端Long类型
}

// 消息搜索结果
export interface MessageSearchResult {
  message: Message;
  highlight: string;
  context: Message[];
}

// 文件上传响应已移至 api.ts 中统一管理

// 文件消息扩展信息
export interface FileMessageExtra {
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  thumbnailUrl?: string;
}

// 语音消息扩展信息
export interface VoiceMessageExtra {
  duration: number;
  fileUrl: string;
  waveform?: number[];
}

// 视频消息扩展信息
export interface VideoMessageExtra {
  duration: number;
  fileUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
}

// 图片消息扩展信息
export interface ImageMessageExtra {
  fileUrl: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
}
