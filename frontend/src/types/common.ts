/**
 * 公共类型定义
 */

import type { User, UserInfo } from './user';
import type { Group } from './group';
import type { Message } from './message';

/** 文件信息 */
export interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  thumbnailUrl?: string;
  uploadTime: string;
}

/** 上传进度 */
export interface UploadProgress {
  file: File;
  progress: number;
  status: 'UPLOADING' | 'SUCCESS' | 'ERROR';
  url?: string;
  error?: string;
}

/** 用户设置 */
export interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-CN' | 'en-US';
  notifications: {
    sound: boolean;
    desktop: boolean;
    preview: boolean;
  };
  privacy: {
    showOnlineStatus: boolean;
    allowSearchByPhone: boolean;
    allowSearchByEmail: boolean;
  };
  chat: {
    enterToSend: boolean;
    showTimestamp: boolean;
    fontSize: 'small' | 'medium' | 'large';
  };
}

/** 搜索结果 */
export interface SearchResult {
  users: User[];
  groups: Group[];
  messages: Message[];
}

/** 菜单项 */
export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: MenuItem[];
  disabled?: boolean;
}

/** 标签项 */
export interface TabItem {
  name: string;
  label: string;
  icon?: string;
  closable?: boolean;
}

/** 表单规则 */
export interface FormRule {
  required?: boolean;
  message?: string;
  trigger?: string | string[];
  min?: number;
  max?: number;
  pattern?: RegExp;
  validator?: (rule: unknown, value: unknown, callback: (error?: Error) => void) => void;
}

/** 表单规则集合 */
export interface FormRules {
  [key: string]: FormRule[];
}

/** 事件数据 */
export interface EventData {
  type: string;
  payload: unknown;
  timestamp: number;
}

/** 好友信息 */
export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  friendInfo?: User;
  friend?: UserInfo;
  username?: string;
  nickname?: string;
  avatar?: string;
  signature?: string;
  lastSeen?: string;
  remark?: string;
  createTime: string;
}

/** 好友列表 DTO */
export type FriendListDTO = Friend;

/** 好友请求 */
export interface FriendRequest {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantAvatar: string;
  reason: string;
  status: string;
  createTime: string;
}
