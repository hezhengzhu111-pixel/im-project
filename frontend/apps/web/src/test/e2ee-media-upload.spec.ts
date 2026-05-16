import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before vi.mock calls
// ---------------------------------------------------------------------------

const getSessionStatusMock = vi.fn();
const encryptMediaMock = vi.fn();
const uploadImageMock = vi.fn();
const uploadVideoMock = vi.fn();
const uploadAudioMock = vi.fn();
const uploadMock = vi.fn();
const captureMock = vi.fn();
const notifyInfoMock = vi.fn();

vi.mock("@/features/e2ee/manager/e2ee-manager", () => ({
  e2eeManager: {
    getSessionStatus: (...args: unknown[]) => getSessionStatusMock(...args),
  },
}));

vi.mock("@/features/e2ee/engine/media-crypto", () => ({
  encryptMedia: (...args: unknown[]) => encryptMediaMock(...args),
}));

vi.mock("@/services/file", () => ({
  fileService: {
    uploadImage: (...args: unknown[]) => uploadImageMock(...args),
    uploadVideo: (...args: unknown[]) => uploadVideoMock(...args),
    uploadAudio: (...args: unknown[]) => uploadAudioMock(...args),
    upload: (...args: unknown[]) => uploadMock(...args),
  },
}));

vi.mock("@/hooks/useErrorHandler", () => ({
  useErrorHandler: () => ({
    capture: (...args: unknown[]) => captureMock(...args),
    notifyInfo: (...args: unknown[]) => notifyInfoMock(...args),
  }),
}));

vi.mock("@/utils/image-compression", () => ({
  compressImage: vi.fn().mockResolvedValue(new Blob(["compressed"], { type: "image/jpeg" })),
  blobToFile: vi.fn().mockImplementation((blob: Blob, name: string) => {
    return new File([blob], name, { type: blob.type });
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useFileMessageUpload } from "@/features/chat/composables/useFileMessageUpload";

const okResponse = (url = "/files/images/2026-05-15/a.jpg") => ({
  code: 200,
  message: "ok",
  data: { url },
  timestamp: Date.now(),
});

const makeImageFile = (size = 2 * 1024 * 1024) => {
  const buf = new ArrayBuffer(size);
  return new File([buf], "photo.jpg", { type: "image/jpeg" });
};

const makeSmallImageFile = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], "tiny.jpg", {
    type: "image/jpeg",
  });

const makeVideoFile = () =>
  new File([new ArrayBuffer(1024)], "clip.mp4", { type: "video/mp4" });

const makeAudioFile = () =>
  new File([new ArrayBuffer(512)], "voice.webm", { type: "audio/webm" });

const makeGenericFile = () =>
  new File([new ArrayBuffer(256)], "doc.pdf", { type: "application/pdf" });

const encryptedChunks = [new Blob(["encrypted_data"], { type: "application/octet-stream" })];
const mediaKey = "dGVzdF9tZWRpYV9rZXk="; // base64 "test_media_key"
const chunkIvs = ["dGVzdF9pdl8x"]; // base64 "test_iv_1"

const okEncryptedResult = () => ({
  encryptedChunks,
  mediaKey,
  chunkIvs,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useFileMessageUpload — E2EE media encryption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadImageMock.mockResolvedValue(okResponse());
    uploadVideoMock.mockResolvedValue(okResponse("/files/videos/2026-05-15/clip.mp4"));
    uploadAudioMock.mockResolvedValue(okResponse("/files/audios/2026-05-15/voice.webm"));
    uploadMock.mockResolvedValue(okResponse("/files/files/2026-05-15/doc.pdf"));
    encryptMediaMock.mockResolvedValue(okEncryptedResult());
    getSessionStatusMock.mockReturnValue("plaintext");
  });

  // -----------------------------------------------------------------------
  // 1. Non-encrypted session: original upload logic
  // -----------------------------------------------------------------------
  it("uploads original file without encryption when session is plaintext", async () => {
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    const result = await upload(file, "IMAGE");

    expect(encryptMediaMock).not.toHaveBeenCalled();
    expect(uploadImageMock).toHaveBeenCalledTimes(1);
    expect(result.url).toBe("/files/images/2026-05-15/a.jpg");
    expect(result.encryption).toBeUndefined();
  });

  it("uploads without encryption when no sessionId provided", async () => {
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    await upload(file, "IMAGE");

    expect(getSessionStatusMock).not.toHaveBeenCalled();
    expect(encryptMediaMock).not.toHaveBeenCalled();
    expect(uploadImageMock).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 2. Encrypted session: calls encryptMedia
  // -----------------------------------------------------------------------
  it("calls encryptMedia when session status is encrypted", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    await upload(file, "IMAGE", "sess_enc");

    expect(getSessionStatusMock).toHaveBeenCalledWith("sess_enc");
    expect(encryptMediaMock).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 3. Encrypted session: uploads encrypted Blob, not original
  // -----------------------------------------------------------------------
  it("uploads encrypted Blob instead of original file in encrypted session", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    await upload(file, "IMAGE", "sess_enc");

    const uploadedFile = uploadImageMock.mock.calls[0][0];
    // The uploaded file should be the encrypted blob, not the original
    expect(uploadedFile).toBeInstanceOf(Blob);
    // It should NOT be the original file object
    expect(uploadedFile).not.toBe(file);
  });

  // -----------------------------------------------------------------------
  // 4. Encrypted session: returns encryption.mediaKey
  // -----------------------------------------------------------------------
  it("returns encryption.mediaKey in encrypted session", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    const result = await upload(file, "IMAGE", "sess_enc");

    expect(result.encryption).toBeDefined();
    expect(result.encryption!.mediaKey).toBe(mediaKey);
  });

  // -----------------------------------------------------------------------
  // 5. Encrypted session: returns encryption.chunkIvs
  // -----------------------------------------------------------------------
  it("returns encryption.chunkIvs in encrypted session", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    const result = await upload(file, "IMAGE", "sess_enc");

    expect(result.encryption!.chunkIvs).toEqual(chunkIvs);
  });

  // -----------------------------------------------------------------------
  // 6. Encrypted session: returns encryption.mimeType
  // -----------------------------------------------------------------------
  it("returns encryption.mimeType matching original file type", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    const result = await upload(file, "IMAGE", "sess_enc");

    expect(result.encryption!.mimeType).toBe("image/jpeg");
  });

  // -----------------------------------------------------------------------
  // 7. Image compression failure fallback + encrypted session still encrypts
  // -----------------------------------------------------------------------
  it("encrypts final upload file even when image compression fails in encrypted session", async () => {
    const { compressImage } = await import("@/utils/image-compression");
    (compressImage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("compression failed"),
    );

    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile(); // > 1MB, triggers compression path
    const result = await upload(file, "IMAGE", "sess_enc");

    // encryptMedia must still be called with the original file (fallback)
    expect(encryptMediaMock).toHaveBeenCalledTimes(1);
    // The uploaded file should be encrypted, not the original
    const uploadedFile = uploadImageMock.mock.calls[0][0];
    expect(uploadedFile).toBeInstanceOf(Blob);
    expect(uploadedFile).not.toBe(file);
    // Encryption metadata must be present
    expect(result.encryption).toBeDefined();
    expect(result.encryption!.mediaKey).toBe(mediaKey);
  });

  it("uploads original file without encryption when compression fails in plaintext session", async () => {
    const { compressImage } = await import("@/utils/image-compression");
    (compressImage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("compression failed"),
    );

    getSessionStatusMock.mockReturnValue("plaintext");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    const result = await upload(file, "IMAGE");

    // Should upload original file (compression fallback)
    expect(uploadImageMock).toHaveBeenCalledTimes(1);
    expect(encryptMediaMock).not.toHaveBeenCalled();
    expect(result.encryption).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 8. fileService upload failure: error propagates (not swallowed)
  // -----------------------------------------------------------------------
  it("propagates upload failure without swallowing error", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    uploadImageMock.mockResolvedValueOnce({
      code: 500,
      message: "服务器内部错误",
      data: null,
      timestamp: Date.now(),
    });

    const { upload } = useFileMessageUpload();
    const file = makeImageFile();

    await expect(upload(file, "IMAGE", "sess_enc")).rejects.toThrow("服务器内部错误");
  });

  it("propagates network error from upload service", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const networkError = new Error("Network Error");
    uploadImageMock.mockRejectedValueOnce(networkError);

    const { upload } = useFileMessageUpload();
    const file = makeImageFile();

    await expect(upload(file, "IMAGE", "sess_enc")).rejects.toThrow("Network Error");
    expect(captureMock).toHaveBeenCalledWith(networkError, "上传失败");
  });

  it("propagates encryptMedia failure", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const encError = new Error("crypto key generation failed");
    encryptMediaMock.mockRejectedValueOnce(encError);

    const { upload } = useFileMessageUpload();
    const file = makeImageFile();

    await expect(upload(file, "IMAGE", "sess_enc")).rejects.toThrow(
      "crypto key generation failed",
    );
    // Should not attempt upload if encryption failed
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 9. No console.log of mediaKey
  // -----------------------------------------------------------------------
  it("does not log mediaKey to console", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const consoleWarnSpy = vi.spyOn(console, "warn");
    const consoleErrorSpy = vi.spyOn(console, "error");
    const consoleDebugSpy = vi.spyOn(console, "debug");
    const consoleInfoSpy = vi.spyOn(console, "info");

    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();
    await upload(file, "IMAGE", "sess_enc");

    const allCalls = [
      ...consoleSpy.mock.calls,
      ...consoleWarnSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
      ...consoleDebugSpy.mock.calls,
      ...consoleInfoSpy.mock.calls,
    ];

    for (const call of allCalls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain(mediaKey);
    }

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Extended: various file types in encrypted session
  // -----------------------------------------------------------------------
  it("encrypts video upload in encrypted session", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeVideoFile();
    const result = await upload(file, "VIDEO", "sess_enc");

    expect(encryptMediaMock).toHaveBeenCalledTimes(1);
    expect(uploadVideoMock).toHaveBeenCalledTimes(1);
    expect(result.encryption).toBeDefined();
    expect(result.encryption!.mimeType).toBe("video/mp4");
  });

  it("encrypts audio upload in encrypted session", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeAudioFile();
    const result = await upload(file, "VOICE", "sess_enc");

    expect(encryptMediaMock).toHaveBeenCalledTimes(1);
    expect(uploadAudioMock).toHaveBeenCalledTimes(1);
    expect(result.encryption).toBeDefined();
    expect(result.encryption!.mimeType).toBe("audio/webm");
  });

  it("encrypts generic file upload in encrypted session", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeGenericFile();
    const result = await upload(file, "FILE", "sess_enc");

    expect(encryptMediaMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(result.encryption).toBeDefined();
    expect(result.encryption!.mimeType).toBe("application/pdf");
  });

  // -----------------------------------------------------------------------
  // Extended: small image (no compression) in encrypted session
  // -----------------------------------------------------------------------
  it("encrypts small image that skips compression", async () => {
    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeSmallImageFile(); // < 1MB, no compression
    const result = await upload(file, "IMAGE", "sess_enc");

    expect(encryptMediaMock).toHaveBeenCalledTimes(1);
    expect(result.encryption).toBeDefined();
    expect(result.encryption!.mediaKey).toBe(mediaKey);
  });

  // -----------------------------------------------------------------------
  // Extended: encrypted session with multi-chunk result
  // -----------------------------------------------------------------------
  it("handles multi-chunk encrypted result correctly", async () => {
    const chunk1 = new Blob(["chunk1"]);
    const chunk2 = new Blob(["chunk2"]);
    encryptMediaMock.mockResolvedValueOnce({
      encryptedChunks: [chunk1, chunk2],
      mediaKey: "bXVsdGlfY2h1bmtfa2V5",
      chunkIvs: ["aXYx", "aXYy"],
    });

    getSessionStatusMock.mockReturnValue("encrypted");
    const { upload } = useFileMessageUpload();
    const file = makeVideoFile();
    const result = await upload(file, "VIDEO", "sess_enc");

    // Should merge chunks into single Blob
    const uploadedFile = uploadVideoMock.mock.calls[0][0];
    expect(uploadedFile).toBeInstanceOf(Blob);
    expect(result.encryption!.chunkIvs).toEqual(["aXYx", "aXYy"]);
    expect(result.encryption!.mediaKey).toBe("bXVsdGlfY2h1bmtfa2V5");
  });

  // -----------------------------------------------------------------------
  // Extended: protected non-ready states block upload before plaintext leaves the client
  // -----------------------------------------------------------------------
  it("blocks upload when session status is negotiating", async () => {
    getSessionStatusMock.mockReturnValue("negotiating");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();

    await expect(upload(file, "IMAGE", "sess_neg")).rejects.toThrow(
      "E2EE session is unavailable",
    );
    expect(encryptMediaMock).not.toHaveBeenCalled();
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it("blocks upload when session status is failed", async () => {
    getSessionStatusMock.mockReturnValue("failed");
    const { upload } = useFileMessageUpload();
    const file = makeImageFile();

    await expect(upload(file, "IMAGE", "sess_fail")).rejects.toThrow(
      "E2EE session is unavailable",
    );
    expect(encryptMediaMock).not.toHaveBeenCalled();
    expect(uploadImageMock).not.toHaveBeenCalled();
  });
});
