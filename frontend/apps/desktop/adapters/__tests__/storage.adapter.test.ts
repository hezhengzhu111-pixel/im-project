import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { TauriSecureStorageAdapter } from "../storage.adapter";

const mockInvoke = vi.mocked(invoke);

describe("TauriSecureStorageAdapter", () => {
  const adapter = new TauriSecureStorageAdapter();

  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("getItem calls invoke with correct key", async () => {
    mockInvoke.mockResolvedValue("test-token");
    const result = await adapter.getItem("im_access_token");
    expect(mockInvoke).toHaveBeenCalledWith("secure_store_get", { key: "im_access_token" });
    expect(result).toBe("test-token");
  });

  it("getItem returns null for missing key", async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await adapter.getItem("nonexistent");
    expect(result).toBeNull();
  });

  it("setItem calls invoke with key and value", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await adapter.setItem("im_access_token", "abc123");
    expect(mockInvoke).toHaveBeenCalledWith("secure_store_set", {
      key: "im_access_token",
      value: "abc123",
    });
  });

  it("removeItem calls invoke with correct key", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await adapter.removeItem("im_access_token");
    expect(mockInvoke).toHaveBeenCalledWith("secure_store_remove", {
      key: "im_access_token",
    });
  });
});
