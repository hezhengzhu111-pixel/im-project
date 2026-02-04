import { http } from "@/utils/request";
import type { FileUploadResponse } from "@/types/api";

export const fileService = {
  upload: (file: File) => http.upload<FileUploadResponse>("/file/upload", file),
};
