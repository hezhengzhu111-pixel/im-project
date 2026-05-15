import type { FileUploadResponse } from "@im/shared-types";
import { asNumber, asString, isRecord } from "@im/shared-types";

export const normalizeFileUploadResponse = (raw: unknown): FileUploadResponse => {
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
  const uploadTime = asNumber(
    record.uploadTime ?? record.upload_time,
    Number.NaN,
  );
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
    uploaderId: asString(record.uploaderId ?? record.uploader_id) || undefined,
    fileName: fileName || undefined,
    fileType: asString(record.fileType ?? record.file_type) || undefined,
  };
};
