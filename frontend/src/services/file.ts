import {http} from "@/utils/request";
import {asNumber, asString, isRecord} from "@/types/utils";
import type {ApiResponse, FileUploadResponse} from "@/types/api";

export interface FileDeletePath {
  category: string;
  date: string;
  filename: string;
}

export type FileDeleteRef = string | FileDeletePath;

const normalizePath = (value: string) => value.split("?")[0].split("#")[0];

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeUploadResponse = (raw: unknown): FileUploadResponse => {
  const record = isRecord(raw) ? raw : {};
  const originalFilename = asString(
    record.originalFilename ?? record.original_filename,
  );
  const filename = asString(record.filename);
  const fileName =
    asString(record.fileName ?? record.file_name) ||
    originalFilename ||
    filename;
  const size = asNumber(record.size, Number.NaN);
  const uploadTime = asNumber(record.uploadTime ?? record.upload_time, Number.NaN);
  return {
    url: asString(record.url),
    thumbnailUrl:
      asString(record.thumbnailUrl ?? record.thumbnail_url) || undefined,
    size: Number.isFinite(size) ? size : undefined,
    originalFilename: originalFilename || undefined,
    filename: filename || undefined,
    contentType:
      asString(record.contentType ?? record.content_type) || undefined,
    category: asString(record.category) || undefined,
    uploadDate: asString(record.uploadDate ?? record.upload_date) || undefined,
    uploadTime: Number.isFinite(uploadTime) ? uploadTime : undefined,
    uploaderId:
      asString(record.uploaderId ?? record.uploader_id) || undefined,
    fileName: fileName || undefined,
    fileType: asString(record.fileType ?? record.file_type) || undefined,
  };
};

const uploadWithNormalization = async (
  url: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ApiResponse<FileUploadResponse>> => {
  const response = await http.upload<unknown>(url, file, onProgress);
  return {
    ...response,
    data: normalizeUploadResponse(response.data),
  } as ApiResponse<FileUploadResponse>;
};

const extractFromSegments = (segments: string[]): FileDeletePath | null => {
  if (segments.length < 3) return null;
  const category = safeDecode(segments[segments.length - 3]);
  const date = safeDecode(segments[segments.length - 2]);
  const filename = safeDecode(segments[segments.length - 1]);
  if (!category || !date || !filename) return null;
  return {category, date, filename};
};

export const resolveFilePath = (
  fileRef: FileDeleteRef,
): FileDeletePath | null => {
  if (typeof fileRef === "object" && fileRef) {
    const {category, date, filename} = fileRef;
    if (category && date && filename) {
      return {category, date, filename};
    }
    return null;
  }
  const normalized = fileRef.trim();
  if (!normalized) return null;
  if (
    !normalized.includes("://") &&
    !normalized.startsWith("/") &&
    normalized.split("/").filter(Boolean).length >= 3
  ) {
    return extractFromSegments(
      normalizePath(normalized).split("/").filter(Boolean),
    );
  }
  try {
    const url = new URL(normalized, window.location.origin);
    const paramsCategory = url.searchParams.get("category");
    const paramsDate = url.searchParams.get("date");
    const paramsFilename = url.searchParams.get("filename");
    if (paramsCategory && paramsDate && paramsFilename) {
      return {
        category: safeDecode(paramsCategory),
        date: safeDecode(paramsDate),
        filename: safeDecode(paramsFilename),
      };
    }
    const segments = normalizePath(url.pathname).split("/").filter(Boolean);
    return extractFromSegments(segments);
  } catch {
    return null;
  }
};

export const fileService = {
  upload: (file: File, onProgress?: (progress: number) => void) =>
    uploadWithNormalization("/file/upload/file", file, onProgress),
  uploadImage: (file: File, onProgress?: (progress: number) => void) =>
    uploadWithNormalization("/file/upload/image", file, onProgress),
  uploadVideo: (file: File, onProgress?: (progress: number) => void) =>
    uploadWithNormalization("/file/upload/video", file, onProgress),
  uploadAudio: (file: File, onProgress?: (progress: number) => void) =>
    uploadWithNormalization("/file/upload/audio", file, onProgress),
  delete: (fileRef: FileDeleteRef) => {
    const filePath = resolveFilePath(fileRef);
    if (!filePath) {
      return Promise.reject(new Error("无法解析文件路径"));
    }
    return http.delete<boolean>("/file/delete", filePath);
  },
};
