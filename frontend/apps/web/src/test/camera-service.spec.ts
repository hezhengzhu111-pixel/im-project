import { beforeEach, describe, expect, it, vi } from "vitest";

const { isNativeMock, getPhotoMock } = vi.hoisted(() => ({
  isNativeMock: vi.fn(),
  getPhotoMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: isNativeMock,
  },
}));

vi.mock("@capacitor/camera", () => ({
  Camera: {
    getPhoto: getPhotoMock,
  },
  CameraResultType: { Base64: "base64" },
  CameraSource: { Camera: "camera", Photos: "photos" },
}));

describe("camera service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("takePhoto", () => {
    it("calls Camera.getPhoto with Camera source and returns base64 + format", async () => {
      getPhotoMock.mockResolvedValue({
        base64String: "ABCD1234",
        format: "png",
      });

      const { takePhoto } = await import("@/services/camera.service");
      const result = await takePhoto();

      expect(getPhotoMock).toHaveBeenCalledWith({
        quality: 80,
        allowEditing: true,
        resultType: "base64",
        source: "camera",
      });
      expect(result).toEqual({
        base64: "ABCD1234",
        format: "png",
      });
    });

    it("handles missing base64String or format gracefully", async () => {
      getPhotoMock.mockResolvedValue({});

      const { takePhoto } = await import("@/services/camera.service");
      const result = await takePhoto();

      expect(result).toEqual({
        base64: "",
        format: "jpeg",
      });
    });
  });

  describe("pickFromGallery", () => {
    it("calls Camera.getPhoto with Photos source", async () => {
      getPhotoMock.mockResolvedValue({
        base64String: "EFGH5678",
        format: "jpeg",
      });

      const { pickFromGallery } = await import("@/services/camera.service");
      const result = await pickFromGallery();

      expect(getPhotoMock).toHaveBeenCalledWith({
        quality: 80,
        allowEditing: true,
        resultType: "base64",
        source: "photos",
      });
      expect(result).toEqual({
        base64: "EFGH5678",
        format: "jpeg",
      });
    });
  });

  describe("isCameraAvailable", () => {
    it("returns true when running on native platform", async () => {
      isNativeMock.mockReturnValue(true);
      const { isCameraAvailable } = await import("@/services/camera.service");
      expect(isCameraAvailable()).toBe(true);
    });

    it("returns false when not on native platform", async () => {
      isNativeMock.mockReturnValue(false);
      const { isCameraAvailable } = await import("@/services/camera.service");
      expect(isCameraAvailable()).toBe(false);
    });
  });

  describe("base64ToFile", () => {
    const validBase64 = "SGVsbG8gV29ybGQ="; // "Hello World"

    it("converts base64 to a File object with jpeg mime type by default", async () => {
      const { base64ToFile } = await import("@/services/camera.service");
      const file = base64ToFile(validBase64, "jpeg");

      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe("image/jpeg");
    });

    it("converts base64 to a File object with png mime type", async () => {
      const { base64ToFile } = await import("@/services/camera.service");
      const file = base64ToFile(validBase64, "png");

      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe("image/png");
    });

    it("uses custom filename when provided", async () => {
      const { base64ToFile } = await import("@/services/camera.service");
      const file = base64ToFile(validBase64, "png", "custom.png");

      expect(file.name).toBe("custom.png");
    });

    it("generates filename with Date.now() when no filename provided", async () => {
      vi.useFakeTimers();
      const now = Date.now();
      const { base64ToFile } = await import("@/services/camera.service");
      const file = base64ToFile(validBase64, "jpg");

      expect(file.name).toBe(`photo_${now}.jpg`);
      vi.useRealTimers();
    });
  });
});
