import type { User, Friendship } from "./user";
import type { Group } from "./group";
import type { Message } from "./message";

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

export type FriendListDTO = Friendship;
