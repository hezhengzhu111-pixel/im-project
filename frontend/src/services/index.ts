import { userService } from "./user";
import { messageService } from "./message";
import { fileService } from "./file";
import { heartbeatService } from "./heartbeat";

export * from "./user";
export * from "./message";
export * from "./friend";
export * from "./group";
export * from "./file";
export * from "./im";
export * from "./heartbeat";

export const userApi = {
  loginWithPassword: (username: string, password: string) => 
    userService.login({ username, password }),
  register: (data: any) => 
    userService.register(data),
  updateUserInfo: (data: any) => 
    userService.updateProfile(data),
  getUserInfo: (userId: string) => 
    userService.getUserInfo(userId),
  searchUsers: (keyword: string) => 
    userService.search(keyword),
  logout: () => 
    userService.logout(),
};

export const messageApi = {
  sendPrivate: (data: any) => 
    messageService.sendPrivate(data),
  sendGroup: (data: any) => 
    messageService.sendGroup(data),
  getHistory: (sessionId: string, params: any) => 
    messageService.getHistory(sessionId, params),
  markRead: (sessionId: string, messageIds?: string[]) => 
    messageService.markRead(sessionId, messageIds),
  getOfflineMessages: () => 
    messageService.getOfflineMessages(),
  getConversations: () => 
    messageService.getConversations(),
  searchMessages: (keyword: string, sessionId?: string) => 
    messageService.searchMessages(keyword, sessionId),
  deleteMessage: (messageId: string) => 
    messageService.deleteMessage(messageId),
  clearMessages: (sessionId: string) => 
    messageService.clearMessages(sessionId),
};

export const fileApi = {
  upload: (file: File) => 
    fileService.upload(file),
};

export const imApi = {
  heartbeat: (userIds: string[]) => 
    userService.checkOnlineStatus(userIds),
};
