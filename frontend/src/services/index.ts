import { userService } from "./user";
import { messageService } from "./message";
import { fileService } from "./file";
import { heartbeatService } from "./heartbeat";
import { authService } from "./auth";
import type { FileDeleteRef } from "./file";

export * from "./user";
export * from "./message";
export * from "./friend";
export * from "./group";
export * from "./file";
export * from "./im";
export * from "./heartbeat";
export * from "./auth";

export const userApi = {
  loginWithPassword: (username: string, password: string) =>
    userService.login({ username, password }),
  register: (data: any) => userService.register(data),
  updateUserInfo: (data: any) => userService.updateProfile(data),
  searchUsers: (keyword: string) => userService.search(keyword),
  online: () => userService.online(),
  logout: () => userService.logout(),
  changePassword: (data: any) => userService.changePassword(data),
  sendPhoneCode: (phone: string) => userService.sendPhoneCode(phone),
  bindPhone: (data: any) => userService.bindPhone(data),
  sendEmailCode: (email: string) => userService.sendEmailCode(email),
  bindEmail: (data: any) => userService.bindEmail(data),
  deleteAccount: (data: any) => userService.deleteAccount(data),
  getSettings: () => userService.getSettings(),
  updateSettings: (type: string, data: any) => userService.updateSettings(type, data),
};

export const messageApi = {
  sendPrivateMessage: (data: any) => messageService.sendPrivate(data),
  sendGroupMessage: (data: any) => messageService.sendGroup(data),
  sendPrivate: (data: any) => messageService.sendPrivate(data),
  sendGroup: (data: any) => messageService.sendGroup(data),
  getPrivateHistory: (friendId: string, params: any) =>
    messageService.getPrivateHistory(friendId, params),
  getGroupHistory: (groupId: string, params: any) =>
    messageService.getGroupHistory(groupId, params),
  markAsRead: (conversationId: string) =>
    messageService.markRead(conversationId),
  markRead: (conversationId: string) => messageService.markRead(conversationId),
  recallMessage: (messageId: string) => messageService.recallMessage(messageId),
  deleteMessage: (messageId: string) => messageService.deleteMessage(messageId),
  getConversations: () => messageService.getConversations(),
};

export const fileApi = {
  upload: (file: File, onProgress?: (progress: number) => void) =>
    fileService.upload(file, onProgress),
  uploadImage: (file: File, onProgress?: (progress: number) => void) =>
    fileService.uploadImage(file, onProgress),
  uploadVideo: (file: File, onProgress?: (progress: number) => void) =>
    fileService.uploadVideo(file, onProgress),
  uploadAudio: (file: File, onProgress?: (progress: number) => void) =>
    fileService.uploadAudio(file, onProgress),
  delete: (fileRef: FileDeleteRef) => fileService.delete(fileRef),
};

export const imApi = {
  heartbeat: (userIds: string[]) => userService.checkOnlineStatus(userIds),
};

export const authApi = {
  parseAccessToken: (token: string, allowExpired: boolean = true) =>
    authService.parseAccessToken(token, allowExpired),
  issueWsTicket: () => authService.issueWsTicket(),
};
