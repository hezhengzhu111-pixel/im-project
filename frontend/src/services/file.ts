import { http } from "@/utils/request";
import type { FileUploadResponse } from "@/types/api";

export interface FileDeletePath {
  category: string;
  date: string;
  filename: string;
}

export type FileDeleteRef = string | FileDeletePath;

const normalizePath = (value: string) => value.split("?")[0].split("#")[0];

const extractFromSegments = (segments: string[]): FileDeletePath | null => {
  if (segments.length < 3) return null;
  const category = decodeURIComponent(segments[segments.length - 3]);
  const date = decodeURIComponent(segments[segments.length - 2]);
  const filename = decodeURIComponent(segments[segments.length - 1]);
  if (!category || !date || !filename) return null;
  return { category, date, filename };
};

export const resolveFilePath = (
  fileRef: FileDeleteRef,
): FileDeletePath | null => {
  if (typeof fileRef === "object" && fileRef) {
    const { category, date, filename } = fileRef;
    if (category && date && filename) {
      return { category, date, filename };
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
    return extractFromSegments(normalizePath(normalized).split("/").filter(Boolean));
  }
  try {
    const url = new URL(normalized, window.location.origin);
    const paramsCategory = url.searchParams.get("category");
    const paramsDate = url.searchParams.get("date");
    const paramsFilename = url.searchParams.get("filename");
    if (paramsCategory && paramsDate && paramsFilename) {
      return {
        category: decodeURIComponent(paramsCategory),
        date: decodeURIComponent(paramsDate),
        filename: decodeURIComponent(paramsFilename),
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
    http.upload<FileUploadResponse>("/file/upload/file", file, onProgress),
  uploadImage: (file: File, onProgress?: (progress: number) => void) =>
    http.upload<FileUploadResponse>("/file/upload/image", file, onProgress),
  uploadVideo: (file: File, onProgress?: (progress: number) => void) =>
    http.upload<FileUploadResponse>("/file/upload/video", file, onProgress),
  uploadAudio: (file: File, onProgress?: (progress: number) => void) =>
    http.upload<FileUploadResponse>("/file/upload/audio", file, onProgress),
  delete: (fileRef: FileDeleteRef) => {
    const filePath = resolveFilePath(fileRef);
    if (!filePath) {
      return Promise.reject(new Error("无法解析文件路径"));
    }
    return http.delete<boolean>("/file/delete", filePath);
  },
};
