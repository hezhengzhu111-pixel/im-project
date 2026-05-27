import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return { default: { create: vi.fn(() => mockInstance) } };
});

import axios from "axios";
import { TauriHttpClientAdapter } from "../http.adapter";

describe("TauriHttpClientAdapter", () => {
  const adapter = new TauriHttpClientAdapter();
  const mockInstance = vi.mocked(axios.create()) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("get calls axios get", async () => {
    mockInstance.get.mockResolvedValue({ data: { id: 1 } });
    const result = await adapter.get<{ id: number }>("/user/profile");
    expect(mockInstance.get).toHaveBeenCalled();
    expect(result).toEqual({ id: 1 });
  });

  it("post calls axios post", async () => {
    mockInstance.post.mockResolvedValue({ data: { ok: true } });
    await adapter.post("/message/send", { text: "hello" });
    expect(mockInstance.post).toHaveBeenCalledWith("/message/send", { text: "hello"}, expect.any(Object));
  });
});
