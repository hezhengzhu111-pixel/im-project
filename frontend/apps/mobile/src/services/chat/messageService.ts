import { MESSAGE_ENDPOINTS } from '@im/shared-api-contract';
import { resolveGroupSessionId } from '@/utils/normalizers';
import { http } from '@/services/api/httpClient';
import { normalizeMessage, normalizeSession } from '@/utils/normalizers';
import { buildHistoryParams } from '@/services/chat/messageTypes';
import type { ApiResponse, ChatSession, MessageType } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';
import type { HistoryQueryParams } from '@/services/chat/messageTypes';

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

export const resolveMarkReadTarget = (session: Pick<ChatSession, 'type' | 'targetId'>): string =>
  session.type === 'group' ? resolveGroupSessionId(session.targetId) : session.targetId;

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

  async getPrivateHistory(friendId: string, params: HistoryQueryParams = {}): Promise<ApiResponse<MobileMessage[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.PRIVATE_HISTORY.replace(':friendId', friendId), {
      params: buildHistoryParams(params),
    } as never);
    return { ...response, data: Array.isArray(response.data) ? response.data.map((item) => normalizeMessage(item)) : [] };
  },

  async getGroupHistory(groupId: string, params: HistoryQueryParams = {}): Promise<ApiResponse<MobileMessage[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.GROUP_HISTORY.replace(':groupId', groupId), {
      params: buildHistoryParams(params),
    } as never);
    return { ...response, data: Array.isArray(response.data) ? response.data.map((item) => normalizeMessage(item)) : [] };
  },

  markRead: (readTarget: string) => http.post(MESSAGE_ENDPOINTS.MARK_READ.replace(':conversationId', readTarget)),
  async recallMessage(messageId: string): Promise<ApiResponse<MobileMessage>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.RECALL.replace(':messageId', messageId));
    return { ...response, data: normalizeMessage(response.data) };
  },

  async deleteMessage(messageId: string): Promise<ApiResponse<MobileMessage>> {
    const response = await http.post<unknown>(MESSAGE_ENDPOINTS.DELETE.replace(':messageId', messageId));
    return { ...response, data: normalizeMessage(response.data) };
  },

  async getConversations(currentUserId: string): Promise<ApiResponse<ChatSession[]>> {
    const response = await http.get<unknown[]>(MESSAGE_ENDPOINTS.CONVERSATIONS);
    return {
      ...response,
      data: Array.isArray(response.data) ? response.data.map((item) => normalizeSession(item, currentUserId)) : [],
    };
  },

  getConfig: () => http.get<{ textEnforce: boolean; textMaxLength: number }>(MESSAGE_ENDPOINTS.CONFIG),
};
