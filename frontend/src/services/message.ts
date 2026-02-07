import { http } from "@/utils/request";
import type { Message, SendPrivateMessageRequest, SendGroupMessageRequest, MessageSearchResult } from "@/types/message";
import type { ChatSession } from "@/types"; // Need ChatSession type, likely in types/chat.ts or types/index.ts

export const messageService = {
  sendPrivate: (data: SendPrivateMessageRequest) => http.post<Message>("/message/send/private", data),
  sendGroup: (data: SendGroupMessageRequest) => http.post<Message>("/message/send/group", data),
  getPrivateHistory: (friendId: string, params: any) => http.get<Message[]>(`/message/private/${friendId}`, { params }),
  getPrivateHistoryCursor: (friendId: string, params: any) =>
    http.get<Message[]>(`/message/private/${friendId}/cursor`, { params }),
  getGroupHistory: (groupId: string, params: any) => http.get<Message[]>(`/message/group/${groupId}`, { params }),
  getGroupHistoryCursor: (groupId: string, params: any) =>
    http.get<Message[]>(`/message/group/${groupId}/cursor`, { params }),
  markRead: (conversationId: string) => http.post(`/message/read/${conversationId}`),
  recallMessage: (messageId: string) => http.post<Message>(`/message/recall/${messageId}`),
  deleteMessage: (messageId: string) => http.post<Message>(`/message/delete/${messageId}`),
  getConversations: () => http.get<any[]>("/message/conversations"),
  getConfig: () => http.get<any>("/message/config"),
};
