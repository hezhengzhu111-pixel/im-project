// API 响应基础结构 - 基于接口文档统一响应格式
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
  success: boolean;
  traceId?: string;
}

// 分页请求参数
export interface PageRequest {
  page: number;
  size: number;
  sort?: string;
  order?: "asc" | "desc";
}

// 分页响应数据
export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

// 文件上传响应
export interface FileUploadResponse {
  originalFilename: string;
  filename: string;
  url: string;
  size: number;
  contentType: string;
  category: string;
  uploadDate: string;
  uploadTime: number;
  uploaderId: number;
}

// 错误响应
export interface ErrorResponse {
  code: number;
  message: string;
  details?: string;
  timestamp: number;
  path?: string;
}

// 登录响应 - 基于接口文档
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  userId: string;
  username: string;
}

// 刷新令牌响应
export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

// 验证令牌响应
export interface VerifyTokenResponse {
  valid: boolean;
  userId?: string;
  username?: string;
  expiresAt?: number;
}

// 统计数据
export interface Statistics {
  totalUsers: number;
  onlineUsers: number;
  totalMessages: number;
  todayMessages: number;
}

// 系统配置
export interface SystemConfig {
  siteName: string;
  siteDescription: string;
  allowRegister: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  messageRetentionDays: number;
}
