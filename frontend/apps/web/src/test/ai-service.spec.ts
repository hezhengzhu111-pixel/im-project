import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock, putMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/utils/request", () => ({
  http: {
    get: getMock,
    post: postMock,
    put: putMock,
    delete: deleteMock,
  },
}));

// Use a real minimal response type
const makeResponse = (data: unknown) => ({
  code: 200,
  message: "success",
  data,
  success: true,
  timestamp: Date.now(),
});

describe("aiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listKeys", () => {
    it("calls http.get to /ai/keys and normalizes the array", async () => {
      getMock.mockResolvedValue(
        makeResponse([
          { id: "1", provider: "deepseek", keyName: "My Key", isActive: true },
        ]),
      );

      const { aiService } = await import("@/services/ai");
      const result = await aiService.listKeys();

      expect(getMock).toHaveBeenCalledWith("/ai/keys");
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("handles empty response data gracefully", async () => {
      getMock.mockResolvedValue(makeResponse(null));

      const { aiService } = await import("@/services/ai");
      const result = await aiService.listKeys();

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe("createKey", () => {
    it("calls http.post to /ai/keys with provider and apiKey", async () => {
      postMock.mockResolvedValue(
        makeResponse({
          id: "2",
          provider: "openai",
          keyName: "GPT Key",
          isActive: false,
        }),
      );

      const { aiService } = await import("@/services/ai");
      const result = await aiService.createKey({
        provider: "openai",
        apiKey: "sk-test",
      });

      expect(postMock).toHaveBeenCalledWith("/ai/keys", {
        provider: "openai",
        apiKey: "sk-test",
      });
      expect(result.data).toBeDefined();
    });

    it("includes keyName when provided", async () => {
      postMock.mockResolvedValue(
        makeResponse({
          id: "3",
          provider: "minimax",
          keyName: "My MiniMax",
          isActive: true,
        }),
      );

      const { aiService } = await import("@/services/ai");
      await aiService.createKey({
        provider: "minimax",
        apiKey: "mm-key",
        keyName: "My MiniMax",
      });

      expect(postMock).toHaveBeenCalledWith("/ai/keys", {
        provider: "minimax",
        apiKey: "mm-key",
        keyName: "My MiniMax",
      });
    });
  });

  describe("updateKey", () => {
    it("calls http.put to /ai/keys/:id with update data", async () => {
      putMock.mockResolvedValue(
        makeResponse({
          id: "1",
          provider: "deepseek",
          keyName: "Updated Key",
        }),
      );

      const { aiService } = await import("@/services/ai");
      await aiService.updateKey("1", { keyName: "Updated Key" });

      expect(putMock).toHaveBeenCalledWith("/ai/keys/1", {
        keyName: "Updated Key",
      });
    });

    it("can update apiKey", async () => {
      putMock.mockResolvedValue(
        makeResponse({
          id: "1",
          provider: "deepseek",
        }),
      );

      const { aiService } = await import("@/services/ai");
      await aiService.updateKey("1", { apiKey: "new-sk-test" });

      expect(putMock).toHaveBeenCalledWith("/ai/keys/1", {
        apiKey: "new-sk-test",
      });
    });
  });

  describe("deleteKey", () => {
    it("calls http.delete to /ai/keys/:id", async () => {
      deleteMock.mockResolvedValue(makeResponse({ deleted: true }));

      const { aiService } = await import("@/services/ai");
      const result = await aiService.deleteKey("5");

      expect(deleteMock).toHaveBeenCalledWith("/ai/keys/5");
      expect(result.data.deleted).toBe(true);
    });
  });

  describe("testKey", () => {
    it("calls http.post to /ai/keys/:id/test", async () => {
      postMock.mockResolvedValue(
        makeResponse({ validateStatus: "ok" }),
      );

      const { aiService } = await import("@/services/ai");
      const result = await aiService.testKey("3");

      expect(postMock).toHaveBeenCalledWith("/ai/keys/3/test");
      expect(result.data.validateStatus).toBe("ok");
    });
  });

  describe("getSettings", () => {
    it("calls http.get to /ai/settings", async () => {
      getMock.mockResolvedValue(
        makeResponse({
          autoReplyEnabled: true,
          autoReplyPersona: "Friendly assistant",
        }),
      );

      const { aiService } = await import("@/services/ai");
      const result = await aiService.getSettings();

      expect(getMock).toHaveBeenCalledWith("/ai/settings");
      expect(result.data.autoReplyEnabled).toBe(true);
    });
  });

  describe("updateSettings", () => {
    it("calls http.put to /ai/settings with partial data", async () => {
      putMock.mockResolvedValue(
        makeResponse({
          autoReplyEnabled: false,
          autoReplyPersona: "Professional helper",
        }),
      );

      const { aiService } = await import("@/services/ai");
      const result = await aiService.updateSettings({
        autoReplyEnabled: false,
        autoReplyPersona: "Professional helper",
      });

      expect(putMock).toHaveBeenCalledWith("/ai/settings", {
        autoReplyEnabled: false,
        autoReplyPersona: "Professional helper",
      });
      expect(result.data.autoReplyEnabled).toBe(false);
    });

    it("can update just autoReplyEnabled", async () => {
      putMock.mockResolvedValue(
        makeResponse({
          autoReplyEnabled: true,
          autoReplyPersona: "Existing persona",
        }),
      );

      const { aiService } = await import("@/services/ai");
      await aiService.updateSettings({ autoReplyEnabled: true });

      expect(putMock).toHaveBeenCalledWith("/ai/settings", {
        autoReplyEnabled: true,
      });
    });
  });

  describe("type exports", () => {
    it("re-exports AiApiKey and AiSettings types", async () => {
      const mod = await import("@/services/ai");
      // These should be type-only re-exports, but the module must load without error
      expect(mod.aiService).toBeDefined();
    });
  });
});
