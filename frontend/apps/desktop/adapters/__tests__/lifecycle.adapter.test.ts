import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { listen } from "@tauri-apps/api/event";
import { TauriLifecycleAdapter } from "../lifecycle.adapter";

const mockListen = vi.mocked(listen);

describe("TauriLifecycleAdapter", () => {
  const adapter = new TauriLifecycleAdapter();
  beforeEach(() => vi.clearAllMocks());

  it("onForeground registers via listen", () => {
    adapter.onForeground(() => {});
    expect(mockListen).toHaveBeenCalledWith("tauri://resume", expect.any(Function));
  });

  it("onBackground registers via listen", () => {
    adapter.onBackground(() => {});
    expect(mockListen).toHaveBeenCalledWith("tauri://close-requested", expect.any(Function));
  });
});
