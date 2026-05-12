import { FILE_ENDPOINTS } from '@im/shared-api-contract';
import { apiClient } from '@/services/api/httpClient';
import type { ApiResponse, MessageType } from '@/types/models';

export interface MobileFile {
  uri: string;
  name: string;
  type?: string;
  size?: number;
}

export interface FileUploadResponse {
  url: string;
  thumbnailUrl?: string;
  size?: number;
  fileName?: string;
  contentType?: string;
}

const endpointFor = (type: MessageType) => {
  if (type === 'IMAGE') return FILE_ENDPOINTS.UPLOAD_IMAGE;
  if (type === 'VIDEO') return FILE_ENDPOINTS.UPLOAD_VIDEO;
  if (type === 'VOICE') return FILE_ENDPOINTS.UPLOAD_AUDIO;
  return FILE_ENDPOINTS.UPLOAD_FILE;
};

export const fileService = {
  async upload(
    file: MobileFile,
    type: MessageType,
    onProgress?: (progress: number) => void,
  ): Promise<ApiResponse<FileUploadResponse>> {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type || 'application/octet-stream',
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
    return response.data as ApiResponse<FileUploadResponse>;
  },
};
