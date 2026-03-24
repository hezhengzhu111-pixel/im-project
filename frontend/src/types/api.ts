/**
 * API 响应相关类型定义
 */

/** API 响应 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
  success?: boolean;
}

/** 分页请求 */
export interface PageRequest {
  page: number;
  size: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/** 分页响应 */
export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  first: boolean;
  last: boolean;
}

export interface FileUploadResponse {
  url: string;
  thumbnailUrl?: string;
  size?: number;
  fileName?: string;
  fileType?: string;
}

