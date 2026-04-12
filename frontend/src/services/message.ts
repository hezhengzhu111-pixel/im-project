import {
  normalizeConversation,
  safePreferExistingId,
} from "@/normalizers/chat";
import {
  normalizeMessage,
  normalizeMessageConfig,
} from "@/normalizers/message";
import { http } from "@/utils/request";
import type { ApiResponse } from "@/types/api";
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
  async sendPrivate(data: SendPrivateMessageRequest): Promise<ApiResponse<Message>> {
    const response = await http.post<unknown>("/message/send/private", data);
    return {
      ...response,
      data: normalizeMessage(response.data, new Date().toISOString()),
    } as ApiResponse<Message>;
  },
  async sendGroup(data: SendGroupMessageRequest): Promise<ApiResponse<Message>> {
    const response = await http.post<unknown>("/message/send/group", data);
    return {
      ...response,
      data: normalizeMessage(response.data, new Date().toISOString()),
    } as ApiResponse<Message>;
  },
  async getPrivateHistory(
    friendId: string,
    params: Record<string, unknown>,
  ): Promise<ApiResponse<Message[]>> {
    const response = await http.get<unknown[]>(`/message/private/${friendId}`, {
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
      `/message/private/${friendId}/cursor`,
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
    const response = await http.get<unknown[]>(`/message/group/${groupId}`, {
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
      `/message/group/${groupId}/cursor`,
      { params },
    );
    return {
      ...response,
      data: normalizeMessages(response.data),
    } as ApiResponse<Message[]>;
  },
  markRead: (conversationId: string) => http.post(`/message/read/${conversationId}`),
  recallMessage: (messageId: string) =>
    http.post<Message>(`/message/recall/${messageId}`),
  deleteMessage: (messageId: string) =>
    http.post<Message>(`/message/delete/${messageId}`),
  async getConversations(currentUserId: string): Promise<ApiResponse<ChatSession[]>> {
    const response = await http.get<unknown[]>("/message/conversations");
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
    const response = await http.get<unknown>("/message/config");
    return {
      ...response,
      data: normalizeMessageConfig(response.data),
    } as ApiResponse<MessageConfig>;
  },
};
