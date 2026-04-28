import {ref} from "vue";
import {fileService} from "@/services/file";
import type {MessageType} from "@/types";
import {useErrorHandler} from "@/hooks/useErrorHandler";

type UploadKind = Extract<MessageType, "IMAGE" | "FILE" | "VIDEO" | "VOICE">;

const UPLOAD_LIMITS: Record<UploadKind, number> = {
  IMAGE: 20 * 1024 * 1024,
  FILE: 512 * 1024 * 1024,
  VIDEO: 1024 * 1024 * 1024,
  VOICE: 100 * 1024 * 1024,
};

const uploadLabel = (kind: UploadKind) => {
  if (kind === "IMAGE") return "图片";
  if (kind === "VOICE") return "语音";
  if (kind === "VIDEO") return "视频";
  return "文件";
};

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024 * 1024) {
    return `${Math.round(size / 1024 / 1024 / 1024)}GB`;
  }
  if (size >= 1024 * 1024) {
    return `${Math.round(size / 1024 / 1024)}MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)}KB`;
  }
  return `${size}B`;
};

export function useFileMessageUpload() {
  const {capture, notifyInfo} = useErrorHandler("file-upload");
  const uploading = ref(false);

  const upload = async (file: File, kind: UploadKind) => {
    uploading.value = true;
    try {
      const limit = UPLOAD_LIMITS[kind];
      if (file.size > limit) {
        throw new Error(`${uploadLabel(kind)}不能超过 ${formatFileSize(limit)}`);
      }

      notifyInfo(`正在上传${uploadLabel(kind)}...`);
      const response =
        kind === "IMAGE"
          ? await fileService.uploadImage(file)
          : kind === "VIDEO"
            ? await fileService.uploadVideo(file)
            : kind === "VOICE"
              ? await fileService.uploadAudio(file)
              : await fileService.upload(file);
      if (response.code !== 200 || !response.data?.url) {
        throw new Error(response.message || "上传失败");
      }
      return response.data;
    } catch (error) {
      capture(error, "上传失败");
      throw error;
    } finally {
      uploading.value = false;
    }
  };

  return {
    uploading,
    upload,
  };
}
