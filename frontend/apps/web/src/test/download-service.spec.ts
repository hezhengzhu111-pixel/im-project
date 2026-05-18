import { beforeEach, describe, expect, it, vi } from "vitest";

const { isNativeMock, writeFileMock, shareMock } = vi.hoisted(() => ({
  isNativeMock: vi.fn(),
  writeFileMock: vi.fn(),
  shareMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: isNativeMock,
  },
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    writeFile: writeFileMock,
  },
  Directory: { Cache: "cache" },
}));

vi.mock("@capacitor/share", () => ({
  Share: {
    share: shareMock,
  },
}));

describe("download service", () => {
  let mockAnchor: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAnchor = {
      href: "",
      download: "",
      style: {},
      click: vi.fn(),
    };

    vi.stubGlobal(
      "document",
      Object.assign(
        {},
        document,
        {
          createElement: vi.fn((tag: string) => {
            if (tag === "a") return mockAnchor;
            return document.createElement(tag);
          }),
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        },
      ),
    );
  });

  describe("downloadFile in browser mode", () => {
    it("creates an anchor element and triggers download", async () => {
      isNativeMock.mockReturnValue(false);

      const { downloadFile } = await import("@/services/download.service");
      await downloadFile("https://example.com/file.pdf", "document.pdf");

      expect(document.createElement).toHaveBeenCalledWith("a");
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
    });

    it("sets correct href and download attributes", async () => {
      isNativeMock.mockReturnValue(false);

      const { downloadFile } = await import("@/services/download.service");
      await downloadFile("https://cdn.example.com/video.mp4", "video.mp4");

      expect(mockAnchor.href).toBe("https://cdn.example.com/video.mp4");
      expect(mockAnchor.download).toBe("video.mp4");
      expect(mockAnchor.click).toHaveBeenCalled();
    });
  });

  describe("downloadFile in native mode", () => {
    function stubNativeFileReader() {
      class MockFileReader {
        onloadend: (() => void) | null = null;
        onerror: ((err: any) => void) | null = null;
        result: string | null = null;

        readAsDataURL(_blob: any) {
          this.result = "data:application/octet-stream;base64,dGVzdA==";
          if (typeof this.onloadend === "function") {
            this.onloadend();
          }
        }

        abort() {}
      }
      vi.stubGlobal("FileReader", MockFileReader);
    }

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          blob: vi.fn().mockResolvedValue(new Blob(["test"])),
        }),
      );
    });

    it("fetches the url and writes file via Filesystem", async () => {
      isNativeMock.mockReturnValue(true);
      stubNativeFileReader();
      writeFileMock.mockResolvedValue({ uri: "file:///cache/document.pdf" });
      shareMock.mockResolvedValue(undefined);

      const { downloadFile } = await import("@/services/download.service");
      await downloadFile("https://example.com/doc.pdf", "document.pdf");

      expect(fetch).toHaveBeenCalledWith("https://example.com/doc.pdf");
      expect(writeFileMock).toHaveBeenCalledWith({
        path: "document.pdf",
        data: "dGVzdA==",
        directory: "cache",
      });
    });

    it("shares the downloaded file via Capacitor Share", async () => {
      isNativeMock.mockReturnValue(true);
      stubNativeFileReader();
      writeFileMock.mockResolvedValue({ uri: "file:///cache/document.pdf" });
      shareMock.mockResolvedValue(undefined);

      const { downloadFile } = await import("@/services/download.service");
      await downloadFile("https://example.com/doc.pdf", "document.pdf");

      expect(shareMock).toHaveBeenCalledWith({
        title: "document.pdf",
        url: "file:///cache/document.pdf",
      });
    });

    it("handles share cancellation gracefully", async () => {
      isNativeMock.mockReturnValue(true);
      stubNativeFileReader();
      writeFileMock.mockResolvedValue({ uri: "file:///cache/doc.pdf" });
      shareMock.mockRejectedValue(new Error("canceled"));

      const { downloadFile } = await import("@/services/download.service");
      await expect(
        downloadFile("https://example.com/doc.pdf", "doc.pdf"),
      ).resolves.toBeUndefined();
    });

    it("rejects when fetch fails", async () => {
      isNativeMock.mockReturnValue(true);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network error")),
      );

      const { downloadFile } = await import("@/services/download.service");
      await expect(
        downloadFile("https://example.com/doc.pdf", "doc.pdf"),
      ).rejects.toThrow("network error");
    });

    it("extracts base64 content from blob via FileReader", async () => {
      isNativeMock.mockReturnValue(true);
      stubNativeFileReader();
      writeFileMock.mockResolvedValue({ uri: "file:///cache/img.png" });
      shareMock.mockResolvedValue(undefined);

      const { downloadFile } = await import("@/services/download.service");
      await downloadFile("https://example.com/img.png", "img.png");

      const writeFileArg = writeFileMock.mock.calls[0][0] as { data: string };
      expect(writeFileArg.data).toBe("dGVzdA==");
      expect(writeFileArg.data).not.toContain(",");
    });
  });
});
