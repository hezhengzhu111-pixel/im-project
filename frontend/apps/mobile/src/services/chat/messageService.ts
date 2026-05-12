import { MESSAGE_ENDPOINTS } from '@im/shared-api-contract';
import { http } from '@/services/api/httpClient';
import { normalizeMessage, normalizeSession } from '@/utils/normalizers';
import type { ApiResponse, ChatSession, MobileMessage, MessageType } from '@/types/models';

export interface SendMessagePayload {
  receiverId?: string;
  groupId?: string;
  clientMessageId: string;
  messageType: MessageType;
  content?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaSize?: number;
  thumbnailUrl?: string;
  duration?: number;
  extra?: Record<string, unknown>;
  mentionedUserIds?: string[];
}

export const messageService = {
  async sendPrivate(data: SendMessagePayload): Promise<ApiResponse<MobileMessage>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.SEND_PRIVATE, data);
    return { ...response, data: normalizeMessage(response.data) };
  },

  sendPrivateEncrypted(): Promise<ApiResponse<MobileMessage>> {
    return Promise.reject(new Error('E2EE encrypted sending is deferred on mobile'));
  },

  async sendGroup(data: SendMessagePayload): Promise<ApiResponse<MobileMessage>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.SEND_GROUP, data);
    return { ...response, data: normalizeMessage(response.data) };
  },

  async getPrivateHistory(friendId: string, params: Record<string, unknown>): Promise<ApiResponse<MobileMessage[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.PRIVATE_HISTORY.replace(':friendId', friendId), {
      params,
    } as never);
    return { ...response, data: Array.isArray(response.data) ? response.data.map((item) => normalizeMessage(item)) : [] };
  },

  async getGroupHistory(groupId: string, params: Record<string, unknown>): Promise<ApiResponse<MobileMessage[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.GROUP_HISTORY.replace(':groupId', groupId), {
      params,
    } as never);
    return { ...response, data: Array.isArray(response.data) ? response.data.map((item) => normalizeMessage(item)) : [] };
  },

  markRead: (conversationId: string) => http.post(MESSAGE_ENDPOINTS.MARK_READ.replace(':conversationId', conversationId)),
  recallMessage: (messageId: string) => http.post<MobileMessage>(MESSAGE_ENDPOINTS.RECALL.replace(':messageId', messageId)),
  deleteMessage: (messageId: string) => http.post<MobileMessage>(MESSAGE_ENDPOINTS.DELETE.replace(':messageId', messageId)),

  async getConversations(currentUserId: string): Promise<ApiResponse<ChatSession[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.CONVERSATIONS);
    return {
      ...response,
      data: Array.isArray(response.data) ? response.data.map((item) => normalizeSession(item, currentUserId)) : [],
    };
  },

  getConfig: () => http.get<{ textEnforce: boolean; textMaxLength: number }>(MESSAGE_ENDPOINTS.CONFIG),
};
