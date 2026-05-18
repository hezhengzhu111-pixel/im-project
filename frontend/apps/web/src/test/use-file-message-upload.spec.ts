import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock services and utilities
vi.mock("@/services/file", () => ({
  fileService: {
    upload: vi.fn(),
    uploadImage: vi.fn(),
    uploadVideo: vi.fn(),
    uploadAudio: vi.fn(),
  },
}));

vi.mock("@/hooks/useErrorHandler", () => ({
  useErrorHandler: () => ({
    capture: vi.fn(),
    notifyInfo: vi.fn(),
    notifySuccess: vi.fn(),
  }),
}));

vi.mock("@/utils/image-compression", () => ({
  compressImage: vi.fn(),
  blobToFile: vi.fn((blob: Blob, name: string) => new File([blob], name)),
}));

vi.mock("@/features/e2ee/engine/media-crypto", () => ({
  encryptMedia: vi.fn(),
}));

vi.mock("@/features/e2ee/manager/e2ee-manager", () => ({
  e2eeManager: {
    getSessionStatus: vi.fn(() => "plaintext"),
  },
}));

const { fileService } = await import("@/services/file");
const { compressImage } = await import("@/utils/image-compression");
const { encryptMedia } = await import("@/features/e2ee/engine/media-crypto");
const { e2eeManager } = await import("@/features/e2ee/manager/e2ee-manager");

describe("useFileMessageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: successful upload
    vi.mocked(fileService.uploadImage).mockResolvedValue({
      code: 200,
      message: "",
      data: { url: "https://example.com/uploads/image.jpg", size: 1024 },
    });
    vi.mocked(fileService.upload).mockResolvedValue({
      code: 200,
      message: "",
      data: { url: "https://example.com/uploads/file.pdf", size: 2048 },
    });
    vi.mocked(fileService.uploadVideo).mockResolvedValue({
      code: 200,
      message: "",
      data: { url: "https://example.com/uploads/video.mp4", size: 1024000 },
    });
    vi.mocked(fileService.uploadAudio).mockResolvedValue({
      code: 200,
      message: "",
      data: { url: "https://example.com/uploads/audio.webm", size: 512000 },
    });
  });

  it("returns initial loading state as false", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { uploading } = useFileMessageUpload();
    expect(uploading.value).toBe(false);
  });

  it("upload IMAGE file successfully", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["fake-image-data"], "photo.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(file, "size", { value: 500 * 1024 }); // 500KB

    const result = await upload(file, "IMAGE");

    expect(fileService.uploadImage).toHaveBeenCalledWith(file);
    expect(result.url).toBe("https://example.com/uploads/image.jpg");
  });

  it("upload FILE type successfully", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["pdf-content"], "document.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 }); // 2MB

    const result = await upload(file, "FILE");

    expect(fileService.upload).toHaveBeenCalledWith(file);
    expect(result.url).toBe("https://example.com/uploads/file.pdf");
  });

  it("upload VIDEO type successfully", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["video-data"], "video.mp4", {
      type: "video/mp4",
    });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 }); // 10MB

    const result = await upload(file, "VIDEO");

    expect(fileService.uploadVideo).toHaveBeenCalledWith(file);
    expect(result.url).toBe("https://example.com/uploads/video.mp4");
  });

  it("upload VOICE type successfully", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["audio-data"], "voice.webm", {
      type: "audio/webm",
    });
    Object.defineProperty(file, "size", { value: 100 * 1024 }); // 100KB

    const result = await upload(file, "VOICE");

    expect(fileService.uploadAudio).toHaveBeenCalledWith(file);
    expect(result.url).toBe("https://example.com/uploads/audio.webm");
  });

  it("rejects image file exceeding 20MB limit", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["large"], "large.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 30 * 1024 * 1024 }); // 30MB

    await expect(upload(file, "IMAGE")).rejects.toThrow("不能超过");
    expect(fileService.uploadImage).not.toHaveBeenCalled();
  });

  it("rejects file exceeding 512MB for FILE type", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["large"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 600 * 1024 * 1024 }); // 600MB

    await expect(upload(file, "FILE")).rejects.toThrow("不能超过");
    expect(fileService.upload).not.toHaveBeenCalled();
  });

  it("rejects video file exceeding 1GB for VIDEO type", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["large"], "large.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 * 1024 }); // 2GB

    await expect(upload(file, "VIDEO")).rejects.toThrow("不能超过");
    expect(fileService.uploadVideo).not.toHaveBeenCalled();
  });

  it("rejects audio file exceeding 100MB for VOICE type", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["large"], "large.webm", { type: "audio/webm" });
    Object.defineProperty(file, "size", { value: 200 * 1024 * 1024 }); // 200MB

    await expect(upload(file, "VOICE")).rejects.toThrow("不能超过");
    expect(fileService.uploadAudio).not.toHaveBeenCalled();
  });

  it("compresses images larger than 1MB before upload", async () => {
    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    vi.mocked(compressImage).mockResolvedValue(compressedBlob);

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["large-image-data"], "photo.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 }); // 2MB > 1MB

    await upload(file, "IMAGE");

    expect(compressImage).toHaveBeenCalledWith(file);
  });

  it("does NOT compress images smaller than 1MB", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["small-image"], "photo.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(file, "size", { value: 500 * 1024 }); // 500KB < 1MB

    await upload(file, "IMAGE");

    expect(compressImage).not.toHaveBeenCalled();
  });

  it("falls back to original file when compression fails", async () => {
    vi.mocked(compressImage).mockRejectedValue(
      new Error("compression error")
    );

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["image-data"], "photo.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 }); // 2MB

    // Should not throw despite compression failure
    const result = await upload(file, "IMAGE");

    expect(compressImage).toHaveBeenCalledWith(file);
    expect(fileService.uploadImage).toHaveBeenCalled();
    expect(result.url).toBe("https://example.com/uploads/image.jpg");
  });

  it("includes E2EE encryption metadata when session is encrypted", async () => {
    vi.mocked(e2eeManager.getSessionStatus).mockReturnValue("encrypted");

    const encryptedChunks = [new Blob(["encrypted-data"])];
    vi.mocked(encryptMedia).mockResolvedValue({
      encryptedChunks,
      mediaKey: "base64-media-key",
      chunkIvs: ["base64-iv-1"],
    });

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["data"], "secret.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 500 * 1024 });

    const result = await upload(file, "IMAGE", "session-123");

    expect(encryptMedia).toHaveBeenCalled();
    expect(result.encryption).toEqual({
      mediaKey: "base64-media-key",
      chunkIvs: ["base64-iv-1"],
      mimeType: "image/jpeg",
    });
    // Should upload the encrypted blob, not the original file
    expect(fileService.uploadImage).toHaveBeenCalled();
  });

  it("throws error when E2EE session status is negotiating", async () => {
    vi.mocked(e2eeManager.getSessionStatus).mockReturnValue("negotiating");

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["data"], "secret.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 500 * 1024 });

    await expect(
      upload(file, "IMAGE", "session-123")
    ).rejects.toThrow("E2EE session is unavailable");
    expect(fileService.uploadImage).not.toHaveBeenCalled();
  });

  it("throws error when E2EE session status is failed", async () => {
    vi.mocked(e2eeManager.getSessionStatus).mockReturnValue("failed");

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["data"], "secret.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 500 * 1024 });

    await expect(
      upload(file, "IMAGE", "session-123")
    ).rejects.toThrow("E2EE session is unavailable");
    expect(fileService.uploadImage).not.toHaveBeenCalled();
  });

  it("does NOT encrypt when no sessionId is provided", async () => {
    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 500 * 1024 });

    const result = await upload(file, "IMAGE");

    expect(encryptMedia).not.toHaveBeenCalled();
    expect(result.encryption).toBeUndefined();
  });

  it("throws error when upload response code is not 200", async () => {
    vi.mocked(fileService.uploadImage).mockResolvedValue({
      code: 500,
      message: "服务器错误",
      data: null,
    } as any);

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 500 * 1024 });

    await expect(upload(file, "IMAGE")).rejects.toThrow("服务器错误");
  });

  it("sets uploading to true during upload and false after", async () => {
    let resolveUpload: (value: unknown) => void;
    const uploadPromise = new Promise((resolve) => {
      resolveUpload = resolve;
    });
    vi.mocked(fileService.uploadImage).mockReturnValue(
      uploadPromise as ReturnType<typeof fileService.uploadImage>
    );

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { uploading, upload } = useFileMessageUpload();

    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 500 * 1024 });

    const uploadCall = upload(file, "IMAGE");
    expect(uploading.value).toBe(true);

    // @ts-expect-error - resolveUpload is definitely assigned
    resolveUpload({
      code: 200,
      data: { url: "https://example.com/uploads/image.jpg" },
    });
    await uploadCall;

    expect(uploading.value).toBe(false);
  });

  it("handles upload service failure gracefully", async () => {
    vi.mocked(fileService.uploadImage).mockRejectedValue(
      new Error("Network error")
    );

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload, uploading } = useFileMessageUpload();

    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 500 * 1024 });

    await expect(upload(file, "IMAGE")).rejects.toThrow("Network error");
    expect(uploading.value).toBe(false);
  });

  it("merges additional response data into result", async () => {
    vi.mocked(fileService.uploadImage).mockResolvedValue({
      code: 200,
      message: "",
      data: {
        url: "https://example.com/uploads/image.jpg",
        size: 1024,
        width: 800,
        height: 600,
      },
    } as any);

    const { useFileMessageUpload } = await import(
      "@/features/chat/composables/useFileMessageUpload"
    );
    const { upload } = useFileMessageUpload();

    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 500 * 1024 });

    const result = await upload(file, "IMAGE");

    expect(result.url).toBe("https://example.com/uploads/image.jpg");
    expect(result.size).toBe(1024);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });
});
