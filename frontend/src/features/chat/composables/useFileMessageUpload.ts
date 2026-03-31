import { ref } from "vue";
import { fileService } from "@/services/file";
import type { MessageType } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export function useFileMessageUpload() {
  const { capture, notifyInfo } = useErrorHandler("file-upload");
  const uploading = ref(false);

  const upload = async (
    file: File,
    kind: Extract<MessageType, "IMAGE" | "FILE" | "VIDEO" | "VOICE">,
  ) => {
    uploading.value = true;
    try {
      notifyInfo(
        kind === "IMAGE"
          ? "正在上传图片..."
          : kind === "VOICE"
            ? "正在上传语音..."
            : "正在上传文件...",
      );
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
