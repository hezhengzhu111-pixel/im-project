import { http } from "./request";
import type { FileUploadResponse } from "@/types/api";
import { logger } from "@/utils/logger";

// 上传结果接口
export interface UploadResult {
  url: string;
  fileName: string;
  size: number;
  fileType: string;
}

// 文件验证结果接口
export interface FileValidation {
  valid: boolean;
  message: string;
}

// 支持的文件类型
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];
const SUPPORTED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const SUPPORTED_VIDEO_TYPES = [
  "video/mp4",
  "video/avi",
  "video/mov",
  "video/wmv",
];

// 文件大小限制（字节）
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * 验证文件
 * @param file 要验证的文件
 * @returns 验证结果
 */
export function validateFile(file: File): FileValidation {
  // 检查文件类型
  const isImage = SUPPORTED_IMAGE_TYPES.includes(file.type);
  const isDocument = SUPPORTED_DOCUMENT_TYPES.includes(file.type);
  const isVideo = SUPPORTED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isDocument && !isVideo) {
    return {
      valid: false,
      message: "不支持的文件类型",
    };
  }

  // 检查文件大小
  if (isImage && file.size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      message: "图片文件大小不能超过5MB",
    };
  }

  if (isDocument && file.size > MAX_DOCUMENT_SIZE) {
    return {
      valid: false,
      message: "文档文件大小不能超过10MB",
    };
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    return {
      valid: false,
      message: "视频文件大小不能超过50MB",
    };
  }

  return {
    valid: true,
    message: "文件验证通过",
  };
}

/**
 * 上传文件
 * @param file 要上传的文件
 * @returns 上传结果
 */
export async function uploadFile(file: File): Promise<UploadResult> {
  // 验证文件
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  // 创建FormData
  const formData = new FormData();
  formData.append("file", file);

  try {
    // 发送上传请求
    const response = await http.post<FileUploadResponse>("/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    if (response.code === 200 && response.data) {
      // 转换为UploadResult格式
      return {
        url: response.data.url,
        fileName:
          response.data.fileName ||
          response.data.filename ||
          response.data.originalFilename ||
          file.name,
        size: response.data.size || file.size,
        fileType: response.data.fileType || response.data.contentType || file.type,
      };
    } else {
      throw new Error(response.message || "上传失败");
    }
  } catch (error: any) {
    logger.error("legacy upload failed", error);
    throw new Error(error.message || "文件上传失败");
  }
}

/**
 * 获取文件类型
 * @param file 文件
 * @returns 文件类型字符串
 */
export function getFileType(file: File): string {
  if (SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return "IMAGE";
  }
  if (SUPPORTED_DOCUMENT_TYPES.includes(file.type)) {
    return "FILE";
  }
  if (SUPPORTED_VIDEO_TYPES.includes(file.type)) {
    return "VIDEO";
  }
  return "FILE";
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
