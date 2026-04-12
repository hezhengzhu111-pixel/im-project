import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { fileService as fileApi } from "@/services/file";
import {
  getFileType,
  isFileSizeExceeded,
  formatFileSize,
} from "@/utils/common";
import { FILE_SIZE_LIMITS } from "@/constants";
import type { FileUploadResponse } from "@/types/api";
import type { FileDeleteRef } from "@/services/file";

/**
 * 文件上传相关的组合式函数
 */
export function useFileUpload() {
  const uploading = ref(false);
  const uploadProgress = ref(0);

  /**
   * 检查文件是否有效
   */
  const validateFile = (file: File): { valid: boolean; message?: string } => {
    // 检查文件大小
    if (isFileSizeExceeded(file)) {
      const fileType = getFileType(file.name);
      const limit = FILE_SIZE_LIMITS[fileType as keyof typeof FILE_SIZE_LIMITS];
      return {
        valid: false,
        message: `文件大小超出限制，最大允许 ${formatFileSize(limit || 0)}`,
      };
    }

    return { valid: true };
  };

  /**
   * 上传文件
   */
  const uploadFile = async (file: File): Promise<FileUploadResponse> => {
    // 验证文件
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.message!);
    }

    try {
      uploading.value = true;
      uploadProgress.value = 0;

      const fileType = getFileType(file.name);
      let response;

      // 根据文件类型选择上传接口
      switch (fileType) {
        case "IMAGE":
          response = await fileApi.uploadImage(file, (progress: number) => {
            uploadProgress.value = progress;
          });
          break;
        case "VIDEO":
          response = await fileApi.uploadVideo(file, (progress: number) => {
            uploadProgress.value = progress;
          });
          break;
        case "AUDIO":
          response = await fileApi.uploadAudio(file, (progress: number) => {
            uploadProgress.value = progress;
          });
          break;
        default:
          response = await fileApi.upload(file, (progress: number) => {
            uploadProgress.value = progress;
          });
      }

      if (response.code === 200) {
        ElMessage.success("文件上传成功");
        return response.data;
      } else {
        throw new Error(response.message || "文件上传失败");
      }
    } catch (error: any) {
      console.error("文件上传失败:", error);
      ElMessage.error(error.message || "文件上传失败");
      throw error;
    } finally {
      uploading.value = false;
      uploadProgress.value = 0;
    }
  };

  /**
   * 批量上传文件
   */
  const uploadFiles = async (files: File[]): Promise<FileUploadResponse[]> => {
    const results: FileUploadResponse[] = [];

    for (const file of files) {
      const result = await uploadFile(file);
      results.push(result);
    }

    return results;
  };

  /**
   * 删除文件
   */
  const deleteFile = async (fileRef: FileDeleteRef): Promise<boolean> => {
    try {
      const response = await fileApi.delete(fileRef);

      if (response.code === 200) {
        ElMessage.success("文件删除成功");
        return true;
      } else {
        ElMessage.error(response.message || "文件删除失败");
        return false;
      }
    } catch (error: any) {
      console.error("文件删除失败:", error);
      ElMessage.error(error.message || "文件删除失败");
      return false;
    }
  };

  /**
   * 获取文件图标
   */
  const getFileIcon = (fileName: string): string => {
    const fileType = getFileType(fileName);

    const iconMap: Record<string, string> = {
      IMAGE: "Picture",
      VIDEO: "VideoCamera",
      AUDIO: "Microphone",
      DOCUMENT: "Document",
      OTHER: "Document",
    };

    return iconMap[fileType] || "Document";
  };

  /**
   * 检查是否为图片文件
   */
  const isImageFile = (fileName: string): boolean => {
    return getFileType(fileName) === "IMAGE";
  };

  /**
   * 检查是否为视频文件
   */
  const isVideoFile = (fileName: string): boolean => {
    return getFileType(fileName) === "VIDEO";
  };

  /**
   * 检查是否为音频文件
   */
  const isAudioFile = (fileName: string): boolean => {
    return getFileType(fileName) === "AUDIO";
  };

  /**
   * 创建文件预览URL
   */
  const createPreviewUrl = (file: File): string => {
    return URL.createObjectURL(file);
  };

  /**
   * 释放文件预览URL
   */
  const revokePreviewUrl = (url: string): void => {
    URL.revokeObjectURL(url);
  };

  return {
    uploading: computed(() => uploading.value),
    uploadProgress: computed(() => uploadProgress.value),
    validateFile,
    uploadFile,
    uploadFiles,
    deleteFile,
    getFileIcon,
    isImageFile,
    isVideoFile,
    isAudioFile,
    createPreviewUrl,
    revokePreviewUrl,
  };
}
