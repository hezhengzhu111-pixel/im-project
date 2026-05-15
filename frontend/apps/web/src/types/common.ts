/**
 * Web 端通用 UI 类型定义
 *
 * 以下类型为 Web 端特有的 UI/视图模型类型，不是后端 DTO，不是跨端业务模型。
 * 核心业务类型（User、Message、Group 等）请从 @im/shared-types 导入。
 * 禁止在此文件新增与 shared-types 重复的核心业务类型。
 */

import type { User, Friendship } from "@im/shared-types";
import type { Group } from "@im/shared-types";
import type { Message } from "@im/shared-types";

/** 文件信息 — Web UI 专用，非后端 DTO */
export interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  thumbnailUrl?: string;
  uploadTime: string;
}

/** 上传进度 — Web UI 专用，非后端 DTO */
export interface UploadProgress {
  file: File;
  progress: number;
  status: "UPLOADING" | "SUCCESS" | "ERROR";
  url?: string;
  error?: string;
}

/** 搜索结果 — Web UI 专用，非后端 DTO */
export interface SearchResult {
  users: User[];
  groups: Group[];
  messages: Message[];
}

/** 菜单项 — Web UI 专用，非后端 DTO */
export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: MenuItem[];
  disabled?: boolean;
}

/** 标签项 — Web UI 专用，非后端 DTO */
export interface TabItem {
  name: string;
  label: string;
  icon?: string;
  closable?: boolean;
}

/** 表单规则 — Web UI 专用，非后端 DTO */
export interface FormRule {
  required?: boolean;
  message?: string;
  trigger?: string | string[];
  min?: number;
  max?: number;
  pattern?: RegExp;
  validator?: (
    rule: unknown,
    value: unknown,
    callback: (error?: Error) => void,
  ) => void;
}

/** 表单规则集合 — Web UI 专用，非后端 DTO */
export interface FormRules {
  [key: string]: FormRule[];
}

/** 事件数据 — Web UI 专用，非后端 DTO */
export interface EventData {
  type: string;
  payload: unknown;
  timestamp: number;
}

/** @deprecated 请直接使用 Friendship 类型 */
export type FriendListDTO = Friendship;
