import { create } from 'zustand';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { uploadService } from '@/services/upload/uploadService';
import type { MessageType, UploadTask } from '@/types/models';
import type { MobileFile } from '@/services/file/fileService';

interface UploadState {
  tasks: UploadTask[];
  refresh: () => void;
  upload: (file: MobileFile, type: MessageType, context?: { conversationId?: string; localMessageId?: string }) => Promise<string>;
}

export const useUploadStore = create<UploadState>((set) => ({
  tasks: [],

  refresh() {
    set({ tasks: uploadTaskRepository.listPending() });
  },

  async upload(file, type, context) {
    const result = await uploadService.uploadFile(file, type, context);
    set({ tasks: uploadTaskRepository.listPending() });
    return result.url;
  },
}));
