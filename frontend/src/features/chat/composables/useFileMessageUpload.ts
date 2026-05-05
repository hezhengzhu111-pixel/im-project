import { ref } from "vue";
import { fileService } from "@/services/file";
import type { MessageType } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { compressImage, blobToFile } from "@/utils/image-compression";
import { encryptMedia } from "@/features/e2ee/engine/media-crypto";
import { e2eeManager } from "@/features/e2ee/manager/e2ee-manager";

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

/** 上传结果（扩展以支持 E2EE 元数据） */
export interface FileUploadResult {
  url: string;
  /** E2EE 加密元数据（仅加密会话时存在） */
  encryption?: {
    mediaKey: string;
    chunkIvs: string[];
    mimeType: string;
  };
  [key: string]: unknown;
}

export function useFileMessageUpload() {
  const { capture, notifyInfo } = useErrorHandler("file-upload");
  const uploading = ref(false);

  /**
   * 上传文件
   *
   * @param file - 要上传的文件
   * @param kind - 消息类型
   * @param sessionId - E2EE 会话 ID（可选，传入时自动加密）
   */
  const upload = async (
    file: File,
    kind: UploadKind,
    sessionId?: string,
  ): Promise<FileUploadResult> => {
    uploading.value = true;
    try {
      const limit = UPLOAD_LIMITS[kind];
      if (file.size > limit) {
        throw new Error(
          `${uploadLabel(kind)}不能超过 ${formatFileSize(limit)}`,
        );
      }

      // Before upload, compress images
      let uploadFile: File | Blob = file;
      if (kind === "IMAGE" && file.size > 1024 * 1024) {
        try {
          const compressed = await compressImage(file);
          uploadFile = blobToFile(compressed, file.name);
        } catch {
          // Compression failed — upload original
          uploadFile = file;
        }
      }

      // E2EE 加密拦截
      let encryptionMeta: FileUploadResult["encryption"] | undefined;
      const isEncrypted =
        sessionId && e2eeManager.getSessionStatus(sessionId) === "encrypted";

      if (isEncrypted) {
        notifyInfo(`正在加密${uploadLabel(kind)}...`);
        const { encryptedChunks, mediaKey, chunkIvs } = await encryptMedia(
          uploadFile instanceof File ? uploadFile : new File([uploadFile], file.name, { type: file.type }),
        );

        // 将加密块合并为单个 Blob 用于上传
        uploadFile = encryptedChunks.length === 1
          ? encryptedChunks[0]
          : new Blob(encryptedChunks);

        encryptionMeta = {
          mediaKey,
          chunkIvs,
          mimeType: file.type,
        };
      }

      notifyInfo(`正在上传${uploadLabel(kind)}...`);
      const response =
        kind === "IMAGE"
          ? await fileService.uploadImage(uploadFile as File)
          : kind === "VIDEO"
            ? await fileService.uploadVideo(uploadFile as File)
            : kind === "VOICE"
              ? await fileService.uploadAudio(uploadFile as File)
              : await fileService.upload(uploadFile as File);
      if (response.code !== 200 || !response.data?.url) {
        throw new Error(response.message || "上传失败");
      }

      const result: FileUploadResult = { ...response.data };
      if (encryptionMeta) {
        result.encryption = encryptionMeta;
      }
      return result;
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
