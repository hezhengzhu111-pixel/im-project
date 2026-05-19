import {
  normalizeConversation,
  safePreferExistingId,
} from "@/normalizers/chat";
import {
  normalizeMessage,
  normalizeMessageConfig,
} from "@/normalizers/message";
import { http } from "@/utils/request";
import { MESSAGE_ENDPOINTS } from "@im/shared-api-contract";
import type { ApiResponse } from "@/types/api";
import type { E2eeEnvelope } from "@/features/e2ee/types";
import type {
  ChatSession,
  Message,
  MessageConfig,
  SendGroupMessageRequest,
  SendPrivateMessageRequest,
} from "@/types";

const normalizeMessages = (raw: unknown): Message[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => normalizeMessage(item));
};

export const messageService = {
  async sendPrivate(
    data: SendPrivateMessageRequest,
  ): Promise<ApiResponse<Message>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.SEND_PRIVATE, data);
    return {
      ...response,
      data: normalizeMessage(response.data, new Date().toISOString()),
    } as ApiResponse<Message>;
  },
  async sendPrivateEncrypted(data: {
    receiverId: string;
    clientMessageId?: string;
    messageType: string;
    content?: string;
    encrypted: boolean;
    e2eeEnvelope: E2eeEnvelope;
    e2eeDeviceId: string;
  }): Promise<ApiResponse<Message>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.SEND_PRIVATE, data);
    return {
      ...response,
      data: normalizeMessage(response.data, new Date().toISOString()),
    } as ApiResponse<Message>;
  },
  async sendGroup(
    data: SendGroupMessageRequest,
  ): Promise<ApiResponse<Message>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.SEND_GROUP, data);
    return {
      ...response,
      data: normalizeMessage(response.data, new Date().toISOString()),
    } as ApiResponse<Message>;
  },
  async getPrivateHistory(
    friendId: string,
    params: Record<string, unknown>,
  ): Promise<ApiResponse<Message[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.PRIVATE_HISTORY.replace(":friendId", friendId), {
      params,
    });
    return {
      ...response,
      data: normalizeMessages(response.data),
    } as ApiResponse<Message[]>;
  },
  async getPrivateHistoryCursor(
    friendId: string,
    params: Record<string, unknown>,
  ): Promise<ApiResponse<Message[]>> {
    const response = await http.get<unknown[]>(
      MESSAGE_ENDPOINTS.PRIVATE_HISTORY_CURSOR.replace(":friendId", friendId),
      { params },
    );
    return {
      ...response,
      data: normalizeMessages(response.data),
    } as ApiResponse<Message[]>;
  },
  async getGroupHistory(
    groupId: string,
    params: Record<string, unknown>,
  ): Promise<ApiResponse<Message[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.GROUP_HISTORY.replace(":groupId", groupId), {
      params,
    });
    return {
      ...response,
      data: normalizeMessages(response.data),
    } as ApiResponse<Message[]>;
  },
  async getGroupHistoryCursor(
    groupId: string,
    params: Record<string, unknown>,
  ): Promise<ApiResponse<Message[]>> {
    const response = await http.get<unknown[]>(
      MESSAGE_ENDPOINTS.GROUP_HISTORY_CURSOR.replace(":groupId", groupId),
      { params },
    );
    return {
      ...response,
      data: normalizeMessages(response.data),
    } as ApiResponse<Message[]>;
  },
  markRead: (conversationId: string) =>
    http.post(MESSAGE_ENDPOINTS.MARK_READ.replace(":conversationId", conversationId)),
  async recallMessage(messageId: string): Promise<ApiResponse<Message>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.RECALL.replace(":messageId", messageId));
    return {
      ...response,
      data: normalizeMessage(response.data, new Date().toISOString()),
    } as ApiResponse<Message>;
  },
  async deleteMessage(messageId: string): Promise<ApiResponse<Message>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.DELETE.replace(":messageId", messageId));
    return {
      ...response,
      data: normalizeMessage(response.data, new Date().toISOString()),
    } as ApiResponse<Message>;
  },
  async getConversations(
    currentUserId: string,
  ): Promise<ApiResponse<ChatSession[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.CONVERSATIONS);
    const data = Array.isArray(response.data)
      ? response.data
          .map((item) => normalizeConversation(item, currentUserId))
          .filter((item): item is ChatSession => item != null)
          .map((session) => ({
            ...session,
            id: safePreferExistingId(session.id, session.id),
          }))
      : [];
    return {
      ...response,
      data,
    } as ApiResponse<ChatSession[]>;
  },
  async getConfig(): Promise<ApiResponse<MessageConfig>> {
    const response = await http.get<unknown>(MESSAGE_ENDPOINTS.CONFIG);
    return {
      ...response,
      data: normalizeMessageConfig(response.data),
    } as ApiResponse<MessageConfig>;
  },
};
