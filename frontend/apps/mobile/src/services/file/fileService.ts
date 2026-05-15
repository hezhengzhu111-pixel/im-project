import { FILE_ENDPOINTS } from '@im/shared-api-contract';
import { normalizeFileUploadResponse } from '@im/shared-normalizers';
import { apiClient } from '@/services/api/httpClient';
import type { ApiResponse, FileUploadResponse, MessageType } from '@im/shared-types';

export type { FileUploadResponse } from '@im/shared-types';

export interface MobileFile {
  uri: string;
  name: string;
  type?: string;
  size?: number;
  duration?: number;
  thumbnailUrl?: string;
  originalUri?: string;
}

const endpointFor = (type: MessageType) => {
  if (type === 'IMAGE') return FILE_ENDPOINTS.UPLOAD_IMAGE;
  if (type === 'VIDEO') return FILE_ENDPOINTS.UPLOAD_VIDEO;
  if (type === 'VOICE') return FILE_ENDPOINTS.UPLOAD_AUDIO;
  return FILE_ENDPOINTS.UPLOAD_FILE;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

const extensionFromName = (name: string): string => {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

const fallbackMimeType = (type: MessageType): string => {
  if (type === 'IMAGE') return 'image/jpeg';
  if (type === 'VIDEO') return 'video/mp4';
  if (type === 'VOICE') return 'audio/mp4';
  return 'application/octet-stream';
};

export const normalizeUploadFile = (file: MobileFile, type: MessageType): MobileFile => {
  const normalizedName = file.name.trim() || `upload_${Date.now()}`;
  const extension = extensionFromName(normalizedName);
  return {
    ...file,
    name: normalizedName,
    type: file.type || MIME_BY_EXTENSION[extension] || fallbackMimeType(type),
  };
};

export const fileService = {
  async upload(
    file: MobileFile,
    type: MessageType,
    onProgress?: (progress: number) => void,
  ): Promise<ApiResponse<FileUploadResponse>> {
    const normalized = normalizeUploadFile(file, type);
    const formData = new FormData();
    formData.append('file', {
      uri: normalized.uri,
      name: normalized.name,
      type: normalized.type || 'application/octet-stream',
    } as unknown as Blob);
    const response = await apiClient.post(endpointFor(type), formData, {
      timeout: 0,
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    });
    const raw = response.data as ApiResponse<unknown>;
    return { ...raw, data: normalizeFileUploadResponse(raw.data) };
  },
};
