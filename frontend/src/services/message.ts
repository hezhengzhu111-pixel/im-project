import { http } from "@/utils/request";
import type { Message, SendPrivateMessageRequest, SendGroupMessageRequest, MessageSearchResult } from "@/types/message";
import type { ChatSession } from "@/types"; // Need ChatSession type, likely in types/chat.ts or types/index.ts

export const messageService = {
  sendPrivate: (data: SendPrivateMessageRequest) => http.post<boolean>("/v1/messages/send/private", data),
  sendGroup: (data: SendGroupMessageRequest) => http.post<boolean>("/v1/messages/send/group", data),
  getHistory: (sessionId: string, params: any) => http.get<Message[]>(`/v1/messages/private/${params.friendId || sessionId}`, { params }), 
  markRead: (sessionId: string, messageIds?: string[]) => http.post(`/v1/messages/read/${sessionId}`),
  getOfflineMessages: () => http.get<Message[]>("/v1/messages/offline"),
  getConversations: () => http.get<any[]>("/v1/messages/conversations"),
  searchMessages: (keyword: string, sessionId?: string) => http.get<MessageSearchResult[]>("/v1/messages/search", { params: { keyword, sessionId } }),
  deleteMessage: (messageId: string) => http.delete<void>(`/v1/messages/${messageId}`),
  clearMessages: (sessionId: string) => http.delete<void>(`/v1/messages/clear/${sessionId}`),
};
