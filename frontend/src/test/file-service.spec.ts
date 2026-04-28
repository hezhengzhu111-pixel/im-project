import {beforeEach, describe, expect, it, vi} from "vitest";

const {uploadMock, deleteMock} = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/utils/request", () => ({
  http: {
    upload: uploadMock,
    delete: deleteMock,
  },
}));

describe("file service resolve/delete", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    deleteMock.mockReset();
    deleteMock.mockResolvedValue({
      code: 200,
      message: "ok",
      data: true,
      timestamp: Date.now(),
    });
  });

  it("normalizes upload response metadata", async () => {
    uploadMock.mockResolvedValue({
      code: 200,
      message: "ok",
      data: {
        url: "/files/images/2026-04-28/a.png",
        original_filename: "avatar.png",
        filename: "a.png",
        content_type: "image/png",
        upload_date: "2026-04-28",
        upload_time: 1777350000000,
        uploader_id: 1,
        size: "12",
      },
      timestamp: Date.now(),
    });

    const { fileService } = await import("@/services/file");
    const response = await fileService.uploadImage(
      new File(["x"], "avatar.png", { type: "image/png" }),
    );

    expect(response.data).toMatchObject({
      url: "/files/images/2026-04-28/a.png",
      originalFilename: "avatar.png",
      filename: "a.png",
      fileName: "avatar.png",
      contentType: "image/png",
      uploadDate: "2026-04-28",
      uploadTime: 1777350000000,
      uploaderId: "1",
      size: 12,
    });
  });

  it("resolves from absolute url", async () => {
    const { resolveFilePath } = await import("@/services/file");
    const path = resolveFilePath(
      "https://cdn.example.com/im/images/2026-03-13/a%20b.png",
    );
    expect(path).toEqual({
      category: "images",
      date: "2026-03-13",
      filename: "a b.png",
    });
  });

  it("resolves from download query url", async () => {
    const { resolveFilePath } = await import("@/services/file");
    const path = resolveFilePath(
      "/api/file/download?category=files&date=2026-03-13&filename=doc.pdf",
    );
    expect(path).toEqual({
      category: "files",
      date: "2026-03-13",
      filename: "doc.pdf",
    });
  });

  it("resolves from direct path string", async () => {
    const { resolveFilePath } = await import("@/services/file");
    const path = resolveFilePath("videos/2026-03-13/clip.mp4");
    expect(path).toEqual({
      category: "videos",
      date: "2026-03-13",
      filename: "clip.mp4",
    });
  });

  it("resolves with query and hash suffix", async () => {
    const { resolveFilePath } = await import("@/services/file");
    const path = resolveFilePath(
      "https://cdn.example.com/im/files/2026-03-13/report.pdf?token=abc#preview",
    );
    expect(path).toEqual({
      category: "files",
      date: "2026-03-13",
      filename: "report.pdf",
    });
  });

  it("resolves with path prefix", async () => {
    const { resolveFilePath } = await import("@/services/file");
    const path = resolveFilePath("/prod/im/audios/2026-03-13/voice.webm");
    expect(path).toEqual({
      category: "audios",
      date: "2026-03-13",
      filename: "voice.webm",
    });
  });

  it("calls delete api with parsed payload", async () => {
    const { fileService } = await import("@/services/file");
    await fileService.delete("images/2026-03-13/a.png");
    expect(deleteMock).toHaveBeenCalledWith("/file/delete", {
      category: "images",
      date: "2026-03-13",
      filename: "a.png",
    });
  });

  it("supports object payload directly", async () => {
    const { fileService } = await import("@/services/file");
    await fileService.delete({
      category: "audios",
      date: "2026-03-13",
      filename: "voice.webm",
    });
    expect(deleteMock).toHaveBeenCalledWith("/file/delete", {
      category: "audios",
      date: "2026-03-13",
      filename: "voice.webm",
    });
  });

  it("rejects invalid file ref", async () => {
    const { fileService } = await import("@/services/file");
    await expect(fileService.delete("invalid")).rejects.toThrow(
      "无法解析文件路径",
    );
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
